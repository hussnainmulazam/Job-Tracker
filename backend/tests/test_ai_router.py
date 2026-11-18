"""
tests/test_ai_router.py
~~~~~~~~~~~~~~~~~~~~~~~
Unit and integration tests for app.services.ai_router:
1. 429 daily limit reached -> 1-hour lockout & friendly error
2. Timeout handling -> moves to next model or raises 504
3. Invalid JSON with repair retry -> repair prompt succeeds
4. Success on second model in chain -> first model fails (500), second succeeds
5. All models failing -> sanitized error message (no provider URLs or internal model names)
6. Reasoning tags stripping -> removes <think>...</think> blocks
7. Per-minute rate limit -> short backoff and continues to next model
"""
import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from app.schemas.ai import CandidateScreenLLMOutput
from app.services.ai_router import (
    AIRouter,
    ai_router,
    clean_reasoning_and_extract_json,
    clean_reasoning_text,
    clear_daily_limit_lockout,
    is_daily_limit_locked,
    set_daily_limit_lockout,
)


@pytest.fixture(autouse=True)
def reset_lockout():
    """Ensure lockout is reset before and after each test."""
    clear_daily_limit_lockout()
    yield
    clear_daily_limit_lockout()


def test_reasoning_stripping():
    """Test that <think> tags and markdown fences are cleanly stripped."""
    raw_with_think = (
        "<think>\nLet me analyze the candidate's CV against the job description.\n"
        "Score seems to be around 88.\n</think>\n"
        "```json\n"
        '{"score": 88.0, "matched_skills": ["Python"], "missing_skills": ["AWS"], '
        '"summary": "Solid engineer", "recommendation": "Strong Match", "interview_focus_areas": ["Cloud"]}\n'
        "```"
    )
    cleaned = clean_reasoning_and_extract_json(raw_with_think)
    parsed = json.loads(cleaned)
    assert parsed["score"] == 88.0
    assert parsed["matched_skills"] == ["Python"]


def test_clean_reasoning_text():
    """Test text cleaning for plain-text replies (e.g. WhatsApp drafts)."""
    raw = "<think>Drafting message</think>Hello! We would love to interview you."
    cleaned = clean_reasoning_text(raw)
    assert cleaned == "Hello! We would love to interview you."


def test_429_daily_limit_reached():
    """
    Test scenario:
    When OpenRouter returns 429 with daily limit / free-models-per-day,
    it must activate a 1-hour lockout, stop trying other models, and return
    friendly error: 'AI free limit reached for today. Try again later.'
    """
    async def _run():
        router = AIRouter()

        mock_client = MagicMock()
        mock_create = AsyncMock(side_effect=Exception(
            "Error 429: Rate limit exceeded. daily free-models-per-day quota reached for this key."
        ))
        mock_client.chat.completions.create = mock_create

        with patch.object(router, "_get_client", return_value=mock_client):
            with pytest.raises(HTTPException) as exc_info:
                await router.complete_with_chain(
                    task_name="screening",
                    messages=[{"role": "user", "content": "test"}],
                    validation_schema=CandidateScreenLLMOutput,
                    models=["model-1:free", "model-2:free", "model-3:free"],
                )

            assert exc_info.value.status_code == 429
            assert "AI free limit reached for today. Try again later." in exc_info.value.detail
            # Lockout must be active
            assert is_daily_limit_locked()
            # Only 1 model attempt should have occurred (stopped trying other :free models)
            assert mock_create.call_count == 1

            # Subsequent call must immediately fail with 429 without even hitting the client
            with pytest.raises(HTTPException) as second_exc:
                await router.complete_with_chain(
                    task_name="screening",
                    messages=[{"role": "user", "content": "test"}],
                    validation_schema=CandidateScreenLLMOutput,
                    models=["model-1:free"],
                )
            assert second_exc.value.status_code == 429
            assert "AI free limit reached for today. Try again later." in second_exc.value.detail
            assert mock_create.call_count == 1

    asyncio.run(_run())


def test_timeout_fallback_to_next_model():
    """
    Test scenario:
    First model times out (e.g. 60s timeout); router falls back to second model which succeeds.
    """
    async def _run():
        router = AIRouter()

        mock_client = MagicMock()

        # Success choice for 2nd model
        success_choice = MagicMock()
        success_choice.message.content = json.dumps({
            "score": 92.0,
            "matched_skills": ["Python", "FastAPI"],
            "missing_skills": [],
            "summary": "Great match",
            "recommendation": "Strong Match",
            "interview_focus_areas": ["System Design"],
        })
        success_response = MagicMock(choices=[success_choice])

        # 1st call raises timeout, 2nd call succeeds
        mock_create = AsyncMock(side_effect=[
            asyncio.TimeoutError("Request timed out after 60 seconds"),
            success_response,
        ])
        mock_client.chat.completions.create = mock_create

        with patch.object(router, "_get_client", return_value=mock_client):
            result, model_used, latency = await router.complete_with_chain(
                task_name="screening",
                messages=[{"role": "user", "content": "test"}],
                validation_schema=CandidateScreenLLMOutput,
                models=["model-slow:free", "model-fast:free"],
            )

            assert model_used == "model-fast:free"
            assert result.score == 92.0
            assert mock_create.call_count == 2

    asyncio.run(_run())


