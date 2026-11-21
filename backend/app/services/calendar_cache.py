"""
app/services/calendar_cache.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Calendar cache helper integrated with the unified dual-layer cache_service (L1 RAM + L2 Redis).
TTL = 60 seconds.
Cleared immediately when an interview is created, updated, rescheduled, or cancelled.
"""
from typing import Any, Optional
from app.services.cache_service import cache_service

CALENDAR_CACHE_TTL = 60


class CalendarCache:
    def _make_key(self, user_id: str, start: str, end: str) -> str:
        return f"calendar:events:{user_id}:{start}:{end}"

    def get(self, user_id: str, start: str, end: str) -> Optional[Any]:
        key = self._make_key(user_id, start, end)
        return cache_service.get(key)

    def set(self, user_id: str, start: str, end: str, data: Any) -> None:
        key = self._make_key(user_id, start, end)
        cache_service.set(key, data, ttl=CALENDAR_CACHE_TTL)

    def clear_for_user(self, user_id: str) -> None:
        prefix = f"calendar:events:{user_id}:"
        cache_service.delete_prefix(prefix)

    def clear_all(self) -> None:
        cache_service.delete_prefix("calendar:events:")


calendar_cache = CalendarCache()
