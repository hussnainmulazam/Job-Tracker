"""Application model — a single job application tracked by a user."""
import uuid
from datetime import date, datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, List, Optional

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.cv_version import CVVersion


class ApplicationStatus(str, Enum):
    """
    Life-cycle states of a job application.

    applied    → submitted but no response yet
    interview  → at least one interview stage scheduled / completed
    offer      → an offer has been received
    rejected   → application closed without an offer
    """

    applied = "applied"
    interview = "interview"
    offer = "offer"
    rejected = "rejected"


class Application(SQLModel, table=True):
    """
    Represents one job application belonging to a User.

    Relationships
    -------------
    - user        : many-to-one  → Application is owned by exactly one User.
    - cv_versions : one-to-many  → An Application can have multiple tailored
                                   CVVersions (e.g. multiple revisions sent).
    """

    __tablename__ = "applications"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )

    # ── Foreign key ──────────────────────────────────────────────────────────
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        nullable=False,
        index=True,
    )

    # ── Core fields ──────────────────────────────────────────────────────────
    company: str = Field(nullable=False, max_length=255, index=True)
    role: str = Field(nullable=False, max_length=255)
    job_url: Optional[str] = Field(default=None, max_length=2048)
    job_description: Optional[str] = Field(default=None)   # long text
    status: ApplicationStatus = Field(
        default=ApplicationStatus.applied,
        index=True,
    )
    notes: Optional[str] = Field(default=None)
    applied_date: Optional[date] = Field(default=None)

    # ── Timestamps ───────────────────────────────────────────────────────────
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Relationships ────────────────────────────────────────────────────────
    user: Optional["User"] = Relationship(back_populates="applications")
    cv_versions: List["CVVersion"] = Relationship(back_populates="application")

