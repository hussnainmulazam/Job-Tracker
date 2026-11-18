"""
In-memory sliding window rate limiter for FastAPI endpoints.
Protects sensitive endpoints (auth, public booking, WhatsApp messages, AI scoring, webhooks)
against abuse and denial of service, returning HTTP 429 Too Many Requests.
"""
import time
from collections import defaultdict
from typing import Callable, Dict, List, Optional
from fastapi import HTTPException, Request, Response, status

# In-memory sliding window store: key -> list of float timestamps (UTC epochs)
_rate_limit_records: Dict[str, List[float]] = defaultdict(list)


def reset_rate_limits() -> None:
    """Clears all in-memory rate limit counters (useful for unit tests)."""
    _rate_limit_records.clear()


class RateLimiter:
    """
    FastAPI dependency for sliding-window rate limiting.
    
    Usage:
        @router.post("/login", dependencies=[Depends(RateLimiter(times=5, seconds=60))])
    """

    def __init__(self, times: int, seconds: int, scope: Optional[str] = None):
        self.times = times
        self.seconds = seconds
        self.scope = scope

    async def __call__(self, request: Request, response: Response):
        # Allow disabling rate limits if explicitly set via environment for specific large load tests
        import os
        if os.getenv("DISABLE_RATE_LIMITS") == "true":
            return

        now = time.time()
        client_host = request.client.host if request.client else "unknown"
        forwarded_for = request.headers.get("x-forwarded-for")
        client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else client_host

        # Build bucket key
        scope_name = self.scope or request.url.path
        bucket_key = f"{client_ip}:{scope_name}"

        # Clean timestamps older than window
        cutoff = now - self.seconds
        timestamps = _rate_limit_records[bucket_key]
        _rate_limit_records[bucket_key] = [ts for ts in timestamps if ts > cutoff]

        current_count = len(_rate_limit_records[bucket_key])
        if current_count >= self.times:
            oldest = _rate_limit_records[bucket_key][0]
            retry_after = max(1, int(oldest + self.seconds - now))
            response.headers["Retry-After"] = str(retry_after)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded: maximum {self.times} requests per {self.seconds}s. Please retry in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )

        # Record this request
        _rate_limit_records[bucket_key].append(now)


def rate_limit(times: int, seconds: int, scope: Optional[str] = None) -> RateLimiter:
    """Factory function returning a RateLimiter dependency."""
    return RateLimiter(times=times, seconds=seconds, scope=scope)
