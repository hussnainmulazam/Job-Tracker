"""create_users_applications_cv_versions

Revision ID: 5c7d97390c6d
Revises:
Create Date: 2026-11-16

Creates three core tables:
  - users            (UUID PK, email unique, hashed_password, created_at)
  - applications     (UUID PK, FK→users, company, role, job_url,
                       job_description, status enum, notes, applied_date,
                       created_at, updated_at)
  - cv_versions      (UUID PK, FK→users, FK→applications nullable,
                       content, is_base, created_at)

Keeps the legacy `jobs` table untouched (created separately).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# ── Revision identifiers ─────────────────────────────────────────────────────
revision: str = "5c7d97390c6d"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. users ─────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── 2. applications ───────────────────────────────────────────────────────
    # PostgreSQL native ENUM for ApplicationStatus
    application_status = sa.Enum(
        "applied", "interview", "offer", "rejected",
        name="applicationstatus",
    )

    op.create_table(
        "applications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("company", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=255), nullable=False),
        sa.Column("job_url", sa.String(length=2048), nullable=True),
        sa.Column("job_description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            application_status,
            nullable=False,
            server_default="applied",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("applied_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_applications_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_applications_id", "applications", ["id"], unique=False)
    op.create_index("ix_applications_user_id", "applications", ["user_id"], unique=False)
    op.create_index("ix_applications_company", "applications", ["company"], unique=False)
    op.create_index("ix_applications_status", "applications", ["status"], unique=False)

    # ── 3. cv_versions ────────────────────────────────────────────────────────
    op.create_table(
        "cv_versions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("application_id", sa.UUID(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_base", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_cv_versions_user_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["application_id"], ["applications.id"],
            name="fk_cv_versions_application_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cv_versions_id", "cv_versions", ["id"], unique=False)
    op.create_index("ix_cv_versions_user_id", "cv_versions", ["user_id"], unique=False)
    op.create_index("ix_cv_versions_application_id", "cv_versions", ["application_id"], unique=False)
    op.create_index("ix_cv_versions_is_base", "cv_versions", ["is_base"], unique=False)


def downgrade() -> None:
    op.drop_table("cv_versions")
    op.drop_table("applications")
    op.drop_table("users")
    # Remove the PostgreSQL ENUM type created for ApplicationStatus
    sa.Enum(name="applicationstatus").drop(op.get_bind(), checkfirst=True)
