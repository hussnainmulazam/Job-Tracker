"""
Alembic env.py — wired to our FastAPI/SQLModel app.

Key points:
- DATABASE_URL is loaded from app.core.config (which reads .env), so there
  is a single source of truth — no duplication into alembic.ini.
- target_metadata is set to SQLModel.metadata so autogenerate can diff the
  current schema against the live database.
- All models are imported here (via app.models) so their table definitions
  are registered on SQLModel.metadata before autogenerate runs.
- compare_type=True tells Alembic to detect column *type* changes, not just
  add/drop columns.
"""

import sys
import os
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

from alembic import context

# ---------------------------------------------------------------------------
# Make sure "backend/" is on sys.path so `app.*` imports work when Alembic
# is invoked from within the backend/ directory.
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# ---------------------------------------------------------------------------
# Import settings (loads .env) and ALL models so metadata is populated.
# ---------------------------------------------------------------------------
from app.core.config import settings  # noqa: E402
import app.models  # noqa: E402  — registers all SQLModel tables as a side-effect

# ---------------------------------------------------------------------------
# Alembic Config
# ---------------------------------------------------------------------------
config = context.config

# Override sqlalchemy.url with the value from our .env-backed settings.
# This keeps alembic.ini clean (its placeholder url is never used).
config.set_main_option("sqlalchemy.url", settings.sync_database_url)

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Point autogenerate at SQLModel's shared metadata
target_metadata = SQLModel.metadata


# ---------------------------------------------------------------------------
# Migration runners
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """
    'Offline' mode — emit raw SQL to stdout/file without a live DB connection.
    Useful for review or for environments where you apply SQL manually.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    'Online' mode — connect to the database and apply migrations directly.
    Used by `alembic upgrade head` in CI/CD and local development.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
