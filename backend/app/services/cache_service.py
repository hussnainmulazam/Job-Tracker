"""
app/services/cache_service.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
High-performance dual-layer cache helper:
  - L1: In-process LRU cache with TTL (cachetools.TTLCache) with thread safety.
  - L2: Optional Redis cache, activated only if REDIS_URL is configured.
  - Graceful fallback: without Redis, operates seamlessly in RAM-only mode.
  - Hit/miss metrics and structured logging.
  - Strict security guardrails: NEVER caches tokens or email bodies.
"""
import json
import logging
import os
import re
import threading
import time
from datetime import date, datetime
from typing import Any, Callable, Dict, List, Optional, Tuple, Union
import uuid

import cachetools

logger = logging.getLogger(__name__)

# Security: patterns that must NEVER be stored in the cache
FORBIDDEN_KEY_PATTERNS = re.compile(r"(token|secret|password|credential|jwt|auth_token|email_body)", re.IGNORECASE)
FORBIDDEN_VALUE_FIELDS = {
    "access_token",
    "refresh_token",
    "token",
    "hashed_password",
    "password",
    "jwt",
    "raw_token",
    "client_secret",
    "google_encryption_key",
    "jwt_secret_key",
    "email_body",
    "body_html",
    "body_text",
}


class _JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, uuid.UUID):
            return str(o)
        if hasattr(o, "model_dump"):
            return o.model_dump()
        if hasattr(o, "dict"):
            return o.dict()
        return super().default(o)


