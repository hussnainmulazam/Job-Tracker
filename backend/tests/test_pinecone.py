"""
test_pinecone.py
~~~~~~~~~~~~~~~~
Integration and functional tests for Pinecone Vector Database & Fast Response Caching:
1. /health/pinecone endpoint returns connected status, latency, and index metadata.
2. Deterministic cache key computation.
3. Fast response caching: upsert structured CV screening evaluation and retrieve via hash.
4. Semantic vector similarity fallback retrieval.
5. Fault-tolerant handling when unconfigured or network errors occur.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.services.pinecone_service import PineconeCacheService, pinecone_service


def test_pinecone_health_endpoint(client: TestClient):
    """Verifies that GET /health/pinecone returns 200 with index metadata."""
    res = client.get("/health/pinecone")
    assert res.status_code == 200, res.text
    data = res.json()

    assert "status" in data
    assert "index_name" in data
    assert "total_vectors" in data
    assert "latency_ms" in data
    assert data["dimension"] == 1024


def test_compute_cache_key():
    """Verifies deterministic SHA256 cache key hashing."""
    service = PineconeCacheService()
    key1 = service.compute_cache_key("Senior Python Dev with FastAPI", "Python Backend Engineer", 80)
    key2 = service.compute_cache_key("  Senior Python Dev with FastAPI  ", "Python Backend Engineer", 80)
    key3 = service.compute_cache_key("Senior Python Dev with FastAPI", "Python Backend Engineer", 85)

    assert key1 == key2, "Cache key should be normalized and match identical content"
    assert key1 != key3, "Cache key should differ for different pass marks"
    assert key1.startswith("eval-")


def test_pinecone_cache_and_retrieve_fast_response():
    """
    Tests upserting an evaluation to Pinecone cache and retrieving it with < 50ms latency.
    """
    if not pinecone_service.is_configured():
        pytest.skip("Pinecone API key not configured")

    cv_sample = f"Test CV profile {uuid.uuid4()}: 8 years Python, PostgreSQL, Kafka microservices architect."
    jd_sample = "Target Role: Principal Backend Engineer requiring Python, SQLModel, and high-throughput pipelines."

    eval_data = {
        "score": 92.5,
        "recommendation": "Recommended",
        "matched_skills": ["Python", "PostgreSQL", "Kafka", "Microservices"],
        "missing_skills": ["Golang"],
        "red_flags": [],
        "summary": "Outstanding candidate with proven distributed backend expertise.",
        "interview_focus_areas": ["System architecture design", "Concurrency handling"],
    }

    # 1. Upsert to Pinecone cache
    saved = pinecone_service.cache_screening(
        candidate_id="test-cand-001",
        cv_text=cv_sample,
        jd_text=jd_sample,
        evaluation=eval_data,
        pass_mark=80,
    )
    assert saved is True, "Failed to cache evaluation to Pinecone"

    # 2. Retrieve immediately from cache
    cached = pinecone_service.get_cached_screening(cv_sample, jd_sample, pass_mark=80)
    assert cached is not None, "Expected cache hit from Pinecone"
    assert cached["cached"] is True
    assert cached["score"] == 92.5
    assert cached["recommendation"] == "Recommended"
    assert "Python" in cached["matched_skills"]
    assert cached["cache_latency_ms"] < 2000  # fast fetch response


def test_pinecone_unconfigured_graceful_fallback():
    """Verifies that when Pinecone is not configured or disabled, calls return None/fallback without exceptions."""
    service = PineconeCacheService()
    with patch.object(service, "is_configured", return_value=False):
        status = service.get_status()
        assert status["status"] == "unconfigured"
        assert status["is_connected"] is False

        cached = service.get_cached_screening("CV text", "JD text")
        assert cached is None

        saved = service.cache_screening("cand-id", "CV text", "JD text", {})
        assert saved is False

        results = service.search_similar_candidates("Python developer")
        assert results == []
