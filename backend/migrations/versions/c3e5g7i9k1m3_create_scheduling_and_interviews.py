"""create_scheduling_and_interviews

Revision ID: c3e5g7i9k1m3
Revises: b2d4f6h8j0l2
Create Date: 2026-11-17

Adds scheduling infrastructure for recruiter availability, tokenized candidate links, and interviews:
  - availability_schedules:
      * Weekly availability rules per recruiter (days, start/end hours, slot duration, buffer, timezone default 'Asia/Karachi')
  - scheduling_links:
      * Tokenized public booking link (/schedule/{token}) scoped to candidate and opening, with expiry
  - interviews:
      * Scheduled interview records with Google Calendar event id, Google Meet link, start/end times,
        cancellation/reschedule history, and 24h & 1h reminder flags
      * PostgreSQL exclusion constraint (EXCLUDE USING gist) preventing double-booking per HR recruiter
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c3e5g7i9k1m3"
down_revision: Union[str, None] = "b2d4f6h8j0l2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    is_postgres = bind.dialect.name == "postgresql"

    # ── 1. availability_schedules ─────────────────────────────────────────────
    if "availability_schedules" not in existing_tables:
        json_type = postgresql.JSONB(astext_type=sa.Text()) if is_postgres else sa.JSON()
        op.create_table(
            "availability_schedules",
            sa.Column("id", postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36), primary_key=True),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Asia/Karachi"),
            sa.Column("slot_duration_minutes", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("buffer_minutes", sa.Integer(), nullable=False, server_default="10"),
            sa.Column("weekly_hours", json_type, nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index("ix_availability_schedules_user_id", "availability_schedules", ["user_id"])

    # ── 2. scheduling_links ───────────────────────────────────────────────────
    if "scheduling_links" not in existing_tables:
        op.create_table(
            "scheduling_links",
            sa.Column("id", postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36), primary_key=True),
            sa.Column("token", sa.String(length=128), nullable=False, unique=True),
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
                nullable=False,
            ),
            sa.Column(
                "opening_id",
                postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36),
                sa.ForeignKey("job_openings.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("slot_duration_minutes", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index("ix_scheduling_links_token", "scheduling_links", ["token"])
        op.create_index("ix_scheduling_links_user_id", "scheduling_links", ["user_id"])
        op.create_index("ix_scheduling_links_candidate_id", "scheduling_links", ["candidate_id"])
        op.create_index("ix_scheduling_links_opening_id", "scheduling_links", ["opening_id"])
        op.create_index("ix_scheduling_links_status", "scheduling_links", ["status"])

    # ── 3. interviews ─────────────────────────────────────────────────────────
    if "interviews" not in existing_tables:
        op.create_table(
            "interviews",
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
                nullable=False,
            ),
            sa.Column(
                "opening_id",
                postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36),
                sa.ForeignKey("job_openings.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "scheduling_link_id",
                postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36),
                sa.ForeignKey("scheduling_links.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
            sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
            sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Asia/Karachi"),
            sa.Column("google_calendar_event_id", sa.String(length=255), nullable=True),
            sa.Column("meet_link", sa.String(length=512), nullable=True),
            sa.Column("candidate_name", sa.String(length=255), nullable=False),
            sa.Column("candidate_email", sa.String(length=255), nullable=False),
            sa.Column("candidate_phone", sa.String(length=64), nullable=True),
            sa.Column("interviewer_email", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="scheduled"),
            sa.Column("cancellation_reason", sa.Text(), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cancelled_by", sa.String(length=32), nullable=True),
            sa.Column("reminder_24h_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("reminder_24h_sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reminder_1h_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("reminder_1h_sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
        op.create_index("ix_interviews_user_id", "interviews", ["user_id"])
        op.create_index("ix_interviews_candidate_id", "interviews", ["candidate_id"])
        op.create_index("ix_interviews_opening_id", "interviews", ["opening_id"])
        op.create_index("ix_interviews_start_time", "interviews", ["start_time"])
        op.create_index("ix_interviews_status", "interviews", ["status"])

        # ── 4. DB Exclusion Constraint: Prevent double-booking per recruiter ───
        if is_postgres:
            op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
            op.execute("""
                ALTER TABLE interviews
                ADD CONSTRAINT no_double_booking_per_user
                EXCLUDE USING gist (
                    user_id WITH =,
                    tstzrange(start_time, end_time) WITH &&
                )
                WHERE (status != 'cancelled');
            """)


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        op.execute("ALTER TABLE interviews DROP CONSTRAINT IF EXISTS no_double_booking_per_user")

    op.drop_table("interviews")
    op.drop_table("scheduling_links")
    op.drop_table("availability_schedules")
