"""Pydantic schemas package."""
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserPublic,
)
from app.schemas.job_opening import (
    JobOpeningBase,
    JobOpeningCreate,
    JobOpeningRead,
    JobOpeningUpdate,
    PaginatedJobOpenings,
)
from app.schemas.candidate import (
    BulkScoreResponse,
    CandidateBase,
    CandidateCreate,
    CandidateRead,
    CandidateScreeningQuestionsResponse,
    CandidateScreenResult,
    CandidateStageUpdate,
    CandidateUpdate,
    PaginatedCandidates,
)
from app.schemas.ai import (
    AIModelsHealthResponse,
    CandidateScreenRequest,
    CandidateScreenResponse,
    RecruiterInterviewQuestionsRequest,
    RecruiterInterviewQuestionsResponse,
)
from app.schemas.dashboard import DashboardStatsResponse
from app.schemas.google import (
    EmailSyncedRead,
    GmailSyncResponse,
    GoogleAccountStatusResponse,
    GoogleAccountUpdateRequest,
    GoogleAuthUrlResponse,
)

# Helpful aliases
UserCreate = RegisterRequest
UserLogin = LoginRequest
UserRead = UserPublic
Token = TokenResponse

__all__ = [
    # Auth
    "RegisterRequest",
    "LoginRequest",
    "UserPublic",
    "TokenResponse",
    "UserCreate",
    "UserLogin",
    "UserRead",
    "Token",
    # Job Openings
    "JobOpeningBase",
    "JobOpeningCreate",
    "JobOpeningRead",
    "JobOpeningUpdate",
    "PaginatedJobOpenings",
    # Candidates
    "CandidateBase",
    "CandidateCreate",
    "CandidateRead",
    "CandidateUpdate",
    "CandidateStageUpdate",
    "CandidateScreenResult",
    "BulkScoreResponse",
    "CandidateScreeningQuestionsResponse",
    "PaginatedCandidates",
    # AI
    "CandidateScreenRequest",
    "CandidateScreenResponse",
    "RecruiterInterviewQuestionsRequest",
    "RecruiterInterviewQuestionsResponse",
    "AIModelsHealthResponse",
    # Dashboard
    "DashboardStatsResponse",
    # Google
    "GoogleAuthUrlResponse",
    "GoogleAccountStatusResponse",
    "GoogleAccountUpdateRequest",
    "GmailSyncResponse",
    "EmailSyncedRead",
]
