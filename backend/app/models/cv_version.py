"""CVVersion model — a snapshot of a CV, optionally linked to an Application."""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.application import Application


class CVVersion(SQLModel, table=True):
    """
    Stores a version of the user's CV/resume.

    is_base = True  → The user's master/base CV (not tailored to any application).
    is_base = False → A tailored version linked to a specific Application.

    Relationships
    -------------
    - user        : many-to-one  → CVVersion belongs to exactly one User.
    - application : many-to-one  → Optionally linked to one Application
                                   (NULL when is_base=True or if CV was written
                                   before an application was created).
    """

    __tablename__ = "cv_versions"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
    )

    # ── Foreign keys ─────────────────────────────────────────────────────────
    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        nullable=False,
        index=True,
    )
    # Nullable: a base CV is not tied to any application
    application_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="applications.id",
        index=True,
    )

    # ── Content ──────────────────────────────────────────────────────────────
    content: str = Field(nullable=False)   # Markdown / plain-text CV body
    is_base: bool = Field(default=False, nullable=False, index=True)

    # ── Timestamps ───────────────────────────────────────────────────────────
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Relationships ────────────────────────────────────────────────────────
    user: Optional["User"] = Relationship(back_populates="cv_versions")
    application: Optional["Application"] = Relationship(back_populates="cv_versions")

