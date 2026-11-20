"""
AgentSettings model — controls autonomous agent lifecycle, daily limits, and HR alerts.
"""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.user import User


class AgentSettings(SQLModel, table=True):
    """
    Recruiter-configurable settings for the AI Candidate Screening Copilot:
      - Pause / Resume toggle
      - Daily message send limit & quota
      - Immediate HR email notification toggles (booking, reply, failure)
      - Daily summary email trigger & schedule
    """

    __tablename__ = "agent_settings"

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

    # ── Agent Execution State ─────────────────────────────────────────────────
    is_paused: bool = Field(default=False)
    paused_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    paused_reason: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))

    # ── Daily Send Limit ──────────────────────────────────────────────────────
    daily_send_limit: int = Field(default=50)

    # ── Immediate HR Notifications ───────────────────────────────────────────
    notify_email: Optional[str] = Field(default=None, max_length=320)
    notify_on_booking: bool = Field(default=True)
    notify_on_reply: bool = Field(default=True)
    notify_on_failure: bool = Field(default=True)

    # ── Daily Summary Email ───────────────────────────────────────────────────
    daily_summary_enabled: bool = Field(default=True)
    daily_summary_time: str = Field(default="09:00", max_length=10)
    last_daily_summary_sent_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), nullable=False),
    )

    # Relationship back to User
    user: Optional["User"] = Relationship(back_populates="agent_settings")
