"""Services package."""
from app.services.auth_service import auth_service
from app.services.job_opening_service import job_opening_service, JobOpeningService
from app.services.candidate_service import candidate_service, CandidateService
from app.services.scorecard_service import scorecard_service, ScorecardService
from app.services.dashboard_service import dashboard_service, DashboardService
from app.services.ai import (
    screen_candidate_cv,
    generate_recruiter_interview_questions,
    check_models_health,
)

__all__ = [
    "auth_service",
    "job_opening_service",
    "JobOpeningService",
    "candidate_service",
    "CandidateService",
    "scorecard_service",
    "ScorecardService",
    "dashboard_service",
    "DashboardService",
    "screen_candidate_cv",
    "generate_recruiter_interview_questions",
    "check_models_health",
]
