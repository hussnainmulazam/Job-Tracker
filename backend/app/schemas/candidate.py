"""Candidate schemas — validation and serialization for recruiter candidate screening."""
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.candidate import CandidateStage
from app.schemas.scorecard import ScorecardRead
from app.schemas.extractor import CandidateLinkRead
from app.schemas.message import MessageRead
from app.schemas.scheduling import InterviewRead, SchedulingLinkRead
from app.schemas.audit_log import AuditLogRead


class CandidateBase(BaseModel):
    opening_id: uuid.UUID = Field(..., description="Target JobOpening ID")
    name: str = Field(..., min_length=1, max_length=255, description="Candidate full name")
    email: EmailStr = Field(..., description="Candidate email address")
    cv_text: str = Field(..., min_length=20, description="Raw text or markdown of candidate's CV")
    cv_file_url: Optional[str] = Field(default=None, max_length=2048, description="Optional resume URL")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Candidate name cannot be empty or only spaces.")
        return cleaned


class CandidateCreate(CandidateBase):
    pass


class CandidateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    kaggle_url: Optional[str] = None
    cv_text: Optional[str] = Field(default=None, min_length=20)
    cv_file_url: Optional[str] = None
    stage: Optional[CandidateStage] = None
    score: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    matched_skills: Optional[List[str]] = None
    missing_skills: Optional[List[str]] = None
    red_flags: Optional[List[str]] = None
    summary: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                raise ValueError("Candidate name cannot be empty or only spaces.")
            return cleaned
        return None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                return None
            if not re.match(r"^\+?[0-9\s\-\(\)\.]{7,25}$", cleaned):
                raise ValueError("Invalid phone number format. Must contain 7-25 digits/symbols.")
            return cleaned
        return None

    @field_validator("github_url", "linkedin_url", "portfolio_url", "kaggle_url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                return None
            if len(cleaned) > 1000:
                raise ValueError("URL length cannot exceed 1000 characters.")
            return cleaned
        return None


class CandidateStageUpdate(BaseModel):
    stage: CandidateStage = Field(..., description="New pipeline stage")


class CandidateRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    opening_id: uuid.UUID
    name: str
    email: str
    cv_text: Optional[str] = ""
    cv_file_url: Optional[str] = None
    score: Optional[float] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    kaggle_url: Optional[str] = None
    extracted_data: Optional[dict] = None
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)
    summary: Optional[str] = None
    stage: CandidateStage
    review_status: str = "pending"
    review_decision_at: Optional[datetime] = None
    recommendation: Optional[str] = None
    auto_reply_sent: bool = False
    auto_reply_status: Optional[str] = None
    auto_reply_error: Optional[str] = None
    auto_reply_sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    scorecards: Optional[List[ScorecardRead]] = None
    opening_title: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedCandidates(BaseModel):
    items: List[CandidateRead]
    total: int
    skip: int
    limit: int


class CandidateScreenResult(BaseModel):
    candidate_id: uuid.UUID
    candidate_name: str
    score: float = Field(..., ge=0.0, le=100.0)
    matched_skills: List[str]
    missing_skills: List[str]
    red_flags: List[str] = Field(default_factory=list)
    summary: str
    recommendation: Optional[str] = None
    interview_focus_areas: List[str] = Field(default_factory=list)
    rank: Optional[int] = None
    stage: Optional[CandidateStage] = None
    model_used: Optional[str] = None
    latency_seconds: Optional[float] = None


class BulkScoreResponse(BaseModel):
    opening_id: uuid.UUID
    opening_title: str
    total_candidates: int
    ranked_candidates: List[CandidateScreenResult]


class CandidateScreeningQuestionsResponse(BaseModel):
    candidate_id: uuid.UUID
    candidate_name: str
    questions: List[str]


class CandidateBulkStageUpdate(BaseModel):
    candidate_ids: List[uuid.UUID] = Field(..., min_length=1, description="List of candidate IDs to update")
    stage: CandidateStage = Field(..., description="Target pipeline stage")


class CandidateBulkDelete(BaseModel):
    candidate_ids: List[uuid.UUID] = Field(..., min_length=1, description="List of candidate IDs to delete")


class CandidateBulkActionResult(BaseModel):
    updated_count: int = Field(..., description="Count of successfully modified records")
    message: str = Field(..., description="Result summary message")


class CandidateDataExportResponse(BaseModel):
    """
    GDPR / Recruiter compliant candidate data export package.
    Aggregates personal details, extracted links, scorecards, messaging history,
    interviews, scheduling links, and audit trail.
    """
    candidate: CandidateRead
    links: List[CandidateLinkRead] = Field(default_factory=list)
    scorecards: List[ScorecardRead] = Field(default_factory=list)
    messages: List[MessageRead] = Field(default_factory=list)
    interviews: List[InterviewRead] = Field(default_factory=list)
    scheduling_links: List[SchedulingLinkRead] = Field(default_factory=list)
    audit_trail: List[AuditLogRead] = Field(default_factory=list)
    exported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── CV Review Flow Schemas ───────────────────────────────────────────────────

class CVReviewQueueItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    opening_id: uuid.UUID
    opening_title: str
    opening_pass_mark: int = 80
    name: str
    email: str
    cv_text: Optional[str] = ""
    cv_file_url: Optional[str] = None
    score: Optional[float] = None
    recommendation: str = "Unscored"  # "Recommended" | "Borderline" | "Not recommended" | "Unscored"
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)
    summary: Optional[str] = None
    stage: str
    review_status: str = "pending"
    review_decision_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CVReviewDecisionRequest(BaseModel):
    candidate_ids: List[uuid.UUID] = Field(..., min_length=1, description="Candidate IDs to approve or reject")
    action: str = Field(..., pattern="^(approve|reject)$", description="'approve' or 'reject'")
    notes: Optional[str] = Field(default=None, description="Optional HR decision notes")


class CVReviewDecisionItem(BaseModel):
    candidate_id: uuid.UUID
    candidate_name: str
    action: str
    status: str  # "approved" | "rejected" | "error"
    stage: str
    emails_sent: List[str] = Field(default_factory=list)
    scheduling_link: Optional[str] = None
    error: Optional[str] = None


class CVReviewDecisionResponse(BaseModel):
    total_processed: int
    approved_count: int
    rejected_count: int
    results: List[CVReviewDecisionItem]


class CVReviewOpeningPassMarkUpdate(BaseModel):
    pass_mark: int = Field(..., ge=1, le=100, description="Updated pass mark threshold (1-100)")


