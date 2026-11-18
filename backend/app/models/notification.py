"""Notification model — recruiter system alerts, interview updates, and messaging events."""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.user import User


class Notification(SQLModel, table=True):
    """
    Recruiter notifications for pipeline alerts, candidate responses, and interview events.
    """

    __tablename__ = "notifications"

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

    title: str = Field(nullable=False, max_length=255)
    message: str = Field(sa_column=Column(sa.Text, nullable=False))
    type: str = Field(default="system", max_length=50, index=True)
    link: Optional[str] = Field(default=None, max_length=500, nullable=True)

    is_read: bool = Field(default=False, nullable=False, index=True)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), nullable=False, index=True),
    )

    # Relationships
    user: Optional["User"] = Relationship(back_populates="notifications")
