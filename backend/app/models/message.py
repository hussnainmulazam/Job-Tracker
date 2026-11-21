"""
Message model — represents WhatsApp Cloud API inbound and outbound messages.
Tracks message direction, status, template variables, delivery receipts,
and AI draft flags.
"""
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.user import User


class MessageDirection(str, Enum):
    inbound = "inbound"
    outbound = "outbound"


class MessageType(str, Enum):
    template = "template"
    text = "text"
    email = "email"


class MessageStatus(str, Enum):
    pending = "pending"
    sent = "sent"
    delivered = "delivered"
    read = "read"
    failed = "failed"


class Message(SQLModel, table=True):
    """
    Individual WhatsApp message sent or received via WhatsApp Cloud API.
    Scoped to both candidate and recruiter (user).
    """

    __tablename__ = "messages"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )

    candidate_id: uuid.UUID = Field(
        foreign_key="candidates.id",
        nullable=False,
        index=True,
    )
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        nullable=False,
        index=True,
    )

    direction: MessageDirection = Field(
        sa_column=Column(sa.String(20), nullable=False, index=True)
    )
    message_type: MessageType = Field(
        sa_column=Column(sa.String(30), nullable=False, default=MessageType.text)
    )
    channel: Optional[str] = Field(default="email", nullable=True, max_length=30)
    body: str = Field(
        sa_column=Column(sa.Text, nullable=False)
    )

    template_name: Optional[str] = Field(default=None, max_length=100, nullable=True)
    template_language: Optional[str] = Field(default=None, max_length=20, nullable=True)
    template_variables: Optional[dict] = Field(
        default=None,
        sa_column=Column(sa.JSON, nullable=True),
    )

    whatsapp_message_id: Optional[str] = Field(
        default=None,
        max_length=120,
        nullable=True,
        index=True,
    )
    status: MessageStatus = Field(
        sa_column=Column(sa.String(30), nullable=False, default=MessageStatus.pending, index=True)
    )
    error_message: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))
    retry_count: int = Field(default=0, nullable=False)

    ai_drafted: bool = Field(default=False, nullable=False)
    hr_approved: bool = Field(default=True, nullable=False)

    sent_at: Optional[datetime] = Field(default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True))
    delivered_at: Optional[datetime] = Field(default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True))
    read_at: Optional[datetime] = Field(default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True))
    failed_at: Optional[datetime] = Field(default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True))

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"), index=True),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"), index=True),
    )

    # Relationships
    candidate: Optional["Candidate"] = Relationship(back_populates="messages")
    user: Optional["User"] = Relationship(back_populates="messages")
