from collections.abc import Generator
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

# pool_pre_ping=True ensures idle connections dropped by Neon serverless pooler are refreshed
# connect_timeout prevents indefinite hangs if the database host is unreachable
engine = create_engine(
    settings.sync_database_url,
    echo=(settings.ENVIRONMENT == "development"),
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
)


def init_db() -> None:
    """Create all SQLModel tables in the database."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """Yield a database session per request."""
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
