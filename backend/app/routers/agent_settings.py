"""
agent_settings.py
~~~~~~~~~~~~~~~~~
FastAPI router for Agent Settings and Today's Activity Dashboard:
- Pause / Resume autonomous agent execution
- Daily send limits and remaining quota
- Real-time HR email alerts (booking, reply, failure)
- Daily recruiting summary email trigger
- What the agent did today activity feed
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.schemas.agent_settings import (
    AgentPauseToggleRequest,
    AgentSettingsRead,
    AgentSettingsUpdate,
    AgentTodayActivityResponse,
    DailySummarySendRequest,
    DailySummarySendResponse,
)
from app.services.agent_settings_service import agent_settings_service

router = APIRouter(prefix="/agent", tags=["Autonomous Agent Settings & Controls"])


@router.get(
    "/settings",
    response_model=AgentSettingsRead,
    summary="Get Agent Settings, pause status, and today's send quota usage",
)
def get_agent_settings(
    current_user: CurrentUser,
    session: SessionDep,
) -> AgentSettingsRead:
    """Retrieve recruiter's agent settings including pause status and daily send quota."""
    settings_obj = agent_settings_service.get_or_create_settings(session, current_user.id)
    return agent_settings_service.to_read(session, settings_obj)


@router.put(
    "/settings",
    response_model=AgentSettingsRead,
    summary="Update Agent Settings (daily send limit, notification toggles, summary time)",
)
def update_agent_settings(
    payload: AgentSettingsUpdate,
    current_user: CurrentUser,
    session: SessionDep,
) -> AgentSettingsRead:
    """Configures daily send limits, notification recipient, alert toggles, and daily summary schedule."""
    return agent_settings_service.update_settings(session, current_user.id, payload)


@router.post(
    "/pause",
    response_model=AgentSettingsRead,
    summary="Pause or resume autonomous recruiting agent",
)
def toggle_agent_pause(
    payload: AgentPauseToggleRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> AgentSettingsRead:
    """
    Toggles or sets the agent pause state.
    When paused, autonomous message dispatches and intake actions are halted.
    """
    return agent_settings_service.toggle_pause(
        session=session,
        user_id=current_user.id,
        paused=payload.paused,
        reason=payload.reason,
    )


@router.get(
    "/today-activity",
    response_model=AgentTodayActivityResponse,
    summary="Status page: What the agent did today (CVs ingested, scored, interviews, feed)",
)
def get_today_agent_activity(
    current_user: CurrentUser,
    session: SessionDep,
) -> AgentTodayActivityResponse:
    """
    Live status dashboard feed:
      - Quota usage vs daily limit
      - Counts for today: CVs ingested, scored, waiting review, interviews booked/scheduled, failures
      - Chronological audit log activity feed
    """
    return agent_settings_service.get_today_activity(session, current_user.id)


@router.post(
    "/send-daily-summary",
    response_model=DailySummarySendResponse,
    summary="Generate and dispatch daily recruiting summary email to HR immediately",
)
def send_daily_summary_now(
    payload: DailySummarySendRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> DailySummarySendResponse:
    """
    Compiles today's recruiting brief (new CVs, waiting for review, interviews today)
    and sends it to HR via email.
    """
    return agent_settings_service.send_daily_summary_email(
        session=session,
        user_id=current_user.id,
        force=payload.force,
        recipient_email=payload.recipient_email,
    )


@router.post(
    "/test-failure-alert",
    summary="Send a test failure alert to verify real-time email notification delivery",
)
def send_test_failure_alert(
    current_user: CurrentUser,
    session: SessionDep,
) -> dict:
    """Triggers a sample failure alert email to verify HR alert notifications."""
    agent_settings_service.notify_hr_instant(
        session=session,
        user_id=current_user.id,
        event_type="failure",
        candidate_name="System Diagnostic Test",
        opening_title="Test Integration Probe",
        details="Sample error alert triggered to verify HR instant email delivery settings.",
        error_details="Diagnostic status: OK. Email pipeline verification test.",
    )
    return {"status": "ok", "message": "Test failure alert dispatched to HR notification email."}
