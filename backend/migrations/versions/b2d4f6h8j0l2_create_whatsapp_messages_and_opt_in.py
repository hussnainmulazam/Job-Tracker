"""create_whatsapp_messages_and_opt_in

Revision ID: b2d4f6h8j0l2
Revises: a1c2e3g4i5k6
Create Date: 2026-11-17

Adds WhatsApp Cloud API integration support:
  - candidates:
      * whatsapp_opt_in: Boolean flag (required before sending outbound messages)
      * whatsapp_opt_in_at: Timestamp of candidate opt-in confirmation
      * last_inbound_whatsapp_at: Timestamp of last inbound message (tracks 24h customer care window)
  - messages table:
      * id, candidate_id (FK cascade), user_id (FK cascade)
      * direction: 'inbound' | 'outbound'
      * message_type: 'template' | 'text'
      * body: rendered or raw text
      * template_name, template_language, template_variables (JSON)
      * whatsapp_message_id: wamid... from WhatsApp Cloud API
      * status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
      * error_message, retry_count
      * ai_drafted (Boolean), hr_approved (Boolean)
      * sent_at, delivered_at, read_at, failed_at
      * created_at, updated_at
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2d4f6h8j0l2"
down_revision: Union[str, None] = "a1c2e3g4i5k6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ── 1. candidates: add WhatsApp opt-in and 24h window tracking ────────────
    if "candidates" in existing_tables:
        candidate_cols = {c["name"] for c in inspector.get_columns("candidates")}
        if "whatsapp_opt_in" not in candidate_cols:
            op.add_column(
                "candidates",
                sa.Column("whatsapp_opt_in", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )
        if "whatsapp_opt_in_at" not in candidate_cols:
            op.add_column(
                "candidates",
                sa.Column("whatsapp_opt_in_at", sa.DateTime(timezone=True), nullable=True),
            )
        if "last_inbound_whatsapp_at" not in candidate_cols:
            op.add_column(
                "candidates",
                sa.Column("last_inbound_whatsapp_at", sa.DateTime(timezone=True), nullable=True),
            )

    # ── 2. messages table: WhatsApp Cloud API message logs & receipts ─────────
    if "messages" not in existing_tables:
        op.create_table(
            "messages",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("candidate_id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("direction", sa.String(length=20), nullable=False),
            sa.Column("message_type", sa.String(length=30), nullable=False, server_default="text"),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("template_name", sa.String(length=100), nullable=True),
            sa.Column("template_language", sa.String(length=20), nullable=True),
            sa.Column("template_variables", sa.JSON(), nullable=True),
            sa.Column("whatsapp_message_id", sa.String(length=120), nullable=True),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("ai_drafted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("hr_approved", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_messages_candidate_id"), "messages", ["candidate_id"], unique=False)
        op.create_index(op.f("ix_messages_user_id"), "messages", ["user_id"], unique=False)
        op.create_index(op.f("ix_messages_direction"), "messages", ["direction"], unique=False)
        op.create_index(op.f("ix_messages_status"), "messages", ["status"], unique=False)
        op.create_index(op.f("ix_messages_whatsapp_message_id"), "messages", ["whatsapp_message_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "messages" in existing_tables:
        op.drop_table("messages")

    if "candidates" in existing_tables:
        candidate_cols = {c["name"] for c in inspector.get_columns("candidates")}
        if "last_inbound_whatsapp_at" in candidate_cols:
            op.drop_column("candidates", "last_inbound_whatsapp_at")
        if "whatsapp_opt_in_at" in candidate_cols:
            op.drop_column("candidates", "whatsapp_opt_in_at")
        if "whatsapp_opt_in" in candidate_cols:
            op.drop_column("candidates", "whatsapp_opt_in")
