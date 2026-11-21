"""
backend/app/routers/calendar.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Google Calendar events router:
GET /api/v1/calendar/events?start=&end=
Fetches events from Google Calendar API (calendar.events.list) with singleEvents=true,
enriches with app interview records, caches for 60s in-memory, and provides working-hours shading.
"""
import logging
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlmodel import select

from app.core.config import settings
from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.models.google_account import GoogleAccount
from app.models.interview import AvailabilitySchedule, Interview, InterviewStatus
from app.models.job_opening import JobOpening
from app.services.calendar_cache import calendar_cache
from app.services.google_service import GoogleService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calendar", tags=["Google Calendar"])

GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"

# Google Calendar default palette mapping
GOOGLE_EVENT_COLORS: Dict[str, str] = {
    "1": "#7986CB",   # Lavender
    "2": "#33B679",   # Sage
    "3": "#8E24AA",   # Grape
    "4": "#E67C73",   # Flamingo
    "5": "#F6BF26",   # Banana
    "6": "#F4511E",   # Tangerine
    "7": "#039BE5",   # Peacock
    "8": "#616161",   # Graphite
    "9": "#3F51B5",   # Blueberry
    "10": "#0B8043",  # Basil
    "11": "#D50000",  # Tomato
}

ROUND_COLORS: Dict[str, str] = {
    "initial": "#6366F1",     # Indigo
    "technical": "#0EA5E9",   # Sky Blue
    "behavioral": "#8B5CF6",  # Purple
    "final": "#10B981",       # Emerald
}

