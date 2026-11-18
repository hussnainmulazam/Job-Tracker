"""create_audit_logs_and_notifications

Revision ID: d4f6h8j0l2n4
Revises: c3e5g7i9k1m3
Create Date: 2026-11-17

Adds audit logs and notifications tables for recruiting operations:
  - audit_logs:
      * Tracks candidate lifecycle stage changes, scoring events, interviews, and bulk actions.
      * Scoped to recruiter user_id with candidate_id and opening_id foreign keys.
  - notifications:
      * Recruiter notifications for interview bookings, inbound WhatsApp messages, new CVs, and stage updates.
      * Unread state tracking and quick deep links.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d4f6h8j0l2n4"
down_revision: Union[str, None] = "c3e5g7i9k1m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    is_postgres = bind.dialect.name == "postgresql"

    # ── 1. audit_logs ─────────────────────────────────────────────────────────
    if "audit_logs" not in existing_tables:
        op.create_table(
            "audit_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36), primary_key=True),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "candidate_id",
                postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36),
                sa.ForeignKey("candidates.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column(
                "opening_id",
                postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36),
                sa.ForeignKey("job_openings.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column("action", sa.String(length=100), nullable=False),
            sa.Column("from_stage", sa.String(length=50), nullable=True),
            sa.Column("to_stage", sa.String(length=50), nullable=True),
            sa.Column("details", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
        op.create_index("ix_audit_logs_candidate_id", "audit_logs", ["candidate_id"])
        op.create_index("ix_audit_logs_opening_id", "audit_logs", ["opening_id"])
        op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
        op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # ── 2. notifications ──────────────────────────────────────────────────────
    if "notifications" not in existing_tables:
        op.create_table(
            "notifications",
            sa.Column("id", postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36), primary_key=True),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("type", sa.String(length=50), nullable=False, server_default="system"),
            sa.Column("link", sa.String(length=500), nullable=True),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
        op.create_index("ix_notifications_type", "notifications", ["type"])
        op.create_index("ix_notifications_is_read", "notifications", ["is_read"])
        op.create_index("ix_notifications_created_at", "notifications", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "notifications" in existing_tables:
        op.drop_table("notifications")
    if "audit_logs" in existing_tables:
        op.drop_table("audit_logs")
