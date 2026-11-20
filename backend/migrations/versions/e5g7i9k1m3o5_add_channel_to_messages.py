"""add_channel_to_messages_and_sync_columns

Revision ID: e5g7i9k1m3o5
Revises: d4f6h8j0l2n4
Create Date: 2026-11-20

Adds channel to messages table and ensures all candidate, interview, and opening columns exist:
  - messages:
      * channel: String(30), default 'email'
  - candidates:
      * auto_reply_sent, auto_reply_status, auto_reply_error, auto_reply_sent_at
      * review_status, review_decision_at
      * offer_letter_draft, offer_letter_status, offer_letter_sent_at
  - job_openings:
      * pass_mark (Integer, default 80)
  - interviews:
      * round_type, result_status, feedback, result_recorded_at
  - scheduling_links:
      * round_type
  - google_accounts:
      * auto_reply_enabled
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5g7i9k1m3o5"
down_revision: Union[str, None] = "d4f6h8j0l2n4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # 1. messages: add channel column
    if "messages" in existing_tables:
        cols = {c["name"] for c in inspector.get_columns("messages")}
        if "channel" not in cols:
            op.add_column(
                "messages",
                sa.Column("channel", sa.String(length=30), nullable=True, server_default="email"),
            )

    # 2. candidates: ensure review, offer letter, and auto_reply columns exist
    if "candidates" in existing_tables:
        cand_cols = {c["name"] for c in inspector.get_columns("candidates")}
        if "auto_reply_sent" not in cand_cols:
            op.add_column(
                "candidates",
                sa.Column("auto_reply_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )
        if "auto_reply_status" not in cand_cols:
            op.add_column(
                "candidates",
                sa.Column("auto_reply_status", sa.String(length=50), nullable=True),
            )
        if "auto_reply_error" not in cand_cols:
            op.add_column(
                "candidates",
                sa.Column("auto_reply_error", sa.Text(), nullable=True),
            )
        if "auto_reply_sent_at" not in cand_cols:
            op.add_column(
                "candidates",
                sa.Column("auto_reply_sent_at", sa.DateTime(timezone=True), nullable=True),
            )
        if "review_status" not in cand_cols:
            op.add_column(
                "candidates",
                sa.Column("review_status", sa.String(length=50), nullable=False, server_default="pending"),
            )
        if "review_decision_at" not in cand_cols:
            op.add_column(
                "candidates",
                sa.Column("review_decision_at", sa.DateTime(timezone=True), nullable=True),
            )
        if "offer_letter_draft" not in cand_cols:
            op.add_column(
                "candidates",
                sa.Column("offer_letter_draft", sa.JSON(), nullable=True),
            )
        if "offer_letter_status" not in cand_cols:
            op.add_column(
                "candidates",
                sa.Column("offer_letter_status", sa.String(length=50), nullable=True),
            )
        if "offer_letter_sent_at" not in cand_cols:
            op.add_column(
                "candidates",
                sa.Column("offer_letter_sent_at", sa.DateTime(timezone=True), nullable=True),
            )

    # 3. job_openings: pass_mark
    if "job_openings" in existing_tables:
        jo_cols = {c["name"] for c in inspector.get_columns("job_openings")}
        if "pass_mark" not in jo_cols:
            op.add_column(
                "job_openings",
                sa.Column("pass_mark", sa.Integer(), nullable=False, server_default="80"),
            )

    # 4. interviews: round_type, result_status, feedback, result_recorded_at
    if "interviews" in existing_tables:
        int_cols = {c["name"] for c in inspector.get_columns("interviews")}
        if "round_type" not in int_cols:
            op.add_column(
                "interviews",
                sa.Column("round_type", sa.String(length=64), nullable=False, server_default="initial"),
            )
        if "result_status" not in int_cols:
            op.add_column(
                "interviews",
                sa.Column("result_status", sa.String(length=32), nullable=True),
            )
        if "feedback" not in int_cols:
            op.add_column(
                "interviews",
                sa.Column("feedback", sa.Text(), nullable=True),
            )
        if "result_recorded_at" not in int_cols:
            op.add_column(
                "interviews",
                sa.Column("result_recorded_at", sa.DateTime(timezone=True), nullable=True),
            )

    # 5. scheduling_links: round_type
    if "scheduling_links" in existing_tables:
        sl_cols = {c["name"] for c in inspector.get_columns("scheduling_links")}
        if "round_type" not in sl_cols:
            op.add_column(
                "scheduling_links",
                sa.Column("round_type", sa.String(length=64), nullable=False, server_default="initial"),
            )

    # 6. google_accounts: auto_reply_enabled
    if "google_accounts" in existing_tables:
        ga_cols = {c["name"] for c in inspector.get_columns("google_accounts")}
        if "auto_reply_enabled" not in ga_cols:
            op.add_column(
                "google_accounts",
                sa.Column("auto_reply_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "messages" in existing_tables:
        cols = {c["name"] for c in inspector.get_columns("messages")}
        if "channel" in cols:
            op.drop_column("messages", "channel")
