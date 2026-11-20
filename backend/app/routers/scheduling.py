"""
scheduling.py
~~~~~~~~~~~~~
FastAPI router for interview scheduling, availability configuration,
tokenized public booking endpoints (/schedule/{token}), Google Calendar / Meet integration,
and automated 24h & 1h reminders.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.dependencies import CurrentUser
from app.core.rate_limit import rate_limit
from app.db import SessionDep
from app.models.interview import Interview, SchedulingLink
from app.schemas.scheduling import (
    AvailabilityScheduleCreateOrUpdate,
    AvailabilityScheduleRead,
    AvailabilityWeekPreviewResponse,
    CalendarSyncResponse,
    InterviewCancelRequest,
    InterviewRead,
    InterviewRescheduleRequest,
    InterviewResultRequest,
    InterviewResultResponse,
    OfferDraftResponse,
    OfferSendRequest,
    PublicBookSlotRequest,
    PublicSchedulePageInfo,
    PublicSlotsResponse,
    ReminderProcessResult,
    SchedulingLinkCreate,
    SchedulingLinkRead,
)
from app.services.scheduling_service import scheduling_service

router = APIRouter(prefix="/scheduling", tags=["Scheduling & Interviews"])


# ── 1. Recruiter Weekly Availability (Authenticated) ──────────────────────────

@router.get(
    "/availability",
    response_model=AvailabilityScheduleRead,
    summary="Get HR recruiter's weekly working availability",
)
def get_recruiter_availability(
    current_user: CurrentUser,
    session: SessionDep,
) -> AvailabilityScheduleRead:
    """Retrieve recruiter's weekly working schedule rules (default: Mon-Fri 09:00-17:00 Asia/Karachi)."""
    schedule = scheduling_service.get_or_create_availability(session, current_user.id)
    return schedule


@router.put(
    "/availability",
    response_model=AvailabilityScheduleRead,
    summary="Update HR recruiter's weekly working availability",
)
def update_recruiter_availability(
    payload: AvailabilityScheduleCreateOrUpdate,
    current_user: CurrentUser,
    session: SessionDep,
) -> AvailabilityScheduleRead:
    """Configure working days, hours per day, slot duration, buffer, and timezone."""
    schedule = scheduling_service.update_availability(session, current_user.id, payload)
    return schedule


@router.get(
    "/availability/week-preview",
    response_model=AvailabilityWeekPreviewResponse,
    summary="Get unified 7-day schedule view with Google busy events, booked interviews, and free slots",
)
async def get_recruiter_availability_week_preview(
    current_user: CurrentUser,
    session: SessionDep,
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD (defaults to current week Monday)"),
) -> AvailabilityWeekPreviewResponse:
    """Returns color-coded schedule preview: Google Busy, DB Booked Interviews, and Free Slots."""
    return await scheduling_service.get_availability_week_preview(
        session=session,
        user_id=current_user.id,
        start_date_str=start_date,
    )


@router.get(
    "/booking-link",
    response_model=SchedulingLinkRead,
    summary="Get or generate recruiter's active public booking link for sharing and preview",
)
def get_recruiter_booking_link(
    current_user: CurrentUser,
    session: SessionDep,
) -> SchedulingLinkRead:
    """Returns active recruiter scheduling link for copying or candidate-view preview."""
    return scheduling_service.get_or_create_recruiter_booking_link(session, current_user.id)



# ── 2. Scheduling Links (Authenticated HR Flow) ───────────────────────────────

@router.post(
    "/links",
    response_model=SchedulingLinkRead,
    status_code=status.HTTP_201_CREATED,
    summary="Generate tokenized candidate scheduling invitation link",
)
def create_candidate_scheduling_link(
    payload: SchedulingLinkCreate,
    current_user: CurrentUser,
    session: SessionDep,
) -> SchedulingLinkRead:
    """Creates a unique tokenized link (/schedule/{token}) valid for candidate booking."""
    link = scheduling_service.create_scheduling_link(
        session=session,
        user_id=current_user.id,
        candidate_id=payload.candidate_id,
        round_type=payload.round_type or "initial",
        slot_duration_minutes=payload.slot_duration_minutes,
        validity_days=payload.validity_days or 7,
    )
    return link


