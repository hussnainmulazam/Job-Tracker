from fastapi import APIRouter
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

