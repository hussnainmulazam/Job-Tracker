"""create_candidate_links_and_extracted_details

Revision ID: a1c2e3g4i5k6
Revises: 9b2c3d4e5f6a
Create Date: 2026-11-17

Adds candidate detail extraction fields and links table:
  - candidates: phone, address, github_url, linkedin_url, portfolio_url,
                kaggle_url, extracted_data
  - candidate_links table: id, candidate_id (FK cascade), user_id (FK cascade),
                           link_type, url, is_verified, confidence, source,
                           created_at, updated_at
  - job_openings: google_sheet_id, google_sheet_url
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1c2e3g4i5k6"
down_revision: Union[str, None] = "9b2c3d4e5f6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ── 1. candidates: add contact and profile URL columns ────────────────────
    if "candidates" in existing_tables:
        candidate_cols = {c["name"] for c in inspector.get_columns("candidates")}
        if "phone" not in candidate_cols:
            op.add_column("candidates", sa.Column("phone", sa.String(length=50), nullable=True))
        if "address" not in candidate_cols:
            op.add_column("candidates", sa.Column("address", sa.String(length=255), nullable=True))
        if "github_url" not in candidate_cols:
            op.add_column("candidates", sa.Column("github_url", sa.String(length=500), nullable=True))
        if "linkedin_url" not in candidate_cols:
            op.add_column("candidates", sa.Column("linkedin_url", sa.String(length=500), nullable=True))
        if "portfolio_url" not in candidate_cols:
            op.add_column("candidates", sa.Column("portfolio_url", sa.String(length=500), nullable=True))
        if "kaggle_url" not in candidate_cols:
            op.add_column("candidates", sa.Column("kaggle_url", sa.String(length=500), nullable=True))
        if "extracted_data" not in candidate_cols:
            op.add_column(
                "candidates",
                sa.Column("extracted_data", sa.JSON(), nullable=False, server_default="{}"),
            )

    # ── 2. job_openings: add Google Sheet sync columns ────────────────────────
    if "job_openings" in existing_tables:
        opening_cols = {c["name"] for c in inspector.get_columns("job_openings")}
        if "google_sheet_id" not in opening_cols:
            op.add_column("job_openings", sa.Column("google_sheet_id", sa.String(length=255), nullable=True))
        if "google_sheet_url" not in opening_cols:
            op.add_column("job_openings", sa.Column("google_sheet_url", sa.String(length=500), nullable=True))

    # ── 3. candidate_links table ──────────────────────────────────────────────
    if "candidate_links" not in existing_tables:
        op.create_table(
            "candidate_links",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("candidate_id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("link_type", sa.String(length=50), nullable=False),
            sa.Column("url", sa.String(length=1000), nullable=False),
            sa.Column("is_verified", sa.Boolean(), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=False, server_default="1.0"),
            sa.Column("source", sa.String(length=50), nullable=False, server_default="regex"),
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
                ["candidate_id"],
                ["candidates.id"],
                name="fk_candidate_links_candidate_id",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["users.id"],
                name="fk_candidate_links_user_id",
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_candidate_links_id", "candidate_links", ["id"], unique=False)
        op.create_index("ix_candidate_links_candidate_id", "candidate_links", ["candidate_id"], unique=False)
        op.create_index("ix_candidate_links_user_id", "candidate_links", ["user_id"], unique=False)
        op.create_index("ix_candidate_links_link_type", "candidate_links", ["link_type"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "candidate_links" in existing_tables:
        op.drop_table("candidate_links")

    if "job_openings" in existing_tables:
        opening_cols = {c["name"] for c in inspector.get_columns("job_openings")}
        if "google_sheet_url" in opening_cols:
            op.drop_column("job_openings", "google_sheet_url")
        if "google_sheet_id" in opening_cols:
            op.drop_column("job_openings", "google_sheet_id")

    if "candidates" in existing_tables:
        candidate_cols = {c["name"] for c in inspector.get_columns("candidates")}
        for col in [
            "extracted_data",
            "kaggle_url",
            "portfolio_url",
            "linkedin_url",
            "github_url",
            "address",
            "phone",
        ]:
            if col in candidate_cols:
                op.drop_column("candidates", col)
