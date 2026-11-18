"""
app/routers/ai.py
~~~~~~~~~~~~~~~~~
AI endpoints for Candidate Screening, Fit Scoring, and Interview Question Generation
powered by OpenRouter.

Endpoints:
  POST /ai/screen-candidate
  POST /ai/interview-questions
  GET  /ai/models/health
"""
from fastapi import APIRouter, status

from app.core.dependencies import CurrentUser
from app.schemas.ai import (
    AIModelsHealthResponse,
    CandidateScreenRequest,
    CandidateScreenResponse,
    RecruiterInterviewQuestionsRequest,
    RecruiterInterviewQuestionsResponse,
)
from app.services.ai import (
    check_models_health,
    generate_recruiter_interview_questions,
    screen_candidate_cv,
)

router = APIRouter(prefix="/ai", tags=["AI"])


@router.get(
    "/models/health",
    response_model=AIModelsHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Probe status and latency of configured OpenRouter models",
)
async def get_models_health() -> AIModelsHealthResponse:
    """
    Probe all configured OpenRouter free model chains (screening, extraction, questions, drafts, vision)
    by sending a minimal test prompt. Returns ok/fail, latency_ms, and error_type.
    """
    return await check_models_health()


@router.post(
    "/screen-candidate",
    response_model=CandidateScreenResponse,
    status_code=status.HTTP_200_OK,
    summary="Screen a candidate CV against a Job Opening with AI",
    responses={
        200: {"description": "Candidate evaluation and fit score"},
        429: {"description": "AI provider rate limit reached"},
        502: {"description": "AI provider upstream error"},
        503: {"description": "AI service not configured (missing API key)"},
        504: {"description": "AI request timed out"},
    },
)
async def screen_candidate_endpoint(
    body: CandidateScreenRequest,
    current_user: CurrentUser,
) -> CandidateScreenResponse:
    """
    Screen candidate CV text against job requirements.
    Calculates fit score (0-100), matched & missing skills, summary, and interview focus areas.
    """
    result = await screen_candidate_cv(
        job_title=body.job_title,
        job_description=body.job_description,
        required_skills=body.required_skills,
        candidate_name=body.candidate_name or "Candidate",
        cv_text=body.cv_text,
    )
    return CandidateScreenResponse(
        score=result["score"],
        matched_skills=result["matched_skills"],
        missing_skills=result["missing_skills"],
        summary=result["summary"],
        recommendation=result["recommendation"],
        interview_focus_areas=result["interview_focus_areas"],
        model_used=result.get("model_used"),
        latency_seconds=result.get("latency_seconds"),
    )


@router.post(
    "/interview-questions",
    response_model=RecruiterInterviewQuestionsResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate targeted interview questions for recruiter",
    responses={
        200: {"description": "Successfully generated interview questions"},
        429: {"description": "AI provider rate limit reached"},
        502: {"description": "AI provider upstream error"},
        503: {"description": "AI service not configured (missing API key)"},
        504: {"description": "AI request timed out"},
    },
)
async def create_recruiter_interview_questions(
    body: RecruiterInterviewQuestionsRequest,
    current_user: CurrentUser,
) -> RecruiterInterviewQuestionsResponse:
    """
    Generate tailored interview questions based on the job opening and optional candidate CV.
    Targeted for recruiters and interviewers to probe technical depth and potential gaps.
    """
    questions = await generate_recruiter_interview_questions(
        job_title=body.job_title,
        job_description=body.job_description,
        candidate_cv=body.candidate_cv,
        count=body.count,
    )
    return RecruiterInterviewQuestionsResponse(questions=questions)
