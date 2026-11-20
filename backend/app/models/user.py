"""User model — represents an authenticated recruiter account."""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.agent_settings import AgentSettings
    from app.models.application import Application
    from app.models.audit_log import AuditLog
    from app.models.candidate import Candidate
    from app.models.cv_version import CVVersion
    from app.models.email_synced import EmailSynced
    from app.models.google_account import GoogleAccount
    from app.models.interview import AvailabilitySchedule, Interview, SchedulingLink
    from app.models.job_opening import JobOpening
    from app.models.message import Message
    from app.models.notification import Notification
    from app.models.onboarding import OnboardingSetup
    from app.models.scorecard import Scorecard


class User(SQLModel, table=True):
    """
    Represents a registered recruiter/user of the AI Candidate Screening Copilot.

    Relationships
    -------------
    - job_openings  : one-to-many → Recruiter owns many JobOpenings.
    - candidates    : one-to-many → Recruiter owns many Candidate records.
    - scorecards    : one-to-many → Recruiter creates many Scorecards.
    - google_account: one-to-one → Recruiter's linked Google OAuth2 account.
    - emails_synced : one-to-many → Candidate emails fetched from Gmail.
    - applications  : (legacy job-seeker table preserved in Supabase)
    - cv_versions   : (legacy job-seeker table preserved in Supabase)
    """

    __tablename__ = "users"

    # UUID primary key — avoids sequential ID enumeration attacks
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )
    email: str = Field(unique=True, index=True, nullable=False, max_length=320)
    hashed_password: str = Field(nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Recruiter screening relationships
    job_openings: List["JobOpening"] = Relationship(back_populates="user")
    candidates: List["Candidate"] = Relationship(back_populates="user")
    scorecards: List["Scorecard"] = Relationship(back_populates="user")
    messages: List["Message"] = Relationship(back_populates="user")
    availability_schedule: Optional["AvailabilitySchedule"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False},
        cascade_delete=True,
    )
    interviews: List["Interview"] = Relationship(back_populates="user", cascade_delete=True)
    scheduling_links: List["SchedulingLink"] = Relationship(back_populates="user", cascade_delete=True)
    audit_logs: List["AuditLog"] = Relationship(back_populates="user", cascade_delete=True)
    notifications: List["Notification"] = Relationship(back_populates="user", cascade_delete=True)
    onboarding: Optional["OnboardingSetup"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False},
        cascade_delete=True,
    )
    agent_settings: Optional["AgentSettings"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False},
        cascade_delete=True,
    )

    # Google integrations
    google_account: Optional["GoogleAccount"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False},
    )
    emails_synced: List["EmailSynced"] = Relationship(back_populates="user")

    # Preserved legacy relationships (table not dropped)
    applications: List["Application"] = Relationship(back_populates="user")
    cv_versions: List["CVVersion"] = Relationship(back_populates="user")
