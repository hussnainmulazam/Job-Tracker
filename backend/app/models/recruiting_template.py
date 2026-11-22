import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel


class RecruitingTemplate(SQLModel, table=True):
    """
    SQLModel representation of candidate lifecycle email templates.
    Single source of truth for all email and WhatsApp dispatchers.
    """
    __tablename__ = "recruiting_templates"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    stage_key: str = Field(index=True, nullable=False)
    name: str = Field(nullable=False)
    description: Optional[str] = Field(default=None)
    subject: str = Field(nullable=False)
    body: str = Field(nullable=False)
    is_active: bool = Field(default=True, nullable=False)
    is_default: bool = Field(default=False, nullable=False)
    is_custom: bool = Field(default=False, nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
