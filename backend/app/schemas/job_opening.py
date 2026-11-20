"""JobOpening schemas — validation and serialization for recruiter job vacancies."""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.job_opening import JobOpeningStatus


class JobOpeningBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=255, description="Job title")
    description: str = Field(..., min_length=10, description="Job description and responsibilities")
    required_skills: List[str] = Field(
        default_factory=list,
        description="List of key technical/domain skills required for the role",
    )
    years_of_experience: Optional[float] = Field(
        default=None,
        description="Minimum years of experience required",
    )
    nice_to_haves: List[str] = Field(
        default_factory=list,
        description="Preferred or bonus skills",
    )
    status: JobOpeningStatus = Field(
        default=JobOpeningStatus.active,
        description="Posting status",
    )
    pass_mark: int = Field(
        default=80,
        ge=1,
        le=100,
        description="Minimum score required for recommendation (default 80)",
    )


class JobOpeningCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255, description="Job title")
    description: str = Field(..., min_length=10, description="Job description and responsibilities")
    required_skills: Optional[List[str]] = Field(
        default=None,
        description="Optional explicit required skills (if omitted or empty, extracted via OpenRouter AI)",
    )
    years_of_experience: Optional[float] = Field(default=None)
    nice_to_haves: Optional[List[str]] = Field(default=None)
    status: JobOpeningStatus = Field(default=JobOpeningStatus.active)
    pass_mark: Optional[int] = Field(default=80, ge=1, le=100)


class JobOpeningUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str] = Field(default=None, min_length=10)
    required_skills: Optional[List[str]] = None
    years_of_experience: Optional[float] = None
    nice_to_haves: Optional[List[str]] = None
    status: Optional[JobOpeningStatus] = None
    pass_mark: Optional[int] = Field(default=None, ge=1, le=100)


class JobOpeningRead(JobOpeningBase):
    id: uuid.UUID
    user_id: uuid.UUID
    google_sheet_id: Optional[str] = None
    google_sheet_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    candidates_count: Optional[int] = Field(default=0, description="Total candidates linked to opening")

    model_config = ConfigDict(from_attributes=True)


class PaginatedJobOpenings(BaseModel):
    items: List[JobOpeningRead]
    total: int
    skip: int
    limit: int


# ── Background Matching Schemas ───────────────────────────────────────────────

class MatchProgressStatus(BaseModel):
    opening_id: uuid.UUID
    status: str = Field(..., description="'idle', 'in_progress', 'completed', or 'failed'")
    total_candidates: int = Field(default=0)
    processed_candidates: int = Field(default=0)
    matched_candidates: int = Field(default=0)
    progress_percent: float = Field(default=0.0)
    errors: List[str] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

