"""CandidateLink model — stores extracted professional links (GitHub, LinkedIn, Kaggle, Portfolio, etc.)"""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.user import User


class CandidateLink(SQLModel, table=True):
    """
    Represents an extracted or verified online profile/portfolio link for a Candidate.
    """

    __tablename__ = "candidate_links"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )

    # Scoping
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

    # Link attributes
    link_type: str = Field(
        nullable=False,
        max_length=50,
        index=True,
        description="Type: github, linkedin, kaggle, portfolio, other",
    )
    url: str = Field(nullable=False, max_length=1000)
    is_verified: Optional[bool] = Field(
        default=None,
        nullable=True,
        description="Whether HEAD request to URL returned HTTP 200/reachable",
    )
    confidence: float = Field(
        default=1.0,
        description="Extraction confidence score (0.0 to 1.0)",
    )
    source: str = Field(
        default="regex",
        max_length=50,
        description="Extraction origin: regex, llm, cv, email, manual",
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    candidate: Optional["Candidate"] = Relationship(back_populates="links")
    user: Optional["User"] = Relationship()
