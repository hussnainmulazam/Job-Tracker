"""Scorecard model — represents an interviewer/recruiter evaluation of a candidate."""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.user import User


class Scorecard(SQLModel, table=True):
    """
    Represents an evaluation scorecard submitted by a recruiter for a candidate.

    Relationships
    -------------
    - user      : many-to-one → Recruiter who authored the scorecard.
    - candidate : many-to-one → Candidate being reviewed.
    """

    __tablename__ = "scorecards"

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
    candidate_id: uuid.UUID = Field(
        foreign_key="candidates.id",
        nullable=False,
        index=True,
    )

    rating: int = Field(nullable=False, ge=1, le=5)
    notes: Optional[str] = Field(default=None)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Optional["User"] = Relationship(back_populates="scorecards")
    candidate: Optional["Candidate"] = Relationship(back_populates="scorecards")

