"""JobOpening model — represents a job vacancy/requisition managed by a recruiter."""
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, List, Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.audit_log import AuditLog
    from app.models.candidate import Candidate
    from app.models.interview import Interview, SchedulingLink
    from app.models.user import User


class JobOpeningStatus(str, Enum):
    """Status lifecycle of a job opening."""

    draft = "draft"
    active = "active"
    paused = "paused"
    closed = "closed"


class JobOpening(SQLModel, table=True):
    """
    Represents a job vacancy/requisition created by a recruiter (User).

    Relationships
    -------------
    - user       : many-to-one → Owned by one recruiter (User).
    - candidates : one-to-many → Candidates who applied or were screened for this opening.
    """

    __tablename__ = "job_openings"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )

    # Recruiter ownership (scoping)
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        nullable=False,
        index=True,
    )

    title: str = Field(nullable=False, max_length=255, index=True)
    description: str = Field(nullable=False)
    required_skills: List[str] = Field(
        default_factory=list,
        sa_column=Column(sa.JSON, nullable=False, server_default="[]"),
    )
    years_of_experience: Optional[float] = Field(default=None, nullable=True)
    nice_to_haves: List[str] = Field(
        default_factory=list,
        sa_column=Column(sa.JSON, nullable=False, server_default="[]"),
    )
    status: JobOpeningStatus = Field(
        default=JobOpeningStatus.active,
        index=True,
    )
    pass_mark: int = Field(
        default=80,
        sa_column=Column(sa.Integer, server_default="80", nullable=False),
        description="Minimum passing score required for recommendation (default 80, editable per opening)",
    )
    google_sheet_id: Optional[str] = Field(default=None, max_length=255, nullable=True)
    google_sheet_url: Optional[str] = Field(default=None, max_length=500, nullable=True)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Optional["User"] = Relationship(back_populates="job_openings")
    candidates: List["Candidate"] = Relationship(
        back_populates="job_opening",
        cascade_delete=True,
    )
    interviews: List["Interview"] = Relationship(
        back_populates="opening",
        cascade_delete=True,
    )
    scheduling_links: List["SchedulingLink"] = Relationship(
        back_populates="opening",
        cascade_delete=True,
    )
    audit_logs: List["AuditLog"] = Relationship(
        back_populates="job_opening",
        cascade_delete=True,
    )

