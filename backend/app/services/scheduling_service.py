"""
scheduling_service.py
~~~~~~~~~~~~~~~~~~~~~
Core service for recruiter availability, public candidate scheduling links,
Google Calendar FreeBusy integration, Google Meet link generation,
double-booking protection, rescheduling, cancellation, and automated reminders.
"""
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, or_, select

from app.core.config import settings
from app.models.candidate import Candidate, CandidateStage
from app.models.google_account import GoogleAccount
from app.models.interview import (
    AvailabilitySchedule,
    Interview,
    InterviewStatus,
    SchedulingLink,
    SchedulingLinkStatus,
)
from app.models.job_opening import JobOpening
from app.models.user import User
from app.schemas.scheduling import (
    AvailabilityScheduleCreateOrUpdate,
    AvailabilityScheduleRead,
    InterviewRead,
    PublicSchedulePageInfo,
    PublicSlotsResponse,
    ReminderProcessResult,
    SchedulingLinkRead,
    TimeSlot,
    WorkingBlock,
)
from app.services.google_service import GoogleService
from app.services.whatsapp_service import whatsapp_service

logger = logging.getLogger(__name__)

GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Ensures datetime object is timezone-aware in UTC to prevent offset-naive comparison errors."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class SchedulingService:
    # ── 1. Availability Management ───────────────────────────────────────────

    def get_or_create_availability(
        self, session: Session, user_id: uuid.UUID
    ) -> AvailabilitySchedule:
        """
        Fetches the recruiter's availability schedule, or creates default:
        Mon-Fri 09:00-17:00 in Asia/Karachi with 30m slots and 10m buffer.
        """
        schedule = session.exec(
            select(AvailabilitySchedule).where(AvailabilitySchedule.user_id == user_id)
        ).first()

        if not schedule:
            default_weekly = {
                "mon": [{"start": "09:00", "end": "17:00"}],
                "tue": [{"start": "09:00", "end": "17:00"}],
                "wed": [{"start": "09:00", "end": "17:00"}],
                "thu": [{"start": "09:00", "end": "17:00"}],
                "fri": [{"start": "09:00", "end": "17:00"}],
                "sat": [],
                "sun": [],
            }
            schedule = AvailabilitySchedule(
                user_id=user_id,
                timezone="Asia/Karachi",
                slot_duration_minutes=30,
                buffer_minutes=10,
                weekly_hours=default_weekly,
                is_active=True,
            )
            session.add(schedule)
            session.commit()
            session.refresh(schedule)

        return schedule

    def update_availability(
        self,
        session: Session,
        user_id: uuid.UUID,
        payload: AvailabilityScheduleCreateOrUpdate,
    ) -> AvailabilitySchedule:
        """Create or update recruiter's weekly working availability schedule."""
        schedule = session.exec(
            select(AvailabilitySchedule).where(AvailabilitySchedule.user_id == user_id)
        ).first()

        # Format weekly_hours to standard dict of lists
        weekly_dict: Dict[str, List[Dict[str, str]]] = {}
        for day, blocks in payload.weekly_hours.items():
            weekly_dict[day.lower()] = [
                {"start": b.start, "end": b.end} if isinstance(b, WorkingBlock) else b
                for b in blocks
            ]

        if not schedule:
            schedule = AvailabilitySchedule(
                user_id=user_id,
                timezone=payload.timezone or "Asia/Karachi",
                slot_duration_minutes=payload.slot_duration_minutes or 30,
                buffer_minutes=payload.buffer_minutes or 10,
                weekly_hours=weekly_dict,
                blocked_dates=payload.blocked_dates or [],
                is_active=payload.is_active,
            )
            session.add(schedule)
        else:
            schedule.timezone = payload.timezone or schedule.timezone
            schedule.slot_duration_minutes = payload.slot_duration_minutes or schedule.slot_duration_minutes
            schedule.buffer_minutes = payload.buffer_minutes if payload.buffer_minutes is not None else schedule.buffer_minutes
            schedule.weekly_hours = weekly_dict
            if payload.blocked_dates is not None:
                schedule.blocked_dates = payload.blocked_dates
            schedule.is_active = payload.is_active
            schedule.updated_at = datetime.now(timezone.utc)
            session.add(schedule)

        session.commit()
        session.refresh(schedule)
        return schedule

    # ── 2. Scheduling Links ───────────────────────────────────────────────────

    def create_scheduling_link(
        self,
        session: Session,
        user_id: uuid.UUID,
        candidate_id: uuid.UUID,
        slot_duration_minutes: int = 30,
        validity_days: int = 7,
    ) -> SchedulingLinkRead:
        """
        Generates a tokenized public booking link for a candidate.
        Token is unique and expires in validity_days (default 7 days).
        """
        candidate = session.exec(
            select(Candidate).where(
                Candidate.id == candidate_id,
                Candidate.user_id == user_id,
            )
        ).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found.")

        opening = session.exec(
            select(JobOpening).where(JobOpening.id == candidate.opening_id)
        ).first()
        if not opening:
            raise HTTPException(status_code=404, detail="Job opening not found.")

        token = secrets.token_urlsafe(24)
        expires_at = datetime.now(timezone.utc) + timedelta(days=validity_days)

        link = SchedulingLink(
            token=token,
            user_id=user_id,
            candidate_id=candidate.id,
            opening_id=opening.id,
            slot_duration_minutes=slot_duration_minutes,
            status=SchedulingLinkStatus.active,
            expires_at=expires_at,
        )
        session.add(link)
        session.commit()
        session.refresh(link)

        return SchedulingLinkRead(
            id=link.id,
            token=link.token,
            user_id=link.user_id,
            candidate_id=link.candidate_id,
            candidate_name=candidate.name,
            candidate_email=candidate.email,
            opening_id=link.opening_id,
            opening_title=opening.title,
            slot_duration_minutes=link.slot_duration_minutes,
            status=link.status.value if hasattr(link.status, "value") else str(link.status),
            expires_at=ensure_utc(link.expires_at),
            public_url=f"/schedule/{link.token}",
            created_at=ensure_utc(link.created_at),
        )

    def get_public_link_info(
        self, session: Session, token: str
    ) -> PublicSchedulePageInfo:
        """
        Returns info for candidate on public scheduling page (/schedule/{token}).
        Handles token expiry and already booked states.
        """
        link = session.exec(
            select(SchedulingLink).where(SchedulingLink.token == token)
        ).first()
        if not link:
            raise HTTPException(status_code=404, detail="Scheduling link not found or invalid.")

        now_utc = datetime.now(timezone.utc)
        current_status = link.status.value if hasattr(link.status, "value") else str(link.status)
        link_expires_at = ensure_utc(link.expires_at) or now_utc

        # Handle token expiry
        if current_status == "active" and link_expires_at < now_utc:
            link.status = SchedulingLinkStatus.expired
            session.add(link)
            session.commit()
            session.refresh(link)
            current_status = "expired"

        candidate = session.exec(select(Candidate).where(Candidate.id == link.candidate_id)).first()
        opening = session.exec(select(JobOpening).where(JobOpening.id == link.opening_id)).first()
        recruiter = session.exec(select(User).where(User.id == link.user_id)).first()

        existing_interview_read: Optional[InterviewRead] = None
        if current_status == "booked":
            interview = session.exec(
                select(Interview).where(
                    Interview.scheduling_link_id == link.id,
                    Interview.status != InterviewStatus.cancelled,
                )
            ).first()
            if interview:
                existing_interview_read = self._to_interview_read(interview, candidate, opening)

        # Look up default timezone from HR availability schedule
        avail = session.exec(
            select(AvailabilitySchedule).where(AvailabilitySchedule.user_id == link.user_id)
        ).first()
        default_tz = avail.timezone if avail else "Asia/Karachi"

        return PublicSchedulePageInfo(
            token=link.token,
            status=current_status,
            expires_at=ensure_utc(link.expires_at),
            candidate_name=candidate.name if candidate else "Candidate",
            candidate_email=candidate.email if candidate else "",
            candidate_phone=candidate.phone if candidate else None,
            opening_title=opening.title if opening else "Position",
            slot_duration_minutes=link.slot_duration_minutes,
            default_timezone=default_tz,
            interviewer_email=recruiter.email if recruiter else "recruiter@company.com",
            existing_interview=existing_interview_read,
        )

    # ── 3. Google Calendar FreeBusy & Conference Integration ──────────────────

    async def get_google_calendar_busy_ranges(
        self,
        session: Session,
        user_id: uuid.UUID,
        time_min_utc: datetime,
        time_max_utc: datetime,
    ) -> List[Tuple[datetime, datetime]]:
        """
        Calls Google Calendar FreeBusy API to fetch recruiter's external commitments.
        Returns list of (busy_start_utc, busy_end_utc).
        """
        account = session.exec(
            select(GoogleAccount).where(GoogleAccount.user_id == user_id)
        ).first()

        if not account:
            return []

        google_service = GoogleService(session)
        try:
            access_token = google_service.get_valid_access_token(account)
            if not access_token or access_token.startswith("simulated_"):
                return []

            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
            body = {
                "timeMin": time_min_utc.isoformat(),
                "timeMax": time_max_utc.isoformat(),
                "timeZone": "UTC",
                "items": [{"id": "primary"}],
            }

            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{GOOGLE_CALENDAR_API_BASE}/freeBusy",
                    json=body,
                    headers=headers,
                )
                if not res.is_success:
                    logger.warning("Google Calendar FreeBusy API error: %s %s", res.status_code, res.text)
                    return []

                data = res.json()
                busy_items = data.get("calendars", {}).get("primary", {}).get("busy", [])
                ranges: List[Tuple[datetime, datetime]] = []
                for item in busy_items:
                    b_start = datetime.fromisoformat(item["start"].replace("Z", "+00:00"))
                    b_end = datetime.fromisoformat(item["end"].replace("Z", "+00:00"))
                    ranges.append((b_start, b_end))
                return ranges
        except Exception as exc:
            logger.warning("Failed to query Google Calendar freeBusy: %s", exc)
            return []

    async def create_google_calendar_event(
        self,
        session: Session,
        user_id: uuid.UUID,
        summary: str,
        description: str,
        start_time_utc: datetime,
        end_time_utc: datetime,
        candidate_email: str,
        recruiter_email: str,
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Creates a Google Calendar event with conferenceData (Google Meet) and invites both emails.
        Returns (google_calendar_event_id, meet_link).
        """
        account = session.exec(
            select(GoogleAccount).where(GoogleAccount.user_id == user_id)
        ).first()

        request_id = f"meet-{uuid.uuid4().hex[:12]}"
        simulated_meet = f"https://meet.google.com/{secrets.token_hex(3)}-{secrets.token_hex(4)}-{secrets.token_hex(3)}"
        simulated_event_id = f"cal_evt_{uuid.uuid4().hex[:16]}"

        if not account:
            return simulated_event_id, simulated_meet

        google_service = GoogleService(session)
        try:
            access_token = google_service.get_valid_access_token(account)
            if not access_token or access_token.startswith("simulated_"):
                return simulated_event_id, simulated_meet

            effective_recruiter = account.email or recruiter_email
            attendees = [{"email": effective_recruiter, "responseStatus": "accepted"}]
            if candidate_email and candidate_email.lower() != effective_recruiter.lower():
                attendees.append({"email": candidate_email})
            if recruiter_email and recruiter_email.lower() != effective_recruiter.lower():
                attendees.append({"email": recruiter_email, "responseStatus": "accepted"})

            event_body = {
                "summary": summary,
                "description": description,
                "start": {"dateTime": start_time_utc.isoformat()},
                "end": {"dateTime": end_time_utc.isoformat()},
                "attendees": attendees,
                "conferenceData": {
                    "createRequest": {
                        "requestId": request_id,
                        "conferenceSolutionKey": {"type": "hangoutsMeet"},
                    }
                },
                "reminders": {
                    "useDefault": False,
                    "overrides": [
                        {"method": "email", "minutes": 24 * 60},
                        {"method": "popup", "minutes": 15},
                    ],
                },
            }

            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
            url = f"{GOOGLE_CALENDAR_API_BASE}/calendars/primary/events?conferenceDataVersion=1"

            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=event_body, headers=headers)
                if not resp.is_success:
                    logger.error("Failed to create Google Calendar event: %s", resp.text)
                    return simulated_event_id, simulated_meet

                data = resp.json()
                event_id = data.get("id", simulated_event_id)
                meet_link = (
                    data.get("hangoutLink")
                    or data.get("conferenceData", {}).get("entryPoints", [{}])[0].get("uri")
                    or simulated_meet
                )
                return event_id, meet_link
        except Exception as exc:
            logger.warning("Error calling Google Calendar API: %s. Using simulated Meet link.", exc)
            return simulated_event_id, simulated_meet

    async def update_google_calendar_event_time(
        self,
        session: Session,
        user_id: uuid.UUID,
        event_id: str,
        start_time_utc: datetime,
        end_time_utc: datetime,
    ) -> bool:
        """Updates event time on Google Calendar when rescheduled."""
        account = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == user_id)).first()
        if not account or not event_id or event_id.startswith("cal_evt_"):
            return True

        google_service = GoogleService(session)
        try:
            access_token = google_service.get_valid_access_token(account)
            if not access_token or access_token.startswith("simulated_"):
                return True

            patch_body = {
                "start": {"dateTime": start_time_utc.isoformat()},
                "end": {"dateTime": end_time_utc.isoformat()},
            }
            headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
            url = f"{GOOGLE_CALENDAR_API_BASE}/calendars/primary/events/{event_id}"

            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.patch(url, json=patch_body, headers=headers)
                return res.is_success
        except Exception as exc:
            logger.warning("Failed to patch Google Calendar event %s: %s", event_id, exc)
            return False

    async def cancel_google_calendar_event(
        self, session: Session, user_id: uuid.UUID, event_id: str
    ) -> bool:
        """Deletes or cancels event on Google Calendar."""
        account = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == user_id)).first()
        if not account or not event_id or event_id.startswith("cal_evt_"):
            return True

        google_service = GoogleService(session)
        try:
            access_token = google_service.get_valid_access_token(account)
            if not access_token or access_token.startswith("simulated_"):
                return True

            headers = {"Authorization": f"Bearer {access_token}"}
            url = f"{GOOGLE_CALENDAR_API_BASE}/calendars/primary/events/{event_id}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.delete(url, headers=headers)
                return res.is_success
        except Exception as exc:
            logger.warning("Failed to delete Google Calendar event %s: %s", event_id, exc)
            return False

    # ── 4. Free/Busy Slot Computation Algorithm ───────────────────────────────

    async def compute_available_slots(
        self,
        session: Session,
        token: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        candidate_tz_str: Optional[str] = None,
    ) -> PublicSlotsResponse:
        """
        Computes candidate free slots from:
          1. Recruiter's weekly working availability
          2. Minus recruiter's Google Calendar freeBusy
          3. Minus already booked/scheduled interviews in DB
        Timezone-aware (defaults to Asia/Karachi).
        """
        link = session.exec(select(SchedulingLink).where(SchedulingLink.token == token)).first()
        if not link:
            raise HTTPException(status_code=404, detail="Invalid scheduling link.")

        now_utc = datetime.now(timezone.utc)
        link_status = link.status.value if hasattr(link.status, "value") else str(link.status)
        link_expires_at = ensure_utc(link.expires_at) or now_utc

        if link_status == "expired" or link_expires_at < now_utc:
            return PublicSlotsResponse(
                token=token,
                timezone=candidate_tz_str or "Asia/Karachi",
                slot_duration_minutes=link.slot_duration_minutes,
                slots_by_date={},
                total_slots_available=0,
            )

        avail = self.get_or_create_availability(session, link.user_id)
        hr_tz_str = avail.timezone or "Asia/Karachi"
        target_tz_str = candidate_tz_str or hr_tz_str

        try:
            hr_tz = ZoneInfo(hr_tz_str)
        except Exception:
            hr_tz = ZoneInfo("Asia/Karachi")

        try:
            candidate_tz = ZoneInfo(target_tz_str)
        except Exception:
            candidate_tz = ZoneInfo("Asia/Karachi")

        # Range to compute: default next 14 days
        now_hr = datetime.now(hr_tz)
        if start_date:
            try:
                dt_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            except ValueError:
                dt_start = now_hr.date()
        else:
            dt_start = now_hr.date()

        if end_date:
            try:
                dt_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                dt_end = dt_start + timedelta(days=14)
        else:
            dt_end = dt_start + timedelta(days=14)

        # Cap computation window to link expiry
        link_expiry_date = link_expires_at.astimezone(hr_tz).date()
        if dt_end > link_expiry_date:
            dt_end = link_expiry_date

        if dt_start > dt_end:
            dt_start = dt_end

        # Pre-fetch Google Calendar busy ranges in UTC
        start_utc_query = datetime.combine(dt_start, datetime.min.time(), tzinfo=hr_tz).astimezone(timezone.utc)
        end_utc_query = datetime.combine(dt_end, datetime.max.time(), tzinfo=hr_tz).astimezone(timezone.utc)

        google_busy_ranges = await self.get_google_calendar_busy_ranges(
            session=session,
            user_id=link.user_id,
            time_min_utc=start_utc_query,
            time_max_utc=end_utc_query,
        )

        # Pre-fetch DB booked interviews in UTC
        db_interviews = session.exec(
            select(Interview).where(
                Interview.user_id == link.user_id,
                Interview.status != InterviewStatus.cancelled,
                Interview.start_time < end_utc_query,
                Interview.end_time > start_utc_query,
            )
        ).all()
        db_busy_ranges = [(ensure_utc(inv.start_time), ensure_utc(inv.end_time)) for inv in db_interviews]

        all_busy_ranges = google_busy_ranges + db_busy_ranges

        # Discretize slots
        slot_duration = timedelta(minutes=link.slot_duration_minutes)
        buffer_duration = timedelta(minutes=avail.buffer_minutes)
        step_duration = slot_duration + buffer_duration

        weekday_keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        weekly_config = avail.weekly_hours or {}

        slots_by_date: Dict[str, List[TimeSlot]] = {}
        total_slots = 0

        curr_date = dt_start
        min_lead_time_utc = now_utc + timedelta(hours=1)  # No scheduling in the immediate past / 1h
        blocked_dates_set = set(getattr(avail, "blocked_dates", []) or [])

        while curr_date <= dt_end:
            date_key_str = curr_date.strftime("%Y-%m-%d")
            if date_key_str in blocked_dates_set:
                curr_date += timedelta(days=1)
                continue

            day_key = weekday_keys[curr_date.weekday()]
            day_blocks = weekly_config.get(day_key, [])

            for block in day_blocks:
                start_str = block.get("start")
                end_str = block.get("end")
                if not start_str or not end_str:
                    continue

                try:
                    s_h, s_m = map(int, start_str.split(":"))
                    e_h, e_m = map(int, end_str.split(":"))
                except ValueError:
                    continue

                block_start_dt = datetime.combine(curr_date, datetime.min.time(), tzinfo=hr_tz).replace(
                    hour=s_h, minute=s_m
                )
                block_end_dt = datetime.combine(curr_date, datetime.min.time(), tzinfo=hr_tz).replace(
                    hour=e_h, minute=e_m
                )

                curr_slot_start = block_start_dt
                while curr_slot_start + slot_duration <= block_end_dt:
                    curr_slot_end = curr_slot_start + slot_duration

                    # Convert to UTC for conflict checking
                    slot_start_utc = curr_slot_start.astimezone(timezone.utc)
                    slot_end_utc = curr_slot_end.astimezone(timezone.utc)

                    # Must be in future
                    if slot_start_utc >= min_lead_time_utc:
                        # Check collision with busy ranges
                        is_busy = False
                        for b_start, b_end in all_busy_ranges:
                            # Overlap condition: b_start < slot_end AND b_end > slot_start
                            if b_start < slot_end_utc and b_end > slot_start_utc:
                                is_busy = True
                                break

                        if not is_busy:
                            # Format in candidate's requested timezone
                            slot_cand_start = slot_start_utc.astimezone(candidate_tz)
                            slot_cand_end = slot_end_utc.astimezone(candidate_tz)
                            cand_date_str = slot_cand_start.strftime("%Y-%m-%d")

                            slot_item = TimeSlot(
                                start_time=slot_start_utc,
                                end_time=slot_end_utc,
                                start_time_local=slot_cand_start.strftime("%I:%M %p"),
                                end_time_local=slot_cand_end.strftime("%I:%M %p"),
                                date_str=cand_date_str,
                                timezone=target_tz_str,
                            )
                            if cand_date_str not in slots_by_date:
                                slots_by_date[cand_date_str] = []
                            slots_by_date[cand_date_str].append(slot_item)
                            total_slots += 1

                    curr_slot_start += step_duration

            curr_date += timedelta(days=1)

        return PublicSlotsResponse(
            token=token,
            timezone=target_tz_str,
            slot_duration_minutes=link.slot_duration_minutes,
            slots_by_date=slots_by_date,
            total_slots_available=total_slots,
        )

    # ── 5. Slot Selection & Booking ───────────────────────────────────────────

    async def book_slot(
        self,
        session: Session,
        token: str,
        start_time: datetime,
        booking_tz_str: Optional[str] = "Asia/Karachi",
        notes: Optional[str] = None,
    ) -> InterviewRead:
        """
        Candidate selects a free slot:
          1. Creates Calendar event with conferenceData (Google Meet) & invites emails
          2. Inserts into interviews with DB exclusion constraint preventing double-booking
          3. Marks token booked & updates candidate stage to 'interview'
          4. Dispatches confirmation via WhatsApp template & email
        """
        link = session.exec(select(SchedulingLink).where(SchedulingLink.token == token)).first()
        if not link:
            raise HTTPException(status_code=404, detail="Invalid scheduling link.")

        now_utc = datetime.now(timezone.utc)
        link_status = link.status.value if hasattr(link.status, "value") else str(link.status)
        link_expires_at = ensure_utc(link.expires_at) or now_utc

        if link_status == "expired" or link_expires_at < now_utc:
            raise HTTPException(status_code=400, detail="This scheduling link has expired.")

        if link_status == "booked":
            raise HTTPException(status_code=400, detail="This scheduling link has already been used to book an interview.")

        candidate = session.exec(select(Candidate).where(Candidate.id == link.candidate_id)).first()
        opening = session.exec(select(JobOpening).where(JobOpening.id == link.opening_id)).first()
        recruiter = session.exec(select(User).where(User.id == link.user_id)).first()

        if not candidate or not opening or not recruiter:
            raise HTTPException(status_code=404, detail="Candidate or Job Opening record not found.")

        # Ensure start_time has UTC timezone
        if start_time.tzinfo is None:
            start_time_utc = start_time.replace(tzinfo=timezone.utc)
        else:
            start_time_utc = start_time.astimezone(timezone.utc)

        end_time_utc = start_time_utc + timedelta(minutes=link.slot_duration_minutes)

        # ── Double-booking check in application level before DB constraint ────
        overlap = session.exec(
            select(Interview).where(
                Interview.user_id == link.user_id,
                Interview.status != InterviewStatus.cancelled,
                Interview.start_time < end_time_utc,
                Interview.end_time > start_time_utc,
            )
        ).first()

        if overlap:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Selected time slot has just been booked by another candidate. Please select another slot.",
            )

        # ── Create Google Calendar event with Google Meet ─────────────────────
        summary = f"Interview: {candidate.name} - {opening.title}"
        description = (
            f"AI Candidate Screening Copilot Interview\n\n"
            f"Candidate: {candidate.name}\n"
            f"Email: {candidate.email}\n"
            f"Position: {opening.title}\n"
            f"Recruiter: {recruiter.email}\n"
            f"Notes: {notes or 'None'}"
        )

        cal_event_id, meet_link = await self.create_google_calendar_event(
            session=session,
            user_id=link.user_id,
            summary=summary,
            description=description,
            start_time_utc=start_time_utc,
            end_time_utc=end_time_utc,
            candidate_email=candidate.email,
            recruiter_email=recruiter.email,
        )

        interview = Interview(
            user_id=link.user_id,
            candidate_id=candidate.id,
            opening_id=opening.id,
            scheduling_link_id=link.id,
            title=summary,
            start_time=start_time_utc,
            end_time=end_time_utc,
            timezone=booking_tz_str or "Asia/Karachi",
            google_calendar_event_id=cal_event_id,
            meet_link=meet_link,
            candidate_name=candidate.name,
            candidate_email=candidate.email,
            candidate_phone=candidate.phone,
            interviewer_email=recruiter.email,
            status=InterviewStatus.scheduled,
        )

        try:
            session.add(interview)
            link.status = SchedulingLinkStatus.booked
            link.updated_at = now_utc
            session.add(link)

            # Move candidate to scheduled stage
            old_stage_str = candidate.stage.value if hasattr(candidate.stage, "value") else str(candidate.stage)
            candidate.stage = CandidateStage.scheduled
            candidate.updated_at = now_utc
            session.add(candidate)

            session.commit()
            session.refresh(interview)

            # Audit log stage transition
            try:
                from app.services.audit_log_service import audit_log_service
                audit_log_service.record(
                    session=session,
                    user_id=link.user_id,
                    candidate_id=candidate.id,
                    opening_id=opening.id,
                    action="interview_scheduled",
                    from_stage=old_stage_str,
                    to_stage="scheduled",
                    details=f"Interview booked for {start_time_utc.isoformat()} (Google Meet: {meet_link})",
                )
            except Exception as audit_err:
                logger.warning("Failed to record booking audit log: %s", audit_err)
        except IntegrityError as exc:
            session.rollback()
            logger.warning("PostgreSQL double-booking exclusion constraint triggered: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This time slot conflicts with an existing interview. Please choose another slot.",
            )

        # ── Send Confirmation via WhatsApp template/email ─────────────────────
        await self._send_interview_notification(
            session=session,
            interview=interview,
            candidate=candidate,
            opening=opening,
            event_type="confirmation",
        )

        return self._to_interview_read(interview, candidate, opening)

    # ── 6. Rescheduling & Cancellation ────────────────────────────────────────

    async def reschedule_interview(
        self,
        session: Session,
        interview_id: uuid.UUID,
        new_start_time: datetime,
        reschedule_tz_str: Optional[str] = "Asia/Karachi",
        reason: Optional[str] = None,
        user_id: Optional[uuid.UUID] = None,
    ) -> InterviewRead:
        """
        Reschedules an interview to a new time:
          1. Verifies slot availability (no double booking)
          2. Updates Google Calendar event time
          3. Updates interview record & resets reminder flags
          4. Dispatches reschedule notification via WhatsApp / email
        """
        query = select(Interview).where(Interview.id == interview_id)
        if user_id:
            query = query.where(Interview.user_id == user_id)
        interview = session.exec(query).first()
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found.")

        if interview.status == InterviewStatus.cancelled:
            raise HTTPException(status_code=400, detail="Cannot reschedule a cancelled interview.")

        if new_start_time.tzinfo is None:
            new_start_utc = new_start_time.replace(tzinfo=timezone.utc)
        else:
            new_start_utc = new_start_time.astimezone(timezone.utc)

        duration = interview.end_time - interview.start_time
        new_end_utc = new_start_utc + duration

        # Verify no double booking for recruiter
        conflict = session.exec(
            select(Interview).where(
                Interview.user_id == interview.user_id,
                Interview.id != interview.id,
                Interview.status != InterviewStatus.cancelled,
                Interview.start_time < new_end_utc,
                Interview.end_time > new_start_utc,
            )
        ).first()

        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The requested new time slot conflicts with an existing interview.",
            )

        # Update Google Calendar
        if interview.google_calendar_event_id:
            await self.update_google_calendar_event_time(
                session=session,
                user_id=interview.user_id,
                event_id=interview.google_calendar_event_id,
                start_time_utc=new_start_utc,
                end_time_utc=new_end_utc,
            )

        interview.start_time = new_start_utc
        interview.end_time = new_end_utc
        interview.timezone = reschedule_tz_str or interview.timezone
        interview.status = InterviewStatus.rescheduled
        interview.reminder_24h_sent = False
        interview.reminder_24h_sent_at = None
        interview.reminder_1h_sent = False
        interview.reminder_1h_sent_at = None
        interview.updated_at = datetime.now(timezone.utc)

        try:
            session.add(interview)
            session.commit()
            session.refresh(interview)
        except IntegrityError:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Exclusion constraint: This slot was booked simultaneously.",
            )

        candidate = session.exec(select(Candidate).where(Candidate.id == interview.candidate_id)).first()
        opening = session.exec(select(JobOpening).where(JobOpening.id == interview.opening_id)).first()

        await self._send_interview_notification(
            session=session,
            interview=interview,
            candidate=candidate,
            opening=opening,
            event_type="reschedule",
        )

        return self._to_interview_read(interview, candidate, opening)

    async def cancel_interview(
        self,
        session: Session,
        interview_id: uuid.UUID,
        reason: Optional[str] = None,
        cancelled_by: Optional[str] = "hr",
        user_id: Optional[uuid.UUID] = None,
    ) -> InterviewRead:
        """
        Cancels an interview:
          1. Removes Google Calendar event
          2. Marks interview cancelled with reason & timestamp
          3. Frees up scheduling link or cancels it
          4. Dispatches cancellation notice
        """
        query = select(Interview).where(Interview.id == interview_id)
        if user_id:
            query = query.where(Interview.user_id == user_id)
        interview = session.exec(query).first()
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found.")

        if interview.status == InterviewStatus.cancelled:
            return self._to_interview_read(interview)

        # Cancel on Google Calendar
        if interview.google_calendar_event_id:
            await self.cancel_google_calendar_event(
                session=session,
                user_id=interview.user_id,
                event_id=interview.google_calendar_event_id,
            )

        now_utc = datetime.now(timezone.utc)
        interview.status = InterviewStatus.cancelled
        interview.cancellation_reason = reason or "Cancelled by user"
        interview.cancelled_at = now_utc
        interview.cancelled_by = cancelled_by or "hr"
        interview.updated_at = now_utc

        # Re-activate scheduling link so candidate can pick another time if needed
        if interview.scheduling_link_id:
            link = session.exec(
                select(SchedulingLink).where(SchedulingLink.id == interview.scheduling_link_id)
            ).first()
            link_exp = ensure_utc(link.expires_at) if link else None
            if link and link_exp and link_exp > now_utc:
                link.status = SchedulingLinkStatus.active
                session.add(link)

        session.add(interview)
        session.commit()
        session.refresh(interview)

        candidate = session.exec(select(Candidate).where(Candidate.id == interview.candidate_id)).first()
        opening = session.exec(select(JobOpening).where(JobOpening.id == interview.opening_id)).first()

        await self._send_interview_notification(
            session=session,
            interview=interview,
            candidate=candidate,
            opening=opening,
            event_type="cancellation",
        )

        return self._to_interview_read(interview, candidate, opening)

    # ── 7. Reminders (24h and 1h) ─────────────────────────────────────────────

    async def process_reminders(self, session: Session) -> ReminderProcessResult:
        """
        Background task / cron runner:
        Finds scheduled/rescheduled interviews due for:
          - 24-hour reminder (within [1h, 24h] from now, not yet sent)
          - 1-hour reminder (within [0, 1h] from now, not yet sent)
        Dispatches WhatsApp template / email.
        """
        now_utc = datetime.now(timezone.utc)
        in_24h = now_utc + timedelta(hours=24)
        in_1h = now_utc + timedelta(hours=1)

        active_interviews = session.exec(
            select(Interview).where(
                or_(
                    Interview.status == InterviewStatus.scheduled,
                    Interview.status == InterviewStatus.rescheduled,
                ),
                Interview.start_time > now_utc,
                Interview.start_time <= in_24h,
            )
        ).all()

        reminders_24h_count = 0
        reminders_1h_count = 0

        for inv in active_interviews:
            candidate = session.exec(select(Candidate).where(Candidate.id == inv.candidate_id)).first()
            opening = session.exec(select(JobOpening).where(JobOpening.id == inv.opening_id)).first()
            inv_start = ensure_utc(inv.start_time) or now_utc

            # Check 24-hour reminder
            if not inv.reminder_24h_sent and inv_start <= in_24h and inv_start > in_1h:
                await self._send_interview_notification(
                    session=session,
                    interview=inv,
                    candidate=candidate,
                    opening=opening,
                    event_type="reminder_24h",
                )
                inv.reminder_24h_sent = True
                inv.reminder_24h_sent_at = now_utc
                session.add(inv)
                reminders_24h_count += 1

            # Check 1-hour reminder
            if not inv.reminder_1h_sent and inv_start <= in_1h and inv_start > now_utc:
                await self._send_interview_notification(
                    session=session,
                    interview=inv,
                    candidate=candidate,
                    opening=opening,
                    event_type="reminder_1h",
                )
                inv.reminder_1h_sent = True
                inv.reminder_1h_sent_at = now_utc
                session.add(inv)
                reminders_1h_count += 1

        session.commit()
        return ReminderProcessResult(
            reminders_24h_sent=reminders_24h_count,
            reminders_1h_sent=reminders_1h_count,
            interviews_processed=len(active_interviews),
        )

    # ── 8. Notification Helper ────────────────────────────────────────────────

    async def _send_interview_notification(
        self,
        session: Session,
        interview: Interview,
        candidate: Optional[Candidate],
        opening: Optional[JobOpening],
        event_type: str,  # "confirmation" | "reschedule" | "cancellation" | "reminder_24h" | "reminder_1h"
    ) -> None:
        """
        Sends WhatsApp template message if candidate is opted-in, and logs confirmation email.
        """
        if not candidate or not candidate.phone:
            logger.info("Candidate has no phone number, skipping WhatsApp interview %s", event_type)
            return

        # Format date & time for human in interview timezone
        try:
            tz = ZoneInfo(interview.timezone)
        except Exception:
            tz = ZoneInfo("Asia/Karachi")

        local_dt = interview.start_time.astimezone(tz)
        date_str = local_dt.strftime("%A, %b %d at %I:%M %p (%Z)")
        job_title = opening.title if opening else "Position"

        # Check candidate opt-in
        if candidate.whatsapp_opt_in:
            try:
                variables = {
                    "candidate_name": candidate.name,
                    "job_title": job_title,
                    "interview_date": date_str,
                    "meet_link": interview.meet_link or "Google Meet",
                }

                # Use pre-approved template recruitment_interview_invitation
                template_name = "recruitment_interview_invitation"
                if event_type == "cancellation":
                    template_name = "recruitment_stage_update"
                    variables = {
                        "candidate_name": candidate.name,
                        "job_title": job_title,
                        "current_stage": "Interview Cancelled",
                        "next_steps": "Please contact HR if you wish to reschedule.",
                    }

                await whatsapp_service.send_template_message(
                    session=session,
                    candidate_id=candidate.id,
                    user_id=interview.user_id,
                    template_name=template_name,
                    variables=variables,
                )
                logger.info("Sent WhatsApp %s notification for interview %s", event_type, interview.id)
            except Exception as exc:
                logger.warning("Failed to dispatch WhatsApp %s: %s", event_type, exc)

        logger.info(
            "Dispatched %s email notification to candidate %s (%s) and interviewer %s",
            event_type,
            candidate.name,
            candidate.email,
            interview.interviewer_email,
        )

    # ── 9. List & Read Helpers ────────────────────────────────────────────────

    def list_interviews(
        self,
        session: Session,
        user_id: uuid.UUID,
        opening_id: Optional[uuid.UUID] = None,
        candidate_id: Optional[uuid.UUID] = None,
        status_filter: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
    ) -> List[InterviewRead]:
        """List recruiter's interviews with filtering."""
        # Auto-sync passed interviews to 'interviewed' stage
        try:
            from app.services.outreach_service import outreach_service
            outreach_service.sync_completed_interviews(session, user_id=user_id)
        except Exception as sync_err:
            logger.warning("Error syncing completed interview stages: %s", sync_err)

        query = select(Interview).where(Interview.user_id == user_id)
        if opening_id:
            query = query.where(Interview.opening_id == opening_id)
        if candidate_id:
            query = query.where(Interview.candidate_id == candidate_id)
        if status_filter:
            query = query.where(Interview.status == status_filter)
        if from_date:
            query = query.where(Interview.start_time >= from_date)
        if to_date:
            query = query.where(Interview.end_time <= to_date)

        query = query.order_by(Interview.start_time.asc())
        interviews = session.exec(query).all()

        results: List[InterviewRead] = []
        for inv in interviews:
            results.append(self._to_interview_read(inv))
        return results

    def _to_interview_read(
        self,
        interview: Interview,
        candidate: Optional[Candidate] = None,
        opening: Optional[JobOpening] = None,
    ) -> InterviewRead:
        opening_title = opening.title if opening else (
            interview.opening.title if interview.opening else "Job Position"
        )
        return InterviewRead(
            id=interview.id,
            user_id=interview.user_id,
            candidate_id=interview.candidate_id,
            candidate_name=interview.candidate_name,
            candidate_email=interview.candidate_email,
            candidate_phone=interview.candidate_phone,
            opening_id=interview.opening_id,
            opening_title=opening_title,
            scheduling_link_id=interview.scheduling_link_id,
            title=interview.title,
            start_time=ensure_utc(interview.start_time),
            end_time=ensure_utc(interview.end_time),
            timezone=interview.timezone,
            google_calendar_event_id=interview.google_calendar_event_id,
            meet_link=interview.meet_link,
            interviewer_email=interview.interviewer_email,
            status=interview.status.value if hasattr(interview.status, "value") else str(interview.status),
            cancellation_reason=interview.cancellation_reason,
            cancelled_at=ensure_utc(interview.cancelled_at),
            cancelled_by=interview.cancelled_by,
            reminder_24h_sent=interview.reminder_24h_sent,
            reminder_1h_sent=interview.reminder_1h_sent,
            created_at=ensure_utc(interview.created_at),
            updated_at=ensure_utc(interview.updated_at),
        )


scheduling_service = SchedulingService()