# ── 3. Public Candidate Scheduling Endpoints (Public - No Auth Required) ───────

@router.get(
    "/public/{token}",
    response_model=PublicSchedulePageInfo,
    summary="Get public scheduling page details for token (/schedule/{token})",
    dependencies=[Depends(rate_limit(times=60, seconds=60, scope="scheduling:public"))],
)
def get_public_schedule_page(
    token: str,
    session: SessionDep,
) -> PublicSchedulePageInfo:
    """Publicly accessible metadata for candidate scheduling page. Handles token expiry."""
    return scheduling_service.get_public_link_info(session, token)


@router.get(
    "/public/{token}/slots",
    response_model=PublicSlotsResponse,
    summary="Compute free slots from HR availability minus Google Calendar freeBusy minus DB interviews",
    dependencies=[Depends(rate_limit(times=60, seconds=60, scope="scheduling:public"))],
)
async def get_available_candidate_slots(
    token: str,
    session: SessionDep,
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    tz: Optional[str] = Query("Asia/Karachi", description="Candidate requested timezone"),
) -> PublicSlotsResponse:
    """Computes available interview slots strictly filtering out Google Calendar conflicts and double-bookings."""
    return await scheduling_service.compute_available_slots(
        session=session,
        token=token,
        start_date=start_date,
        end_date=end_date,
        candidate_tz_str=tz,
    )


@router.post(
    "/public/{token}/book",
    response_model=InterviewRead,
    status_code=status.HTTP_201_CREATED,
    summary="Candidate books interview slot -> creates Meet event & DB interview with exclusion lock",
    dependencies=[Depends(rate_limit(times=20, seconds=60, scope="scheduling:book"))],
)
async def book_candidate_slot(
    token: str,
    payload: PublicBookSlotRequest,
    session: SessionDep,
) -> InterviewRead:
    """Books a slot: creates Google Meet event, prevents double-booking via DB constraint, dispatches confirmation."""
    return await scheduling_service.book_slot(
        session=session,
        token=token,
        start_time=payload.start_time,
        booking_tz_str=payload.timezone,
        notes=payload.notes,
    )


@router.post(
    "/public/{token}/reschedule",
    response_model=InterviewRead,
    summary="Candidate reschedules booked interview",
)
async def candidate_reschedule_interview(
    token: str,
    payload: InterviewRescheduleRequest,
    session: SessionDep,
) -> InterviewRead:
    """Allows candidate to reschedule their interview using their link token."""
    link_info = scheduling_service.get_public_link_info(session, token)
    if not link_info.existing_interview:
        raise HTTPException(status_code=400, detail="No active booked interview associated with this link.")

    return await scheduling_service.reschedule_interview(
        session=session,
        interview_id=link_info.existing_interview.id,
        new_start_time=payload.new_start_time,
        reschedule_tz_str=payload.timezone,
        reason=payload.reason or "Candidate requested reschedule",
    )


@router.post(
    "/public/{token}/cancel",
    response_model=InterviewRead,
    summary="Candidate cancels booked interview",
)
async def candidate_cancel_interview(
    token: str,
    payload: InterviewCancelRequest,
    session: SessionDep,
) -> InterviewRead:
    """Allows candidate to cancel their scheduled interview."""
    link_info = scheduling_service.get_public_link_info(session, token)
    if not link_info.existing_interview:
        raise HTTPException(status_code=400, detail="No active booked interview found to cancel.")

    return await scheduling_service.cancel_interview(
        session=session,
        interview_id=link_info.existing_interview.id,
        reason=payload.reason or "Cancelled by candidate",
        cancelled_by="candidate",
    )


# ── 4. Recruiter Interview Management & Calendar View (Authenticated) ─────────

@router.get(
    "/interviews",
    response_model=List[InterviewRead],
    summary="List recruiter's interviews for calendar/agenda view",
)
def list_recruiter_interviews(
    current_user: CurrentUser,
    session: SessionDep,
    opening_id: Optional[uuid.UUID] = Query(None),
    candidate_id: Optional[uuid.UUID] = Query(None),
    status: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
) -> List[InterviewRead]:
    """Retrieves all scheduled, completed, and cancelled interviews for the recruiter."""
    return scheduling_service.list_interviews(
        session=session,
        user_id=current_user.id,
        opening_id=opening_id,
        candidate_id=candidate_id,
        status_filter=status,
        from_date=from_date,
        to_date=to_date,
    )


