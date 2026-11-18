"""create_job_openings_candidates_scorecards

Revision ID: 8f4c2e1b0d7a
Revises: 5c7d97390c6d
Create Date: 2026-11-17

Adds recruiter screening tables:
  - job_openings  (UUID PK, FK→users, title, description, required_skills, status enum,
                   created_at, updated_at)
  - candidates    (UUID PK, FK→users, FK→job_openings, name, email, cv_text, cv_file_url,
                   score, matched_skills, missing_skills, red_flags, summary, stage enum,
                   created_at, updated_at)
  - scorecards    (UUID PK, FK→users, FK→candidates, rating, notes,
                   created_at, updated_at)

All tables are scoped by user_id. Existing tables (users, applications, cv_versions)
are preserved and NOT dropped.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# ── Revision identifiers ─────────────────────────────────────────────────────
revision: str = "8f4c2e1b0d7a"
down_revision: Union[str, None] = "5c7d97390c6d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ── 1. PostgreSQL ENUM types (idempotent creation) ────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE jobopeningstatus AS ENUM ('draft', 'active', 'paused', 'closed');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE candidatestage AS ENUM ('applied', 'screening', 'interview', 'offer', 'rejected');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    job_opening_status = sa.Enum(
        "draft", "active", "paused", "closed",
        name="jobopeningstatus",
        create_type=False,
    )
    candidate_stage = sa.Enum(
        "applied", "screening", "interview", "offer", "rejected",
        name="candidatestage",
        create_type=False,
    )

    # ── 2. job_openings table ─────────────────────────────────────────────────
    if "job_openings" not in existing_tables:
        op.create_table(
            "job_openings",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("required_skills", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column(
                "status",
                job_opening_status,
                nullable=False,
                server_default="active",
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
                ["user_id"], ["users.id"],
                name="fk_job_openings_user_id",
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_job_openings_id", "job_openings", ["id"], unique=False)
        op.create_index("ix_job_openings_user_id", "job_openings", ["user_id"], unique=False)
        op.create_index("ix_job_openings_title", "job_openings", ["title"], unique=False)
        op.create_index("ix_job_openings_status", "job_openings", ["status"], unique=False)

    # ── 3. candidates table ───────────────────────────────────────────────────
    if "candidates" not in existing_tables:
        op.create_table(
            "candidates",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("opening_id", sa.UUID(), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column("cv_text", sa.Text(), nullable=False),
            sa.Column("cv_file_url", sa.String(length=2048), nullable=True),
            sa.Column("score", sa.Float(), nullable=True),
            sa.Column("matched_skills", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("missing_skills", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("red_flags", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column(
                "stage",
                candidate_stage,
                nullable=False,
                server_default="applied",
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
                ["user_id"], ["users.id"],
                name="fk_candidates_user_id",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["opening_id"], ["job_openings.id"],
                name="fk_candidates_opening_id",
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_candidates_id", "candidates", ["id"], unique=False)
        op.create_index("ix_candidates_user_id", "candidates", ["user_id"], unique=False)
        op.create_index("ix_candidates_opening_id", "candidates", ["opening_id"], unique=False)
        op.create_index("ix_candidates_email", "candidates", ["email"], unique=False)
        op.create_index("ix_candidates_stage", "candidates", ["stage"], unique=False)
        op.create_index("ix_candidates_score", "candidates", ["score"], unique=False)
    else:
        # Check if red_flags column exists on existing candidates table
        candidate_cols = {c["name"] for c in inspector.get_columns("candidates")}
        if "red_flags" not in candidate_cols:
            op.add_column(
                "candidates",
                sa.Column("red_flags", sa.JSON(), nullable=False, server_default="[]"),
            )

    # ── 4. scorecards table ───────────────────────────────────────────────────
    if "scorecards" not in existing_tables:
        op.create_table(
            "scorecards",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("candidate_id", sa.UUID(), nullable=False),
            sa.Column("rating", sa.Integer(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
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
                name="fk_scorecards_user_id",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["candidate_id"], ["candidates.id"],
                name="fk_scorecards_candidate_id",
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_scorecards_id", "scorecards", ["id"], unique=False)
        op.create_index("ix_scorecards_user_id", "scorecards", ["user_id"], unique=False)
        op.create_index("ix_scorecards_candidate_id", "scorecards", ["candidate_id"], unique=False)


def downgrade() -> None:
    op.drop_table("scorecards")
    op.drop_table("candidates")
    op.drop_table("job_openings")
    sa.Enum(name="candidatestage").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="jobopeningstatus").drop(op.get_bind(), checkfirst=True)