WEEKDAY_MAP: Dict[str, int] = {
    "sun": 0,
    "mon": 1,
    "tue": 2,
    "wed": 3,
    "thu": 4,
    "fri": 5,
    "sat": 6,
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class CalendarAttendee(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    response_status: Optional[str] = None


class CalendarInterviewData(BaseModel):
    interview_id: str
    candidate_id: str
    candidate_name: str
    candidate_email: str
    candidate_phone: Optional[str] = None
    opening_id: Optional[str] = None
    opening_title: Optional[str] = None
    round: str
    status: str
    result_status: Optional[str] = None
    feedback: Optional[str] = None
    meet_link: Optional[str] = None


class CalendarEventItem(BaseModel):
    id: str
    title: str
    start: str
    end: str
    all_day: bool = False
    attendees: List[CalendarAttendee] = []
    meet_link: Optional[str] = None
    status: str = "confirmed"
    color: str = "#3B82F6"
    is_interview: bool = False
    interview_data: Optional[CalendarInterviewData] = None


class BusinessHourPeriod(BaseModel):
    days_of_week: List[int]
    start_time: str
    end_time: str


class CalendarEventsResponse(BaseModel):
    connected: bool = True
    reconnect_required: bool = False
    message: Optional[str] = None
    time_zone: str = "Asia/Karachi"
    business_hours: List[BusinessHourPeriod] = []
    events: List[CalendarEventItem] = []


# ── Helper Functions ──────────────────────────────────────────────────────────

def _parse_datetime(dt_str: Optional[str], default: datetime) -> datetime:
    if not dt_str:
        return default
    clean = dt_str.strip()
    try:
        if len(clean) == 10:  # YYYY-MM-DD
            dt = datetime.strptime(clean, "%Y-%m-%d")
            return dt.replace(tzinfo=timezone.utc)
        # Handle ISO strings (e.g. 2026-11-20T00:00:00.000Z or +00:00)
        iso = clean.replace("Z", "+00:00")
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return default


def _extract_meet_link(item: Dict[str, Any]) -> Optional[str]:
    # 1. Direct hangoutLink
    if item.get("hangoutLink"):
        return item["hangoutLink"]
    # 2. conferenceData entryPoints
    conf = item.get("conferenceData") or {}
    for ep in conf.get("entryPoints") or []:
        if ep.get("uri") and "meet.google.com" in ep["uri"]:
            return ep["uri"]
        elif ep.get("uri") and ep.get("entryPointType") == "video":
            return ep["uri"]
    # 3. Location / description check
    loc = item.get("location") or ""
    if "meet.google.com/" in loc:
        for part in loc.split():
            if "meet.google.com/" in part:
                return part.strip(",;")
    desc = item.get("description") or ""
    if "meet.google.com/" in desc:
        for part in desc.split():
            if "meet.google.com/" in part:
                return part.strip(",;")
    return None


def _format_business_hours(avail: Optional[AvailabilitySchedule]) -> List[BusinessHourPeriod]:
    if not avail or not avail.weekly_hours:
        # Default Mon-Fri 09:00 to 17:00
        return [
            BusinessHourPeriod(days_of_week=[1, 2, 3, 4, 5], start_time="09:00", end_time="17:00")
        ]

    periods: List[BusinessHourPeriod] = []
    weekly = avail.weekly_hours
    if isinstance(weekly, dict):
        for day_str, slots in weekly.items():
            day_num = WEEKDAY_MAP.get(day_str.lower()[:3])
            if day_num is None or not isinstance(slots, list):
                continue
            for slot in slots:
                if isinstance(slot, dict) and "start" in slot and "end" in slot:
                    periods.append(
                        BusinessHourPeriod(
                            days_of_week=[day_num],
                            start_time=slot["start"],
                            end_time=slot["end"],
                        )
                    )
    return periods or [
        BusinessHourPeriod(days_of_week=[1, 2, 3, 4, 5], start_time="09:00", end_time="17:00")
    ]


# ── Calendar Events Endpoint ──────────────────────────────────────────────────

@router.get(
    "/events",
    response_model=CalendarEventsResponse,
    summary="Get visible Google Calendar events enriched with interview sessions",
)
async def get_calendar_events(
    current_user: CurrentUser,
    session: SessionDep,
    start: Optional[str] = Query(None, description="Visible range start ISO string or YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="Visible range end ISO string or YYYY-MM-DD"),
) -> CalendarEventsResponse:
    """
    Fetches real Google Calendar events for the authenticated recruiter within visible [start, end].
    - Light fields only (id, title, start, end, attendees, meet link, status, color).
    - Interview events created by our agent are distinctively styled with round badges.
    - Cached in-memory per user for 60 seconds (cleared when interviews are scheduled/cancelled).
    - Respects user timezone and provides working-hours shading from Setup Wizard.
    - Never logs authorization tokens.
    """
    now = datetime.now(timezone.utc)
    default_start = (now - timedelta(days=15)).replace(hour=0, minute=0, second=0, microsecond=0)
    default_end = (now + timedelta(days=45)).replace(hour=23, minute=59, second=59, microsecond=0)

    start_dt = _parse_datetime(start, default_start)
    end_dt = _parse_datetime(end, default_end)

    start_str = start_dt.isoformat()
    end_str = end_dt.isoformat()

    # Recruiter availability & timezone from Setup Wizard
    avail = session.exec(
        select(AvailabilitySchedule).where(AvailabilitySchedule.user_id == current_user.id)
    ).first()
    user_tz = avail.timezone if avail and avail.timezone else "Asia/Karachi"
    business_hours = _format_business_hours(avail)

    # 1. Check Google Account Connection
    account = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == current_user.id)
    ).first()

    # Query local interviews in the range to support offline/unconnected fallback or enrichment
    db_interviews = session.exec(
        select(Interview).where(
            Interview.user_id == current_user.id,
            Interview.start_time >= start_dt - timedelta(days=2),
            Interview.end_time <= end_dt + timedelta(days=2),
            Interview.status != InterviewStatus.cancelled,
        )
    ).all()

    # Map opening titles
    opening_ids = {inv.opening_id for inv in db_interviews if inv.opening_id}
    openings_map: Dict[Any, str] = {}
    if opening_ids:
        openings = session.exec(select(JobOpening).where(JobOpening.id.in_(opening_ids))).all()
        openings_map = {op.id: op.title for op in openings}

    def _build_db_interview_event(inv: Interview) -> CalendarEventItem:
        round_type = (inv.round_type or "initial").lower()
        color = ROUND_COLORS.get(round_type, "#6366F1")
        opening_title = openings_map.get(inv.opening_id, "Recruitment Interview")

        return CalendarEventItem(
            id=f"db_{inv.id}",
            title=f"Interview: {inv.candidate_name} ({round_type.title()})",
            start=inv.start_time.isoformat() if inv.start_time else "",
            end=inv.end_time.isoformat() if inv.end_time else "",
            all_day=False,
            attendees=[
                CalendarAttendee(email=inv.candidate_email, name=inv.candidate_name),
                CalendarAttendee(email=inv.interviewer_email, name="Interviewer"),
            ],
            meet_link=inv.meet_link,
            status=inv.status.value if hasattr(inv.status, "value") else str(inv.status),
            color=color,
            is_interview=True,
            interview_data=CalendarInterviewData(
                interview_id=str(inv.id),
                candidate_id=str(inv.candidate_id),
                candidate_name=inv.candidate_name,
                candidate_email=inv.candidate_email,
                candidate_phone=inv.candidate_phone,
                opening_id=str(inv.opening_id) if inv.opening_id else None,
                opening_title=opening_title,
                round=round_type,
                status=inv.status.value if hasattr(inv.status, "value") else str(inv.status),
                result_status=getattr(inv, "result_status", None),
                feedback=getattr(inv, "feedback", None),
                meet_link=inv.meet_link,
            ),
        )

    # If Google account is not linked or token is revoked:
    if not account or account.last_sync_status in ("token_revoked", "reconnect_required"):
        reconnect = bool(account and account.last_sync_status in ("token_revoked", "reconnect_required"))
        msg = (
            "Google Workspace token has expired. Please reconnect in Settings > Google Workspace."
            if reconnect
            else "Google Workspace is not connected. Connect in Settings > Google Workspace to see real-time Google Calendar events."
        )
        local_events = [_build_db_interview_event(inv) for inv in db_interviews]
        return CalendarEventsResponse(
            connected=False,
            reconnect_required=reconnect,
            message=msg,
            time_zone=user_tz,
            business_hours=business_hours,
            events=local_events,
        )

    # 2. Check 60-Second In-Memory Cache (Requirement 3)
    cached_response = calendar_cache.get(str(current_user.id), start_str, end_str)
    if cached_response:
        return cached_response

    # 3. Retrieve Valid Access Token
    google_service = GoogleService(session)
    try:
        access_token = google_service.get_valid_access_token(account)
    except Exception as exc:
        logger.warning("Could not refresh Google access token: %s", exc)
        access_token = None

    if not access_token or access_token.startswith("simulated_") or account.last_sync_status == "token_revoked":
        local_events = [_build_db_interview_event(inv) for inv in db_interviews]
        return CalendarEventsResponse(
            connected=False,
            reconnect_required=True,
            message="Google token could not be refreshed. Please reconnect your account.",
            time_zone=user_tz,
            business_hours=business_hours,
            events=local_events,
        )

    # 4. Fetch Google Calendar Events via Google API
    events_items: List[Dict[str, Any]] = []
    try:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }
        params = {
            "timeMin": start_dt.isoformat(),
            "timeMax": end_dt.isoformat(),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 2500,
        }
        url = f"{GOOGLE_CALENDAR_API_BASE}/calendars/primary/events"

        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 401:
                account.last_sync_status = "token_revoked"
                session.add(account)
                session.commit()
                local_events = [_build_db_interview_event(inv) for inv in db_interviews]
                return CalendarEventsResponse(
                    connected=False,
                    reconnect_required=True,
                    message="Google Calendar authorization expired. Please reconnect in Settings.",
                    time_zone=user_tz,
                    business_hours=business_hours,
                    events=local_events,
                )
            if resp.is_success:
                events_items = resp.json().get("items", [])
            else:
                logger.warning("Google Calendar list error %s: %s", resp.status_code, resp.text)
    except Exception as api_err:
        logger.warning("Exception fetching Google Calendar events: %s", api_err)

    # 5. Build lookup maps for DB interviews to match Google Calendar events
    by_event_id: Dict[str, Interview] = {}
    by_meet_link: Dict[str, Interview] = {}
    matched_interview_ids: set = set()

    for inv in db_interviews:
        if inv.google_calendar_event_id:
            by_event_id[inv.google_calendar_event_id] = inv
        if inv.meet_link:
            by_meet_link[inv.meet_link.strip().rstrip("/")] = inv

    final_events: List[CalendarEventItem] = []

    for item in events_items:
        evt_id = item.get("id", "")
        summary = item.get("summary") or "(No Title)"
        start_obj = item.get("start", {})
        end_obj = item.get("end", {})

        is_all_day = "date" in start_obj
        evt_start = start_obj.get("dateTime") or start_obj.get("date") or ""
        evt_end = end_obj.get("dateTime") or end_obj.get("date") or evt_start

        meet_link = _extract_meet_link(item)

        # Match with app interview
        matched_inv: Optional[Interview] = by_event_id.get(evt_id)
        if not matched_inv and meet_link:
            matched_inv = by_meet_link.get(meet_link.strip().rstrip("/"))

        attendees_raw = item.get("attendees") or []
        attendees = [
            CalendarAttendee(
                email=att.get("email"),
                name=att.get("displayName") or att.get("email"),
                response_status=att.get("responseStatus"),
            )
            for att in attendees_raw
        ]

        if matched_inv:
            matched_interview_ids.add(matched_inv.id)
            round_type = (matched_inv.round_type or "initial").lower()
            color = ROUND_COLORS.get(round_type, "#6366F1")
            opening_title = openings_map.get(matched_inv.opening_id, "Recruitment Interview")

            final_events.append(
                CalendarEventItem(
                    id=evt_id,
                    title=f"Interview: {matched_inv.candidate_name} ({round_type.title()})",
                    start=evt_start,
                    end=evt_end,
                    all_day=is_all_day,
                    attendees=attendees,
                    meet_link=meet_link or matched_inv.meet_link,
                    status=item.get("status", "confirmed"),
                    color=color,
                    is_interview=True,
                    interview_data=CalendarInterviewData(
                        interview_id=str(matched_inv.id),
                        candidate_id=str(matched_inv.candidate_id),
                        candidate_name=matched_inv.candidate_name,
                        candidate_email=matched_inv.candidate_email,
                        candidate_phone=matched_inv.candidate_phone,
                        opening_id=str(matched_inv.opening_id) if matched_inv.opening_id else None,
                        opening_title=opening_title,
                        round=round_type,
                        status=matched_inv.status.value if hasattr(matched_inv.status, "value") else str(matched_inv.status),
                        result_status=getattr(matched_inv, "result_status", None),
                        feedback=getattr(matched_inv, "feedback", None),
                        meet_link=meet_link or matched_inv.meet_link,
                    ),
                )
            )
        else:
            # Regular Google Calendar Event
            raw_color_id = item.get("colorId")
            event_color = GOOGLE_EVENT_COLORS.get(str(raw_color_id), "#3B82F6")

            final_events.append(
                CalendarEventItem(
                    id=evt_id,
                    title=summary,
                    start=evt_start,
                    end=evt_end,
                    all_day=is_all_day,
                    attendees=attendees,
                    meet_link=meet_link,
                    status=item.get("status", "confirmed"),
                    color=event_color,
                    is_interview=False,
                    interview_data=None,
                )
            )

    # 6. Include any DB interviews that were not in Google Calendar API response
    for inv in db_interviews:
        if inv.id not in matched_interview_ids:
            final_events.append(_build_db_interview_event(inv))

    # Sort chronologically by start
    final_events.sort(key=lambda e: e.start or "")

    response = CalendarEventsResponse(
        connected=True,
        reconnect_required=False,
        time_zone=user_tz,
        business_hours=business_hours,
        events=final_events,
    )

    # 7. Store in 60s Cache
    calendar_cache.set(str(current_user.id), start_str, end_str, response)

    return response
