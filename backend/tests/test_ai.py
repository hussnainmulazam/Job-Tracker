"""
tests/test_ai.py
~~~~~~~~~~~~~~~~
Unit and integration tests for OpenRouter AI service:
- Recruiter AI candidate screening (/ai/screen-candidate)
- Interview questions generation (/ai/interview-questions)
- Models health probe (/ai/models/health)
- Strict JSON cleaning and markdown code fence stripping
- Missing OPENROUTER_API_KEY raises HTTP 503
- Pydantic schema validation for screening and questions
- Retry on failure and automatic fallback to MODEL_FALLBACK
- Error aggregation when all models fail
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.services.ai import (
    _clean_json_text,
    check_models_health,
    generate_recruiter_interview_questions,
    screen_candidate_cv,
)


def test_ai_routes_registered():
    """Verify AI routes and /models/health exist in OpenAPI specification."""
    schema = app.openapi()
    paths = schema.get("paths", {})

    assert "/ai/screen-candidate" in paths
    assert "/ai/interview-questions" in paths
    assert "/ai/models/health" in paths
    assert "/api/v1/ai/screen-candidate" in paths
    assert "/api/v1/ai/interview-questions" in paths
    assert "/api/v1/ai/models/health" in paths


def test_clean_json_text():
    """Verify markdown code fence stripping."""
    raw = '```json\n{"score": 85.0, "summary": "Strong candidate."}\n```'
    assert _clean_json_text(raw) == '{"score": 85.0, "summary": "Strong candidate."}'

    plain = '{"questions": ["Q1", "Q2"]}'
    assert _clean_json_text(plain) == plain

    empty = ""
    assert _clean_json_text(empty) == ""


def test_missing_api_key_raises_503():
    """When OPENROUTER_API_KEY is not configured, should raise HTTP 503 Service Unavailable."""
    with patch("app.services.ai.settings.OPENROUTER_API_KEY", ""):
        coro = screen_candidate_cv(
            job_title="Software Engineer",
            job_description="Target Software Engineer job description requiring Python and FastAPI.",
            required_skills=["Python", "FastAPI"],
            candidate_name="Alice",
            cv_text="Base CV text with real software engineering skills and experience.",
        )
        try:
            asyncio.run(coro)
            assert False, "Should have raised HTTPException 503"
        except HTTPException as exc:
            assert exc.status_code == 503
            assert "OpenRouter AI service is not configured" in exc.detail


def test_screen_candidate_cv_success():
    """Verify screen_candidate_cv parses and validates Pydantic model correctly."""
    mock_choice = MagicMock()
    mock_choice.message.content = (
        '```json\n'
        '{\n'
        '  "score": 90.0,\n'
        '  "matched_skills": ["Python", "FastAPI"],\n'
        '  "missing_skills": ["Kubernetes"],\n'
        '  "red_flags": [],\n'
        '  "summary": "Candidate exhibits strong backend engineering fundamentals.",\n'
        '  "recommendation": "Strong Match",\n'
        '  "interview_focus_areas": ["Verify container deployment scale"]\n'
        '}\n'
        '```'
    )
    mock_response = MagicMock(choices=[mock_choice])

    with patch("app.services.ai.settings.OPENROUTER_API_KEY", "test_key"), \
         patch("openai.resources.chat.completions.AsyncCompletions.create", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_response

        result = asyncio.run(screen_candidate_cv(
            job_title="Backend Lead",
            job_description="Looking for Senior Engineer with Python, FastAPI, and PostgreSQL expertise.",
            required_skills=["Python", "FastAPI"],
            candidate_name="Bob Smith",
            cv_text="Senior Engineer with 5 years experience in Python and FastAPI backend architectures.",
        ))

        assert result["score"] == 90.0
        assert "FastAPI" in result["matched_skills"]
        assert "Kubernetes" in result["missing_skills"]
        assert result["recommendation"] == "Strong Match"
        assert "summary" in result


def test_generate_interview_questions_success():
    """Verify generate_recruiter_interview_questions returns list of strings validated by Pydantic."""
    mock_choice = MagicMock()
    mock_choice.message.content = (
        '{\n'
        '  "questions": [\n'
        '    "How do you design connection pooling for PostgreSQL?",\n'
        '    "Explain JWT authentication architecture in FastAPI."\n'
        '  ]\n'
        '}'
    )
    mock_response = MagicMock(choices=[mock_choice])

    with patch("app.services.ai.settings.OPENROUTER_API_KEY", "test_key"), \
         patch("openai.resources.chat.completions.AsyncCompletions.create", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_response

        questions = asyncio.run(generate_recruiter_interview_questions(
            job_title="Backend Lead",
            job_description="Looking for Senior Engineer with Python, FastAPI, and PostgreSQL expertise.",
            candidate_cv="Candidate CV text with Python experience.",
            count=2,
        ))

        assert isinstance(questions, list)
        assert len(questions) == 2
        assert "PostgreSQL" in questions[0]


def test_openrouter_retry_then_fallback_success():
    """If primary model fails on attempt 1 & 2, it should fallback to MODEL_FALLBACK and succeed."""
    mock_fallback_choice = MagicMock()
    mock_fallback_choice.message.content = (
        '{\n'
        '  "questions": ["Fallback Question 1", "Fallback Question 2"]\n'
        '}'
    )
    mock_fallback_response = MagicMock(choices=[mock_fallback_choice])

    call_count = 0

    async def mock_create_side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        model = kwargs.get("model", "")
        if "primary" in model or "lightning" in model:
            raise ValueError("Rate limit / 429 simulated on primary model")
        return mock_fallback_response

    with patch("app.services.ai.settings.OPENROUTER_API_KEY", "test_key"), \
         patch("app.services.ai.settings.MODEL_INTERVIEW", "primary-model:free"), \
         patch("app.services.ai.settings.MODEL_FALLBACK", "fallback-model:free"), \
         patch("openai.resources.chat.completions.AsyncCompletions.create", side_effect=mock_create_side_effect):

        questions = asyncio.run(generate_recruiter_interview_questions(
            job_title="Software Architect",
            job_description="Job Description requiring Python, FastAPI, and PostgreSQL expertise.",
            candidate_cv=None,
            count=2,
        ))

        assert questions == ["Fallback Question 1", "Fallback Question 2"]
        assert call_count >= 2


def test_openrouter_all_models_fail_raises_clear_error():
    """If primary and fallback models all fail, raise clear HTTPException with sanitized message."""
    async def always_fail(*args, **kwargs):
        raise ValueError("Simulated network connection drop")

    with patch("app.services.ai.settings.OPENROUTER_API_KEY", "test_key"), \
         patch("openai.resources.chat.completions.AsyncCompletions.create", side_effect=always_fail):

        try:
            asyncio.run(generate_recruiter_interview_questions(
                job_title="Software Architect",
                job_description="Job Description requiring Python, FastAPI, and PostgreSQL expertise.",
                candidate_cv=None,
                count=2,
            ))
            assert False, "Should have raised HTTPException"
        except HTTPException as exc:
            assert exc.status_code in (502, 504)
            assert "All AI models failed" in exc.detail


def test_check_models_health():
    """Verify check_models_health probes all configured models and returns structured health."""
    mock_choice = MagicMock()
    mock_choice.message.content = '{"status": "ok"}'
    mock_response = MagicMock(choices=[mock_choice])

    with patch("app.services.ai.settings.OPENROUTER_API_KEY", "test_key"), \
         patch("openai.resources.chat.completions.AsyncCompletions.create", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_response

        health = asyncio.run(check_models_health())
        assert health.status == "healthy"
        assert len(health.models) >= 1
        for model_id, item in health.models.items():
            assert item.status == "ok"
            assert item.latency_ms is not None


def test_ai_models_health_endpoint(client: TestClient):
    """GET /ai/models/health returns model health status and latencies."""
    mock_choice = MagicMock()
    mock_choice.message.content = '{"status": "ok"}'
    mock_response = MagicMock(choices=[mock_choice])

    with patch("app.services.ai.settings.OPENROUTER_API_KEY", "test_key"), \
         patch("openai.resources.chat.completions.AsyncCompletions.create", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_response

        res = client.get("/ai/models/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert "models" in data

        res_v1 = client.get("/api/v1/ai/models/health")
        assert res_v1.status_code == 200


def test_ai_endpoints_unauthorized_401(client: TestClient):
    """Calling protected AI endpoints without authentication returns 401 Unauthorized."""
    payload_screen = {
        "job_title": "Backend Dev",
        "job_description": "We are seeking a Senior FastAPI Engineer with SQLModel skills.",
        "cv_text": "Experienced Senior Python Developer with FastAPI background.",
    }
    payload_q = {
        "job_description": "We are seeking a Senior FastAPI Engineer with SQLModel skills.",
        "count": 3,
    }

    assert client.post("/api/v1/ai/screen-candidate", json=payload_screen).status_code == 401
    assert client.post("/ai/screen-candidate", json=payload_screen).status_code == 401
    assert client.post("/api/v1/ai/interview-questions", json=payload_q).status_code == 401
    assert client.post("/ai/interview-questions", json=payload_q).status_code == 401


def test_ai_screen_candidate_endpoint_success(client: TestClient, user_a):
    """POST /api/v1/ai/screen-candidate returns 200 with structured candidate evaluation."""
    mock_payload = {
        "score": 88.0,
        "matched_skills": ["FastAPI", "SQLModel"],
        "missing_skills": ["Docker"],
        "summary": "Solid candidate matching role requirements.",
        "recommendation": "Strong Match",
        "interview_focus_areas": ["Probe containerization experience"],
        "model_used": "nvidia/nemotron-3.5-lightning:free",
        "latency_seconds": 1.25,
    }

    async def mock_screen(*args, **kwargs):
        return mock_payload

    with patch("app.routers.ai.screen_candidate_cv", side_effect=mock_screen):
        res = client.post(
            "/api/v1/ai/screen-candidate",
            json={
                "job_title": "Senior Python Developer",
                "job_description": "Looking for a Senior Python Developer with extensive FastAPI and SQLModel experience.",
                "required_skills": ["FastAPI", "SQLModel"],
                "candidate_name": "John Doe",
                "cv_text": "Experienced Senior Software Engineer with Python and FastAPI background.",
            },
            headers=user_a["headers"],
        )
        assert res.status_code == 200
        data = res.json()
        assert data["score"] == 88.0
        assert "FastAPI" in data["matched_skills"]
        assert data["recommendation"] == "Strong Match"
