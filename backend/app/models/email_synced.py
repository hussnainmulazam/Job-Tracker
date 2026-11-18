"""EmailSynced model — tracks emails processed during Gmail sync to prevent duplicates."""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Column, JSON, String, Text, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.google_account import GoogleAccount


class EmailSynced(SQLModel, table=True):
    """
    Records processed Gmail messages and extracted resume attachments
    to guarantee incremental deduplication.
    """

    __tablename__ = "emails_synced"
    __table_args__ = (
        UniqueConstraint("user_id", "message_id", name="uq_emails_synced_user_message"),
    )

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
        ondelete="CASCADE",
    )
    google_account_id: uuid.UUID = Field(
        foreign_key="google_accounts.id",
        index=True,
        nullable=False,
        ondelete="CASCADE",
    )
    message_id: str = Field(index=True, max_length=255, nullable=False)
    thread_id: Optional[str] = Field(default=None, max_length=255, nullable=True)
    sender: Optional[str] = Field(default=None, max_length=320, nullable=True)
    subject: Optional[str] = Field(default=None, max_length=500, nullable=True)
    snippet: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    attachment_names: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )
    attachment_urls: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )
    synced_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Optional["User"] = Relationship(back_populates="emails_synced")
    google_account: Optional["GoogleAccount"] = Relationship(back_populates="emails_synced")
