"""AuditLog model — records recruiter actions and candidate lifecycle events."""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.job_opening import JobOpening
    from app.models.user import User


class AuditLog(SQLModel, table=True):
    """
    Records recruiter workflow actions, stage transitions, and AI screening events.
    """

    __tablename__ = "audit_logs"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )

    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        nullable=False,
        index=True,
    )

    candidate_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="candidates.id",
        nullable=True,
        index=True,
    )

    opening_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="job_openings.id",
        nullable=True,
        index=True,
    )

    # Action type (stage_change, status_change, score_assigned, interview_scheduled, etc.)
    action: str = Field(nullable=False, max_length=100, index=True)

    # Stage transitions
    from_stage: Optional[str] = Field(default=None, max_length=50, nullable=True)
    to_stage: Optional[str] = Field(default=None, max_length=50, nullable=True)

    # Human-readable note or structured json metadata
    details: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), nullable=False, index=True),
    )

    # Relationships
    user: Optional["User"] = Relationship(back_populates="audit_logs")
    candidate: Optional["Candidate"] = Relationship(back_populates="audit_logs")
    job_opening: Optional["JobOpening"] = Relationship(back_populates="audit_logs")