class CacheService:
    def __init__(self, maxsize: int = 10000, default_ttl: int = 300):
        self.default_ttl = default_ttl
        # L1 In-Memory LRU Cache
        self._l1_cache: cachetools.TTLCache = cachetools.TTLCache(maxsize=maxsize, ttl=3600 * 24)
        # Store explicit expiration timestamp: key -> (value, expire_at)
        self._lock = threading.RLock()

        # Metrics
        self._hits: int = 0
        self._misses: int = 0
        self._l1_hits: int = 0
        self._l2_hits: int = 0
        self._sets: int = 0
        self._deletes: int = 0

        # L2 Redis Cache (optional)
        self._redis_client = None
        self._l2_enabled: bool = False
        self._init_redis()

    def _init_redis(self) -> None:
        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            try:
                from app.core.config import settings
                redis_url = getattr(settings, "REDIS_URL", None)
            except Exception:
                redis_url = None

        if redis_url and redis_url.strip():
            try:
                import redis
                self._redis_client = redis.from_url(
                    redis_url.strip(),
                    decode_responses=True,
                    socket_connect_timeout=2.0,
                    socket_timeout=2.0,
                )
                self._redis_client.ping()
                self._l2_enabled = True
                logger.info("L2 Redis cache successfully connected: %s", redis_url.split("@")[-1])
            except Exception as exc:
                logger.warning("Redis configured at REDIS_URL but connection failed: %s. Operating with L1 RAM cache only.", exc)
                self._redis_client = None
                self._l2_enabled = False
        else:
            self._l2_enabled = False
            logger.info("REDIS_URL not configured. Operating with L1 RAM-only cache.")

    def _is_l2_connected(self) -> bool:
        if not self._l2_enabled or not self._redis_client:
            return False
        try:
            return bool(self._redis_client.ping())
        except Exception:
            return False

    def _sanitize_value(self, value: Any) -> Any:
        """Strips sensitive credential or email body fields if present in dictionary or list."""
        if isinstance(value, dict):
            sanitized = {}
            for k, v in value.items():
                if k.lower() in FORBIDDEN_VALUE_FIELDS:
                    continue
                sanitized[k] = self._sanitize_value(v)
            return sanitized
        if isinstance(value, list):
            return [self._sanitize_value(item) for item in value]
        return value

    def get(self, key: str) -> Optional[Any]:
        """
        Retrieves a value from L1 or L2 cache.
        Returns None on cache miss.
        """
        now = time.time()

        # 1. Check L1 In-Memory LRU Cache
        with self._lock:
            if key in self._l1_cache:
                entry = self._l1_cache.get(key)
                if entry is not None:
                    cached_val, expires_at = entry
                    if expires_at > now:
                        self._hits += 1
                        self._l1_hits += 1
                        logger.info("Cache HIT [L1-RAM]: key='%s'", key)
                        return cached_val
                    else:
                        # Expired entry in L1
                        self._l1_cache.pop(key, None)

        # 2. Check L2 Redis Cache (if enabled)
        if self._l2_enabled and self._redis_client:
            try:
                raw_data = self._redis_client.get(key)
                if raw_data is not None:
                    ttl_remaining = self._redis_client.ttl(key)
                    if ttl_remaining is None or ttl_remaining < 0:
                        ttl_remaining = self.default_ttl
                    
                    data = json.loads(raw_data)
                    self._hits += 1
                    self._l2_hits += 1
                    logger.info("Cache HIT [L2-Redis]: key='%s'", key)

                    # Populate back into L1 for faster subsequent lookups
                    with self._lock:
                        self._l1_cache[key] = (data, now + ttl_remaining)

                    return data
            except Exception as exc:
                logger.warning("L2 Redis get error for key '%s': %s. Bypassing L2.", key, exc)

        # 3. Cache Miss
        self._misses += 1
        logger.info("Cache MISS: key='%s'", key)
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Saves a value to L1 and L2 cache.
        Enforces security checks: refuses to cache sensitive credentials or email bodies.
        """
        # Security Guardrail 1: Disallow storing under sensitive key names
        if FORBIDDEN_KEY_PATTERNS.search(key):
            logger.warning("Cache set blocked for sensitive key name: '%s'", key)
            return False

        effective_ttl = ttl if ttl is not None and ttl > 0 else self.default_ttl
        now = time.time()
        expire_at = now + effective_ttl

        # Security Guardrail 2: Sanitize value against credential/body leakage
        clean_value = self._sanitize_value(value)

        # 1. Write to L1 In-Memory LRU Cache
        with self._lock:
            self._l1_cache[key] = (clean_value, expire_at)
            self._sets += 1

        # 2. Write to L2 Redis Cache (if enabled)
        if self._l2_enabled and self._redis_client:
            try:
                serialized = json.dumps(clean_value, cls=_JSONEncoder)
                self._redis_client.set(key, serialized, ex=int(effective_ttl))
            except Exception as exc:
                logger.warning("L2 Redis set error for key '%s': %s", key, exc)

        return True

    def delete(self, key: str) -> bool:
        """Invalidates a specific cache key across both L1 and L2 layers."""
        with self._lock:
            self._l1_cache.pop(key, None)
            self._deletes += 1

        if self._l2_enabled and self._redis_client:
            try:
                self._redis_client.delete(key)
            except Exception as exc:
                logger.warning("L2 Redis delete error for key '%s': %s", key, exc)

        logger.info("Cache INVALIDATE: key='%s'", key)
        return True

    def delete_prefix(self, prefix: str) -> int:
        """
        Invalidates all keys starting with `prefix` across both L1 and L2 layers.
        Used on mutations (e.g. Save Templates, cancel interview) to invalidate exact related keys.
        """
        deleted_count = 0

        # 1. Invalidate matching L1 keys
        with self._lock:
            matching_l1 = [k for k in list(self._l1_cache.keys()) if k.startswith(prefix)]
            for k in matching_l1:
                self._l1_cache.pop(k, None)
            deleted_count += len(matching_l1)
            self._deletes += len(matching_l1)

        # 2. Invalidate matching L2 Redis keys (if enabled)
        if self._l2_enabled and self._redis_client:
            try:
                pattern = f"{prefix}*"
                cursor = 0
                while True:
                    cursor, keys = self._redis_client.scan(cursor=cursor, match=pattern, count=100)
                    if keys:
                        self._redis_client.delete(*keys)
                        deleted_count += len(keys)
                    if cursor == 0:
                        break
            except Exception as exc:
                logger.warning("L2 Redis delete_prefix error for pattern '%s*': %s", prefix, exc)

        logger.info("Cache INVALIDATE PREFIX: prefix='%s' (cleared %d keys)", prefix, deleted_count)
        return deleted_count

    def clear(self) -> None:
        """Flushes all cached entries."""
        with self._lock:
            self._l1_cache.clear()

        if self._l2_enabled and self._redis_client:
            try:
                self._redis_client.flushdb()
            except Exception as exc:
                logger.warning("L2 Redis flush error: %s", exc)

    def get_stats(self) -> Dict[str, Any]:
        """
        Returns runtime caching statistics.
        Counts only (hits, misses, hit_ratio, l1_keys_count, l2_enabled, l2_connected) - NO private data.
        """
        total_queries = self._hits + self._misses
        ratio = round(self._hits / total_queries, 4) if total_queries > 0 else 0.0

        with self._lock:
            now = time.time()
            active_l1_keys = sum(1 for _, expire_at in self._l1_cache.values() if expire_at > now)

        return {
            "status": "healthy",
            "hits": self._hits,
            "misses": self._misses,
            "hit_ratio": ratio,
            "l1_hits": self._l1_hits,
            "l2_hits": self._l2_hits,
            "l1_keys_count": active_l1_keys,
            "l2_enabled": self._l2_enabled,
            "l2_connected": self._is_l2_connected(),
        }


# Singleton cache service instance
cache_service = CacheService()
