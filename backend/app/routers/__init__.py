from app.routers.agent_settings import router as agent_settings_router
from app.routers.ai import router as ai_router
from app.routers.api import api_router
from app.routers.auth import router as auth_router
from app.routers.candidates import router as candidates_router
from app.routers.cv_review import router as cv_review_router
from app.routers.dashboard import router as dashboard_router
from app.routers.health import router as health_router
from app.routers.job_openings import router as job_openings_router
from app.routers.notifications import router as notifications_router
from app.routers.onboarding import router as onboarding_router
from app.routers.outreach import router as outreach_router
from app.routers.scheduling import router as scheduling_router
from app.routers.search import router as search_router

__all__ = [
    "api_router",
    "auth_router",
    "job_openings_router",
    "candidates_router",
    "cv_review_router",
    "notifications_router",
    "onboarding_router",
    "outreach_router",
    "scheduling_router",
    "search_router",
    "dashboard_router",
    "agent_settings_router",
    "ai_router",
    "health_router",
]
