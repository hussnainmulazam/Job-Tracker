import logging
import time
from collections.abc import Generator
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine, text

from app.core.config import settings

logger = logging.getLogger(__name__)

# Parse port and scheme from the database URL
_parsed_url = urlsplit(settings.DATABASE_URL)
_connect_args: dict = {"connect_timeout": 10}

# Port 6543 is Supabase's transaction pooler (PgBouncer/Supavisor transaction mode).
# In transaction mode, server-side prepared statements are unsupported and cause errors.
# In psycopg 3, setting prepare_threshold=None disables prepared statements.
if _parsed_url.port == 6543 or ":6543" in settings.DATABASE_URL:
    _connect_args["prepare_threshold"] = None

# Create SQLModel engine ONCE at startup with connection pooling and quick connect timeout
_engine_kwargs: dict = {
    "echo": (settings.ENVIRONMENT == "development"),
    "pool_pre_ping": True,
    "connect_args": _connect_args,
}

# QueuePool parameters (PostgreSQL / Supabase)
if "sqlite" not in settings.sync_database_url:
    _engine_kwargs.update({
        "pool_size": 5,
        "max_overflow": 5,
        "pool_recycle": 1800,
    })

engine = create_engine(
    settings.sync_database_url,
    **_engine_kwargs,
)


# Log slow queries taking longer than 300 ms
@event.listens_for(engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    context._query_start_time = time.perf_counter()


@event.listens_for(engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    start_time = getattr(context, "_query_start_time", None)
    if start_time is not None:
        duration_ms = (time.perf_counter() - start_time) * 1000
        if duration_ms > 300:
            logger.warning(
                "SLOW QUERY (%.2f ms): %s",
                duration_ms,
                statement.strip().replace("\n", " ")[:200],
            )


def init_db() -> None:
    """Create all SQLModel tables in the database."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """Yield a database session per request."""
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
