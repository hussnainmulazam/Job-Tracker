"""create_google_accounts_and_emails_synced

Revision ID: 9b2c3d4e5f6a
Revises: 8f4c2e1b0d7a
Create Date: 2026-11-17

Adds Google OAuth2 integration and Gmail sync tables:
  - google_accounts (UUID PK, FK→users unique, email, encrypted_refresh_token,
                     access_token, token_expires_at, scopes, sync_query, sync_label,
                     last_synced_at, last_sync_status, created_at, updated_at)
  - emails_synced   (UUID PK, FK→users, FK→google_accounts, message_id, thread_id,
                     sender, subject, snippet, attachment_names, attachment_urls,
                     synced_at)

All tables are scoped by user_id with CASCADE on delete.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# ── Revision identifiers ─────────────────────────────────────────────────────
revision: str = "9b2c3d4e5f6a"
down_revision: Union[str, None] = "8f4c2e1b0d7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ── 1. google_accounts table ──────────────────────────────────────────────
    if "google_accounts" not in existing_tables:
        op.create_table(
            "google_accounts",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column("encrypted_refresh_token", sa.Text(), nullable=False),
            sa.Column("access_token", sa.Text(), nullable=True),
            sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("scopes", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column(
                "sync_query",
                sa.String(length=500),
                nullable=False,
                server_default="has:attachment (filename:pdf OR filename:docx)",
            ),
            sa.Column(
                "sync_label",
                sa.String(length=100),
                nullable=False,
                server_default="INBOX",
            ),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "last_sync_status",
                sa.String(length=50),
                nullable=False,
                server_default="never",
            ),
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
                ["user_id"],
                ["users.id"],
                name="fk_google_accounts_user_id",
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_google_accounts_user_id"),
        )
        op.create_index("ix_google_accounts_id", "google_accounts", ["id"], unique=False)
        op.create_index("ix_google_accounts_user_id", "google_accounts", ["user_id"], unique=True)
        op.create_index("ix_google_accounts_email", "google_accounts", ["email"], unique=False)

    # ── 2. emails_synced table ────────────────────────────────────────────────
    if "emails_synced" not in existing_tables:
        op.create_table(
            "emails_synced",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("google_account_id", sa.UUID(), nullable=False),
            sa.Column("message_id", sa.String(length=255), nullable=False),
            sa.Column("thread_id", sa.String(length=255), nullable=True),
            sa.Column("sender", sa.String(length=320), nullable=True),
            sa.Column("subject", sa.String(length=500), nullable=True),
            sa.Column("snippet", sa.Text(), nullable=True),
            sa.Column("attachment_names", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("attachment_urls", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column(
                "synced_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["users.id"],
                name="fk_emails_synced_user_id",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["google_account_id"],
                ["google_accounts.id"],
                name="fk_emails_synced_account_id",
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "message_id", name="uq_emails_synced_user_message"),
        )
        op.create_index("ix_emails_synced_id", "emails_synced", ["id"], unique=False)
        op.create_index("ix_emails_synced_user_id", "emails_synced", ["user_id"], unique=False)
        op.create_index("ix_emails_synced_account_id", "emails_synced", ["google_account_id"], unique=False)
        op.create_index("ix_emails_synced_message_id", "emails_synced", ["message_id"], unique=False)

    # ── 3. job_openings: years_of_experience and nice_to_haves columns ────────
    if "job_openings" in existing_tables:
        job_openings_cols = {c["name"] for c in inspector.get_columns("job_openings")}
        if "years_of_experience" not in job_openings_cols:
            op.add_column("job_openings", sa.Column("years_of_experience", sa.Float(), nullable=True))
        if "nice_to_haves" not in job_openings_cols:
            op.add_column(
                "job_openings",
                sa.Column("nice_to_haves", sa.JSON(), nullable=False, server_default="[]"),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "job_openings" in existing_tables:
        cols = {c["name"] for c in inspector.get_columns("job_openings")}
        if "nice_to_haves" in cols:
            op.drop_column("job_openings", "nice_to_haves")
        if "years_of_experience" in cols:
            op.drop_column("job_openings", "years_of_experience")

    if "emails_synced" in existing_tables:
        op.drop_table("emails_synced")
    if "google_accounts" in existing_tables:
        op.drop_table("google_accounts")
