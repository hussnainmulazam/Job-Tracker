"""
Unit tests for the dual-layer caching system, cache invalidation, and optional vector service.
"""
import time
import uuid
import pytest
from app.services.cache_service import CacheService
from app.services.vector_service import VectorService


def test_cache_service_l1_ram_basic_get_set():
    """Verify L1 RAM caching works without Redis."""
    cache = CacheService(maxsize=100, default_ttl=5)
    test_key = f"test:key:{uuid.uuid4()}"

    # Cache miss
    assert cache.get(test_key) is None
    assert cache._misses >= 1

    # Cache set & hit
    assert cache.set(test_key, {"name": "Test Item", "number": 42}, ttl=10) is True
    val = cache.get(test_key)
    assert val is not None
    assert val["name"] == "Test Item"
    assert val["number"] == 42
    assert cache._hits >= 1


def test_cache_service_ttl_expiration():
    """Verify keys expire according to their TTL."""
    cache = CacheService(maxsize=100, default_ttl=1)
    key = f"test:expire:{uuid.uuid4()}"

    cache.set(key, "temporary_value", ttl=1)
    assert cache.get(key) == "temporary_value"

    # Wait for TTL expiration
    time.sleep(1.1)
    assert cache.get(key) is None


def test_cache_service_prefix_invalidation():
    """Verify delete_prefix clears all related keys on write."""
    cache = CacheService(maxsize=100, default_ttl=60)
    user_id = str(uuid.uuid4())

    key1 = f"templates:user:{user_id}"
    key2 = f"templates:user:{user_id}:draft"
    key3 = f"templates:user:other_user"

    cache.set(key1, {"tpl": "welcome"}, ttl=60)
    cache.set(key2, {"tpl": "draft"}, ttl=60)
    cache.set(key3, {"tpl": "other"}, ttl=60)

    assert cache.get(key1) is not None
    assert cache.get(key2) is not None
    assert cache.get(key3) is not None

    # Invalidate exact user templates on Save Templates
    cache.delete_prefix(f"templates:user:{user_id}")

    # Specific user's keys are cleared immediately
    assert cache.get(key1) is None
    assert cache.get(key2) is None
    # Other user remains cached
    assert cache.get(key3) is not None


def test_cache_service_security_blocks_tokens_and_bodies():
    """Verify the cache rejects tokens and raw email bodies."""
    cache = CacheService(maxsize=100, default_ttl=60)

    # 1. Reject key with token
    assert cache.set("auth:jwt_token:123", "secret_jwt") is False
    assert cache.get("auth:jwt_token:123") is None

    # 2. Reject key with email_body
    assert cache.set("candidate:email_body:abc", "Hello Candidate Body") is False
    assert cache.get("candidate:email_body:abc") is None

    # 3. Sanitize dictionary containing access_token / body_html
    payload = {
        "user_id": "u-123",
        "access_token": "secret-oauth-token-12345",
        "safe_data": "Allowed Public Info",
        "body_html": "<p>Confidential text</p>",
    }
    cache.set("user:profile:test_sanitize", payload, ttl=60)
    cached = cache.get("user:profile:test_sanitize")
    assert cached is not None
    assert cached["safe_data"] == "Allowed Public Info"
    assert "access_token" not in cached
    assert "body_html" not in cached


def test_health_cache_endpoint_returns_counts_only():
    """Verify /health/cache returns only metrics without private data."""
    from app.routers.health import health_cache_check

    data = health_cache_check()
    assert data["status"] == "healthy"
    assert "hits" in data
    assert "misses" in data
    assert "hit_ratio" in data
    assert "l1_keys_count" in data
    assert "l2_enabled" in data
    assert "l2_connected" in data
    # Ensure NO data payloads or keys exist in health response
    assert "data" not in data
    assert "keys" not in data


def test_write_invalidates_exact_cache_keys():
    """Verify write operations invalidate exact related keys."""
    from app.services.cache_service import cache_service
    user_id = uuid.uuid4()
    opening_id = uuid.uuid4()

    # 1. Templates caching and invalidation
    tpl_key = f"templates:user:{user_id}"
    cache_service.set(tpl_key, {"invite": {"subject": "Old Subject"}}, ttl=300)
    assert cache_service.get(tpl_key) is not None

    # Simulate Save Templates write
    from app.services.template_service import clear_user_template_cache
    clear_user_template_cache(user_id)
    assert cache_service.get(tpl_key) is None

    # 2. Requisition caching and invalidation
    req_key = f"requisition:detail:{opening_id}"
    req_list_key = f"requisition:list:{user_id}:all:0:50"
    cache_service.set(req_key, {"title": "Software Engineer"}, ttl=180)
    cache_service.set(req_list_key, {"items": []}, ttl=60)
    assert cache_service.get(req_key) is not None
    assert cache_service.get(req_list_key) is not None

    # Simulate Requisition update
    cache_service.delete(req_key)
    cache_service.delete_prefix(f"requisition:list:{user_id}")
    assert cache_service.get(req_key) is None
    assert cache_service.get(req_list_key) is None

    # 3. Calendar events caching and invalidation
    cal_key = f"calendar:events:{user_id}:2026-11-20:2026-11-27"
    cache_service.set(cal_key, {"events": []}, ttl=60)
    assert cache_service.get(cal_key) is not None

    # Simulate cancel/reschedule interview
    from app.services.calendar_cache import calendar_cache
    calendar_cache.clear_for_user(str(user_id))
    assert cache_service.get(cal_key) is None


def test_vector_service_graceful_when_disabled():
    """Verify the vector service falls back gracefully when disabled."""
    service = VectorService()
    if not service.is_enabled():
        assert service.index_candidate_cv("cand-1", "John", "CV text") is False
        assert service.match_cv_to_job("CV text", "Job Description") is None
        assert service.find_similar_candidates("cand-1") == []
    else:
        # If enabled in environment, verify cosine math is non-crashing
        score = service.match_cv_to_job("Python FastAPI developer", "Seeking Python engineer with FastAPI")
        assert score is not None
        assert 0.0 <= score <= 100.0
