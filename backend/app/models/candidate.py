"""Candidate model — represents an applicant/candidate screened for a job opening."""
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, List, Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.audit_log import AuditLog
    from app.models.candidate_link import CandidateLink
    from app.models.interview import Interview, SchedulingLink
    from app.models.job_opening import JobOpening
    from app.models.message import Message
    from app.models.scorecard import Scorecard
    from app.models.user import User


class CandidateStage(str, Enum):
    """Hiring pipeline stages for candidate screening."""

    applied = "applied"
    screening = "screening"
    shortlisted = "shortlisted"
    contacted = "contacted"
    scheduled = "scheduled"
    interview = "interview"
    interviewed = "interviewed"
    offer = "offer"
    rejected = "rejected"


class Candidate(SQLModel, table=True):
    """
    Represents an applicant/candidate evaluated for a specific JobOpening.

    Relationships
    -------------
    - user        : many-to-one → Owned by the recruiter (User).
    - job_opening : many-to-one → The JobOpening this candidate is linked to.
    - scorecards  : one-to-many → Review scorecards created by recruiters for this candidate.
    """

    __tablename__ = "candidates"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )

    # Scoping
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        nullable=False,
        index=True,
    )
    opening_id: uuid.UUID = Field(
        foreign_key="job_openings.id",
        nullable=False,
        index=True,
    )

    # Candidate details
    name: str = Field(nullable=False, max_length=255)
    email: str = Field(nullable=False, max_length=320, index=True)
    cv_text: str = Field(nullable=False)
    cv_file_url: Optional[str] = Field(default=None, max_length=2048)

    # AI screening evaluation attributes
    score: Optional[float] = Field(default=None, nullable=True, index=True)
    matched_skills: List[str] = Field(
        default_factory=list,
        sa_column=Column(sa.JSON, nullable=False, server_default="[]"),
    )
    missing_skills: List[str] = Field(
        default_factory=list,
        sa_column=Column(sa.JSON, nullable=False, server_default="[]"),
    )
    red_flags: List[str] = Field(
        default_factory=list,
        sa_column=Column(sa.JSON, nullable=False, server_default="[]"),
    )
    summary: Optional[str] = Field(default=None, nullable=True)

    # Extracted contact & profile details
    phone: Optional[str] = Field(default=None, max_length=50, nullable=True)
    address: Optional[str] = Field(default=None, max_length=255, nullable=True)
    github_url: Optional[str] = Field(default=None, max_length=500, nullable=True)
    linkedin_url: Optional[str] = Field(default=None, max_length=500, nullable=True)
    portfolio_url: Optional[str] = Field(default=None, max_length=500, nullable=True)
    kaggle_url: Optional[str] = Field(default=None, max_length=500, nullable=True)
    extracted_data: dict = Field(
        default_factory=dict,
        sa_column=Column(sa.JSON, nullable=False, server_default="{}"),
    )

    # WhatsApp Cloud API Messaging & Compliance
    whatsapp_opt_in: bool = Field(default=False, nullable=False)
    whatsapp_opt_in_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    last_inbound_whatsapp_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )

    # Pipeline stage
    stage: CandidateStage = Field(
        default=CandidateStage.applied,
        index=True,
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Optional["User"] = Relationship(back_populates="candidates")
    job_opening: Optional["JobOpening"] = Relationship(back_populates="candidates")
    scorecards: List["Scorecard"] = Relationship(
        back_populates="candidate",
        cascade_delete=True,
    )
    links: List["CandidateLink"] = Relationship(
        back_populates="candidate",
        cascade_delete=True,
    )
    messages: List["Message"] = Relationship(
        back_populates="candidate",
        cascade_delete=True,
    )
    interviews: List["Interview"] = Relationship(
        back_populates="candidate",
        cascade_delete=True,
    )
    scheduling_links: List["SchedulingLink"] = Relationship(
        back_populates="candidate",
        cascade_delete=True,
    )
    audit_logs: List["AuditLog"] = Relationship(
        back_populates="candidate",
        cascade_delete=True,
    )
