"""
API Router v1 — aggregator for all sub-routers.
"""
from fastapi import APIRouter
from app.routers import (
    ai,
    auth,
    auth_google,
    candidates,
    dashboard,
    health,
    integrations_google,
    job_openings,
    notifications,
    outreach,
    scheduling,
    scorecards,
    search,
    whatsapp,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(auth_google.router)
api_router.include_router(integrations_google.router)
api_router.include_router(whatsapp.router)
api_router.include_router(outreach.router)
api_router.include_router(scheduling.router)
api_router.include_router(job_openings.router)
api_router.include_router(job_openings.openings_alias_router)
api_router.include_router(candidates.router)
api_router.include_router(scorecards.router)
api_router.include_router(dashboard.router)
api_router.include_router(notifications.router)
api_router.include_router(search.router)
api_router.include_router(ai.router)