def test_invalid_json_with_repair_retry():
    """
    Test scenario:
    Model returns malformed JSON on first try; router issues 1 repair retry to the SAME model,
    which returns valid JSON matching the schema.
    """
    async def _run():
        router = AIRouter()

        mock_client = MagicMock()

        # 1st reply: malformed JSON (unterminated or invalid syntax)
        bad_choice = MagicMock()
        bad_choice.message.content = "Here is the result: {score: 75.0, matched_skills: ['Python']"
        bad_response = MagicMock(choices=[bad_choice])

        # 2nd reply: repair call returns valid JSON
        repair_choice = MagicMock()
        repair_choice.message.content = json.dumps({
            "score": 75.0,
            "matched_skills": ["Python"],
            "missing_skills": ["FastAPI"],
            "summary": "Decent candidate with solid fundamentals.",
            "recommendation": "Potential Match",
            "interview_focus_areas": ["API frameworks"],
        })
        repair_response = MagicMock(choices=[repair_choice])

        mock_create = AsyncMock(side_effect=[bad_response, repair_response])
        mock_client.chat.completions.create = mock_create

        with patch.object(router, "_get_client", return_value=mock_client):
            result, model_used, latency = await router.complete_with_chain(
                task_name="screening",
                messages=[{"role": "user", "content": "screen candidate"}],
                validation_schema=CandidateScreenLLMOutput,
                models=["model-primary:free", "model-fallback:free"],
            )

            # Succeeded on the primary model via repair retry!
            assert model_used == "model-primary:free"
            assert result.score == 75.0
            assert mock_create.call_count == 2
            # Verify repair call included error context in prompt
            repair_call_args = mock_create.call_args_list[1]
            sent_messages = repair_call_args.kwargs["messages"]
            assert any("previous response was invalid" in m["content"] for m in sent_messages)

    asyncio.run(_run())


def test_success_on_second_model_in_chain():
    """
    Test scenario:
    Model 1 returns 500 server error; Router immediately tries Model 2 which succeeds.
    """
    async def _run():
        router = AIRouter()

        mock_client = MagicMock()

        success_choice = MagicMock()
        success_choice.message.content = json.dumps({
            "score": 85.0,
            "matched_skills": ["Django", "Postgres"],
            "missing_skills": ["Docker"],
            "summary": "Experienced backend developer.",
            "recommendation": "Potential Match",
            "interview_focus_areas": ["Containerization"],
        })
        success_resp = MagicMock(choices=[success_choice])

        mock_create = AsyncMock(side_effect=[
            Exception("502 Bad Gateway: Upstream provider failed"),
            success_resp,
        ])
        mock_client.chat.completions.create = mock_create

        with patch.object(router, "_get_client", return_value=mock_client):
            result, model_used, latency = await router.complete_with_chain(
                task_name="screening",
                messages=[{"role": "user", "content": "screen"}],
                validation_schema=CandidateScreenLLMOutput,
                models=["model-fail:free", "model-ok:free"],
            )

            assert model_used == "model-ok:free"
            assert result.score == 85.0
            assert mock_create.call_count == 2

    asyncio.run(_run())


def test_all_models_failing_returns_sanitized_error():
    """
    Test scenario:
    All models in chain fail.
    Must raise HTTP 503 with user-friendly sanitized message:
    Never expose raw provider URLs or internal model names to the user.
    """
    async def _run():
        router = AIRouter()

        mock_client = MagicMock()
        mock_create = AsyncMock(side_effect=[
            Exception("503 Backend upstream error at https://provider.com/api/internal"),
            Exception("500 Internal error in nvidia/nemotron-secret"),
        ])
        mock_client.chat.completions.create = mock_create

        with patch.object(router, "_get_client", return_value=mock_client):
            with pytest.raises(HTTPException) as exc_info:
                await router.complete_with_chain(
                    task_name="screening",
                    messages=[{"role": "user", "content": "screen"}],
                    validation_schema=CandidateScreenLLMOutput,
                    models=["model-1:free", "model-2:free"],
                )

            assert exc_info.value.status_code in (502, 503)
            detail = exc_info.value.detail
            # Friendly message
            assert "AI screening service is currently unavailable" in detail
            # Must NOT leak internal URLs or model IDs in user-facing detail
            assert "https://provider.com" not in detail
            assert "nvidia/nemotron-secret" not in detail

    asyncio.run(_run())


def test_per_minute_rate_limit_backoff():
    """
    Test scenario:
    Model 1 returns per-minute 429 (not daily quota);
    Router applies short backoff (1-2s) and continues to Model 2 which succeeds.
    """
    async def _run():
        router = AIRouter()

        mock_client = MagicMock()
        success_choice = MagicMock()
        success_choice.message.content = json.dumps({
            "score": 95.0,
            "matched_skills": ["Python", "FastAPI"],
            "missing_skills": [],
            "summary": "Top tier candidate.",
            "recommendation": "Strong Match",
            "interview_focus_areas": [],
        })
        success_resp = MagicMock(choices=[success_choice])

        mock_create = AsyncMock(side_effect=[
            Exception("429 Too Many Requests: Requests per minute limit exceeded."),
            success_resp,
        ])
        mock_client.chat.completions.create = mock_create

        with patch.object(router, "_get_client", return_value=mock_client):
            with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                result, model_used, latency = await router.complete_with_chain(
                    task_name="screening",
                    messages=[{"role": "user", "content": "screen"}],
                    validation_schema=CandidateScreenLLMOutput,
                    models=["model-ratelimited:free", "model-fallback:free"],
                )

                assert model_used == "model-fallback:free"
                assert result.score == 95.0
                # Backoff was called
                mock_sleep.assert_called_once_with(1.5)
                # Daily limit is NOT locked
                assert not is_daily_limit_locked()

    asyncio.run(_run())
