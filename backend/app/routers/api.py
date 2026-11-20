"""
API Router v1 — aggregator for all sub-routers.
"""
from fastapi import APIRouter
from app.routers import (
    agent_settings,
    ai,
    auth,
    auth_google,
    candidates,
    cv_review,
    dashboard,
    health,
    integrations_google,
    job_openings,
    notifications,
    onboarding,
    outreach,
    scheduling,
    scorecards,
    search,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(auth_google.router)
api_router.include_router(integrations_google.router)
api_router.include_router(outreach.router)
api_router.include_router(scheduling.router)
api_router.include_router(job_openings.router)
api_router.include_router(job_openings.openings_alias_router)
api_router.include_router(candidates.router)
api_router.include_router(cv_review.router)
api_router.include_router(scorecards.router)
api_router.include_router(dashboard.router)
api_router.include_router(notifications.router)
api_router.include_router(onboarding.router)
api_router.include_router(search.router)
api_router.include_router(agent_settings.router)
api_router.include_router(ai.router)
