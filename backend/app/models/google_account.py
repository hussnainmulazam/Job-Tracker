"""GoogleAccount model — represents an authenticated Google OAuth2 account for a recruiter."""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Column, JSON, String, Text
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.email_synced import EmailSynced
    from app.models.job_opening import JobOpening


class GoogleAccount(SQLModel, table=True):
    """
    Represents a recruiter's linked Google account storing encrypted refresh tokens
    and Gmail sync settings.
    """

    __tablename__ = "google_accounts"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        unique=True,
        index=True,
        nullable=False,
        ondelete="CASCADE",
    )
    email: str = Field(index=True, nullable=False, max_length=320)
    encrypted_refresh_token: str = Field(sa_column=Column(Text, nullable=False))
    access_token: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    token_expires_at: Optional[datetime] = Field(default=None, nullable=True)
    scopes: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )
    sync_query: str = Field(
        default="has:attachment (filename:pdf OR filename:docx) newer_than:30d",
        max_length=500,
        nullable=False,
    )
    sync_label: str = Field(default="INBOX", max_length=100, nullable=False)
    auto_reply_enabled: bool = Field(default=True, nullable=False)
    default_opening_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="job_openings.id",
        nullable=True,
    )
    last_synced_at: Optional[datetime] = Field(default=None, nullable=True)
    last_sync_status: str = Field(default="never", max_length=50, nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Optional["User"] = Relationship(back_populates="google_account")
    emails_synced: List["EmailSynced"] = Relationship(
        back_populates="google_account",
        cascade_delete=True,
    )
