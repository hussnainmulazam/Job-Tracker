"""
app/routers/dashboard.py
~~~~~~~~~~~~~~~~~~~~~~~~
Recruiter Dashboard endpoints for live KPI analytics and summary metrics.
"""
from fastapi import APIRouter, status

from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.schemas.dashboard import DashboardStatsResponse
from app.services.dashboard_service import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get(
    "/stats",
    response_model=DashboardStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get recruiter dashboard KPI metrics and pipeline stats",
)
def get_dashboard_stats(
    session: SessionDep,
    current_user: CurrentUser,
) -> DashboardStatsResponse:
    """
    Returns real-time aggregated metrics computed from live database rows.
    Zero mock/fake data.
    """
    return dashboard_service.get_stats(session=session, user_id=current_user.id)
