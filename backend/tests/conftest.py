"""
tests/conftest.py
~~~~~~~~~~~~~~~~~
Pytest fixtures for testing FastAPI with complete database isolation.

Guarantees:
  - Separate test database or schema: Uses TEST_DATABASE_URL (or in-memory SQLite).
  - Never touches real production Supabase data (safety validation enforced).
  - Explicit row clean-up after EVERY test in addition to schema tear-down.
  - Production database initialization is mocked out during TestClient lifespan.
"""
import os
os.environ["TESTING"] = "true"
from typing import Generator
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, delete
from sqlmodel.pool import StaticPool

from app.core.config import settings
from app.db import get_session
from app.main import app
from app.models.candidate import Candidate
from app.models.candidate_link import CandidateLink
from app.models.job_opening import JobOpening
from app.models.message import Message
from app.models.scorecard import Scorecard
from app.models.application import Application
from app.models.cv_version import CVVersion
from app.models.job import Job
from app.models.user import User

# Dedicated test database URL. Default to isolated in-memory SQLite with StaticPool.
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")

# Safety assertion: Ensure tests NEVER point to production Supabase public data
if "sqlite" not in TEST_DATABASE_URL:
    assert (
        TEST_DATABASE_URL != settings.DATABASE_URL
        or "test" in TEST_DATABASE_URL.lower()
    ), "SAFETY VIOLATION: Test suite must never target production DATABASE_URL without a dedicated test schema!"


@pytest.fixture(autouse=True)
def reset_rate_limits_fixture():
    """Reset rate limiter before and after each test to avoid rate-limiting test fixtures."""
    from app.core.rate_limit import reset_rate_limits
    reset_rate_limits()
    yield
    reset_rate_limits()


@pytest.fixture(name="engine", scope="function")
def engine_fixture():
    """Create isolated test database engine with schema isolation."""
    if "sqlite" in TEST_DATABASE_URL:
        engine = create_engine(
            TEST_DATABASE_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        # PostgreSQL: ensure isolated test schema
        engine = create_engine(TEST_DATABASE_URL)
        with engine.connect() as conn:
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS test_schema"))
            conn.execute(text("SET search_path TO test_schema"))
            conn.commit()

    SQLModel.metadata.create_all(engine)
    yield engine

    # Clean up all tables after each test
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(name="session", scope="function")
def session_fixture(engine) -> Generator[Session, None, None]:
    """Yield a fresh session per test and clean up created rows after each test."""
    with Session(engine) as session:
        yield session

    # Explicit row clean-up after each test to guarantee no lingering test data
    from app.models import (
        Application,
        AuditLog,
        AvailabilitySchedule,
        Candidate,
        CandidateLink,
        CVVersion,
        EmailSynced,
        GoogleAccount,
        Interview,
        Job,
        JobOpening,
        Message,
        Notification,
        SchedulingLink,
        Scorecard,
        User,
    )

    with Session(engine) as cleanup_session:
        for model in [
            AuditLog,
            Notification,
            Interview,
            SchedulingLink,
            AvailabilitySchedule,
            Message,
            CandidateLink,
            EmailSynced,
            GoogleAccount,
            Scorecard,
            Candidate,
            JobOpening,
            CVVersion,
            Application,
            Job,
            User,
        ]:
            try:
                cleanup_session.exec(delete(model))
                cleanup_session.commit()
            except Exception:
                cleanup_session.rollback()


@pytest.fixture(name="client", scope="function")
def client_fixture(session: Session) -> Generator[TestClient, None, None]:
    """FastAPI TestClient with isolated DB session and mocked production init_db."""
    def get_session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = get_session_override

    # Patch init_db during lifespan so tests never connect to production PostgreSQL
    with patch("app.main.init_db", return_value=None), \
         patch("app.db.init_db", return_value=None):
        with TestClient(app) as test_client:
            yield test_client

    app.dependency_overrides.clear()


@pytest.fixture(name="register_user")
def register_user_fixture(client: TestClient):
    """Factory fixture to register a user and return (user_dict, auth_headers)."""
    def _create_user(email: str = "alice@example.com", password: str = "Password123!"):
        res = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password},
        )
        assert res.status_code == 201, f"Failed to register test user: {res.text}"
        data = res.json()
        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        return data["user"], headers

    return _create_user


@pytest.fixture(name="user_a")
def user_a_fixture(register_user):
    """User A credentials and headers."""
    user, headers = register_user(email="user_a@example.com", password="PasswordA123!")
    return {"user": user, "headers": headers}


@pytest.fixture(name="user_b")
def user_b_fixture(register_user):
    """User B credentials and headers."""
    user, headers = register_user(email="user_b@example.com", password="PasswordB123!")
    return {"user": user, "headers": headers}