@router.post(
    "/interviews/{interview_id}/reschedule",
    response_model=InterviewRead,
    summary="HR reschedules an interview",
)
async def hr_reschedule_interview(
    interview_id: uuid.UUID,
    payload: InterviewRescheduleRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> InterviewRead:
    """HR reschedules interview to a new slot."""
    return await scheduling_service.reschedule_interview(
        session=session,
        interview_id=interview_id,
        new_start_time=payload.new_start_time,
        reschedule_tz_str=payload.timezone,
        reason=payload.reason or "Rescheduled by HR",
        user_id=current_user.id,
    )


@router.post(
    "/interviews/{interview_id}/cancel",
    response_model=InterviewRead,
    summary="HR cancels an interview",
)
async def hr_cancel_interview(
    interview_id: uuid.UUID,
    payload: InterviewCancelRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> InterviewRead:
    """HR cancels an interview, releases calendar event and notifies candidate."""
    return await scheduling_service.cancel_interview(
        session=session,
        interview_id=interview_id,
        reason=payload.reason or "Cancelled by HR",
        cancelled_by="hr",
        user_id=current_user.id,
    )


@router.post(
    "/interviews/{interview_id}/result",
    response_model=InterviewResultResponse,
    summary="Record interview outcome (Passed, Failed, No-show) and trigger next lifecycle stage",
)
def record_interview_outcome(
    interview_id: uuid.UUID,
    payload: InterviewResultRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> InterviewResultResponse:
    """
    Evaluates interview:
      - Initial Passed: creates Behavioral link (45m) & sends invite
      - Behavioral Passed: creates Final link (60m) & sends invite
      - Final Passed: creates Offer Letter draft (does NOT send automatically)
      - Failed: sends Rejection email & marks candidate rejected
      - No-show: marks no-show without rejecting
    """
    return scheduling_service.record_interview_result(
        session=session,
        user_id=current_user.id,
        interview_id=interview_id,
        result_status=payload.result,
        feedback=payload.feedback,
    )


@router.get(
    "/offer-draft/{candidate_id}",
    response_model=OfferDraftResponse,
    summary="Get candidate's Offer Letter draft for HR review",
)
def get_candidate_offer_draft(
    candidate_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
) -> OfferDraftResponse:
    """Retrieves or prepares the Offer Letter draft before HR approves and dispatches it."""
    return scheduling_service.get_offer_draft(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
    )


@router.post(
    "/offer-draft/{candidate_id}/send",
    response_model=OfferDraftResponse,
    summary="Approve & Send Offer Letter email to candidate",
)
def approve_and_send_offer_letter(
    candidate_id: uuid.UUID,
    payload: OfferSendRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> OfferDraftResponse:
    """
    Strict security gate: HR explicitly approves and dispatches the Offer Letter.
    Offer letters are never sent automatically.
    """
    return scheduling_service.approve_and_send_offer(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        payload=payload,
    )


@router.post(
    "/sync-calendar",
    response_model=CalendarSyncResponse,
    summary="Sync interviews with connected Google Calendar events",
)
async def sync_google_calendar(
    current_user: CurrentUser,
    session: SessionDep,
) -> CalendarSyncResponse:
    """Reconciles interview sessions with Google Calendar events and updates statuses."""
    result = await scheduling_service.sync_google_calendar_events(
        session=session,
        user_id=current_user.id,
    )
    return CalendarSyncResponse(**result)


# ── 5. Reminder Background Job Trigger ────────────────────────────────────────

@router.post(
    "/reminders/process",
    response_model=ReminderProcessResult,
    summary="Process and dispatch 24h & 1h interview reminders",
)
async def process_interview_reminders(
    session: SessionDep,
) -> ReminderProcessResult:
    """Background cron endpoint: checks upcoming interviews and sends 24h & 1h reminders."""
    return await scheduling_service.process_reminders(session)
