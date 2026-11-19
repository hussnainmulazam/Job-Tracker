import time
from urllib.parse import urlsplit
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlmodel import text

from app.core.config import settings
from app.db import SessionDep
from app.schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def health_check(session: SessionDep) -> HealthResponse:
    """Check backend service health and Supabase PostgreSQL connectivity."""
    db_status = "connected"
    try:
        session.exec(text("SELECT 1"))
    except Exception as exc:
        db_status = f"unreachable: {exc}"

    return HealthResponse(
        status="ok" if db_status == "connected" else "degraded",
        database=db_status,
        app=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
    )


@router.get("/health/db")
def health_db_check(session: SessionDep):
    """
    Run SELECT 1 directly on PostgreSQL/Supabase and return connection latency in milliseconds.
    Never exposes credentials or connection passwords.
    """
    t0 = time.perf_counter()
    try:
        session.exec(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        parsed = urlsplit(settings.DATABASE_URL)
        return {
            "status": "connected",
            "latency_ms": latency_ms,
            "host": parsed.hostname,
            "port": parsed.port or 5432,
            "mode": "transaction" if parsed.port == 6543 else "session",
        }
    except Exception as exc:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "error": str(exc),
                "latency_ms": latency_ms,
            },
        )

