"""
interview.py
~~~~~~~~~~~~
SQLModel models for recruiter availability schedules, candidate scheduling links,
and booked interviews (with Google Calendar/Meet integration, double-booking prevention,
and 24h / 1h reminder tracking).
"""
import enum
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

import sqlalchemy as sa
from sqlalchemy import Column, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.job_opening import JobOpening
    from app.models.user import User


class InterviewStatus(str, enum.Enum):
    scheduled = "scheduled"
    rescheduled = "rescheduled"
    cancelled = "cancelled"
    completed = "completed"
    passed = "passed"
    failed = "failed"
    no_show = "no_show"


class SchedulingLinkStatus(str, enum.Enum):
    active = "active"
    booked = "booked"
    cancelled = "cancelled"
    expired = "expired"


class AvailabilitySchedule(SQLModel, table=True):
    """
    Recruiter's weekly working hours and scheduling availability.
    Default timezone is Asia/Karachi.
    """
    __tablename__ = "availability_schedules"

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
    timezone: str = Field(default="Asia/Karachi", max_length=64, nullable=False)
    slot_duration_minutes: int = Field(default=30, nullable=False)
    buffer_minutes: int = Field(default=10, nullable=False)
    # JSON dict mapping day of week to working blocks:
    # {"mon": [{"start": "09:00", "end": "17:00"}], ...}
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
        sa_column=Column(JSONB if hasattr(JSONB, "astext_type") else JSONB, nullable=False),
    )
    is_active: bool = Field(default=True, nullable=False)
    blocked_dates: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB if hasattr(JSONB, "astext_type") else JSONB, nullable=False, server_default="[]"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    user: Optional["User"] = Relationship(back_populates="availability_schedule")


class SchedulingLink(SQLModel, table=True):
    """
    Candidate tokenized invitation link for public slot booking (/schedule/{token}).
    """
    __tablename__ = "scheduling_links"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )
    token: str = Field(
        unique=True,
        index=True,
        max_length=128,
        nullable=False,
    )
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        index=True,
        nullable=False,
    )
    candidate_id: uuid.UUID = Field(
        foreign_key="candidates.id",
        index=True,
        nullable=False,
    )
    opening_id: uuid.UUID = Field(
        foreign_key="job_openings.id",
        index=True,
        nullable=False,
    )
    slot_duration_minutes: int = Field(default=30, nullable=False)
    round_type: str = Field(
        default="initial",
        sa_column=Column(sa.String(64), server_default="initial", nullable=False, index=True),
    )
    status: SchedulingLinkStatus = Field(
        default=SchedulingLinkStatus.active,
        max_length=32,
        index=True,
        nullable=False,
    )
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    user: Optional["User"] = Relationship(back_populates="scheduling_links")
    candidate: Optional["Candidate"] = Relationship(back_populates="scheduling_links")
    opening: Optional["JobOpening"] = Relationship(back_populates="scheduling_links")
    interview: Optional["Interview"] = Relationship(back_populates="scheduling_link")


class Interview(SQLModel, table=True):
    """
    Scheduled candidate interview.
    Protected against double-booking by PostgreSQL exclusion constraint.
    Tracks Google Calendar event ID, Google Meet link, and 24h & 1h reminder dispatches.
    """
    __tablename__ = "interviews"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        index=True,
        nullable=False,
    )
    candidate_id: uuid.UUID = Field(
        foreign_key="candidates.id",
        index=True,
        nullable=False,
    )
    opening_id: uuid.UUID = Field(
        foreign_key="job_openings.id",
        index=True,
        nullable=False,
    )
    scheduling_link_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="scheduling_links.id",
        nullable=True,
        index=True,
    )
    title: str = Field(max_length=255, nullable=False)
    start_time: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )
    end_time: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )
    timezone: str = Field(default="Asia/Karachi", max_length=64, nullable=False)
    google_calendar_event_id: Optional[str] = Field(default=None, max_length=255, nullable=True)
    meet_link: Optional[str] = Field(default=None, max_length=512, nullable=True)

    candidate_name: str = Field(max_length=255, nullable=False)
    candidate_email: str = Field(max_length=255, nullable=False)
    candidate_phone: Optional[str] = Field(default=None, max_length=64, nullable=True)
    interviewer_email: str = Field(max_length=255, nullable=False)

    round_type: str = Field(
        default="initial",
        sa_column=Column(sa.String(64), server_default="initial", nullable=False, index=True),
    )
    result_status: Optional[str] = Field(
        default=None,
        sa_column=Column(sa.String(32), nullable=True, index=True),
    )
    feedback: Optional[str] = Field(
        default=None,
        sa_column=Column(sa.Text, nullable=True),
    )
    result_recorded_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    status: InterviewStatus = Field(
        default=InterviewStatus.scheduled,
        max_length=32,
        index=True,
        nullable=False,
    )
    cancellation_reason: Optional[str] = Field(default=None, nullable=True)
    cancelled_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    cancelled_by: Optional[str] = Field(default=None, max_length=32, nullable=True)

    reminder_24h_sent: bool = Field(default=False, nullable=False)
    reminder_24h_sent_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    reminder_1h_sent: bool = Field(default=False, nullable=False)
    reminder_1h_sent_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    user: Optional["User"] = Relationship(back_populates="interviews")
    candidate: Optional["Candidate"] = Relationship(back_populates="interviews")
    opening: Optional["JobOpening"] = Relationship(back_populates="interviews")
    scheduling_link: Optional["SchedulingLink"] = Relationship(back_populates="interview")
