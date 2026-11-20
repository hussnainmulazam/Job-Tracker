"""
backend/app/models/onboarding.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Recruiter Onboarding and First-Login Setup Wizard state.
Persists progress across 4 steps:
  1) HR & Company Profile (name, company, role, email tone, signature)
  2) First Job Opening with JD (title, description, required skills, experience)
  3) Weekly Availability and Interview Length per round
  4) Email Templates (Application Ack, Interview Invite, Offer, Rejection)
Tracks step completion, allows resuming later, and gates 'Start Agent'.
"""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.job_opening import JobOpening
    from app.models.user import User


class OnboardingSetup(SQLModel, table=True):
    __tablename__ = "onboarding_setups"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        nullable=False,
        unique=True,
        index=True,
    )

    # ── Step 1: HR & Company Profile ──────────────────────────────────────────
    hr_name: Optional[str] = Field(default=None, max_length=150)
    company_name: Optional[str] = Field(default=None, max_length=150)
    hr_role: Optional[str] = Field(default=None, max_length=100)
    email_tone: Optional[str] = Field(default="warm_professional", max_length=50)
    signature: Optional[str] = Field(default=None)
    step_1_completed: bool = Field(default=False)

    # ── Step 2: First Job Opening with JD ─────────────────────────────────────
    job_opening_id: Optional[uuid.UUID] = Field(
        foreign_key="job_openings.id",
        nullable=True,
        default=None,
    )
    job_title: Optional[str] = Field(default=None, max_length=255)
    job_description: Optional[str] = Field(default=None)
    required_skills: List[str] = Field(
        default_factory=list,
        sa_column=Column(sa.JSON, nullable=False, server_default="[]"),
    )
    years_of_experience: Optional[float] = Field(default=None, nullable=True)
    step_2_completed: bool = Field(default=False)

    # ── Step 3: Weekly Availability & Interview Lengths per Round ─────────────
    timezone: str = Field(default="Asia/Karachi", max_length=64)
    slot_duration_minutes: int = Field(default=30)
    buffer_minutes: int = Field(default=10)
    weekly_hours: Dict[str, Any] = Field(
        default_factory=lambda: {
            "mon": [{"start": "09:00", "end": "17:00"}],
            "tue": [{"start": "09:00", "end": "17:00"}],
            "wed": [{"start": "09:00", "end": "17:00"}],
            "thu": [{"start": "09:00", "end": "17:00"}],
            "fri": [{"start": "09:00", "end": "17:00"}],
            "sat": [],
            "sun": [],
        },
        sa_column=Column(sa.JSON, nullable=False, server_default="{}"),
    )
    interview_rounds: List[Dict[str, Any]] = Field(
        default_factory=lambda: [
            {"round_name": "Initial Screening", "duration_minutes": 30},
            {"round_name": "Technical Evaluation", "duration_minutes": 45},
            {"round_name": "Final Culture Fit", "duration_minutes": 30},
        ],
        sa_column=Column(sa.JSON, nullable=False, server_default="[]"),
    )
    step_3_completed: bool = Field(default=False)

    # ── Step 4: Email Templates ───────────────────────────────────────────────
    templates: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(sa.JSON, nullable=False, server_default="{}"),
    )
    step_4_completed: bool = Field(default=False)

    # ── Overall Progress State ────────────────────────────────────────────────
    current_step: int = Field(default=1)  # 1 to 4
    is_completed: bool = Field(default=False)
    agent_started: bool = Field(default=False)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Optional["User"] = Relationship(back_populates="onboarding")
    job_opening: Optional["JobOpening"] = Relationship()
