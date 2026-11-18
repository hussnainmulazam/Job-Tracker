"""
scheduling.py
~~~~~~~~~~~~~
Pydantic schemas for recruiter availability, public candidate scheduling links,
free/busy slot computation, Google Meet booking, and interview management.
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class WorkingBlock(BaseModel):
    start: str = Field(..., description="HH:MM in 24h format, e.g. '09:00'")
    end: str = Field(..., description="HH:MM in 24h format, e.g. '17:00'")


class AvailabilityScheduleCreateOrUpdate(BaseModel):
    timezone: str = Field(default="Asia/Karachi", description="IANA timezone name, e.g. Asia/Karachi")
    slot_duration_minutes: int = Field(default=30, ge=10, le=180)
    buffer_minutes: int = Field(default=10, ge=0, le=60)
    weekly_hours: Dict[str, List[WorkingBlock]] = Field(
        default_factory=lambda: {
            "mon": [WorkingBlock(start="09:00", end="17:00")],
            "tue": [WorkingBlock(start="09:00", end="17:00")],
            "wed": [WorkingBlock(start="09:00", end="17:00")],
            "thu": [WorkingBlock(start="09:00", end="17:00")],
            "fri": [WorkingBlock(start="09:00", end="17:00")],
            "sat": [],
            "sun": [],
        }
    )
    blocked_dates: List[str] = Field(default_factory=list, description="List of YYYY-MM-DD blocked dates")
    is_active: bool = True


class AvailabilityScheduleRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    timezone: str
    slot_duration_minutes: int
    buffer_minutes: int
    weekly_hours: Dict[str, Any]
    blocked_dates: List[str] = Field(default_factory=list)
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SchedulingLinkCreate(BaseModel):
    candidate_id: uuid.UUID
    slot_duration_minutes: Optional[int] = 30
    validity_days: Optional[int] = 7


class SchedulingLinkRead(BaseModel):
    id: uuid.UUID
    token: str
    user_id: uuid.UUID
    candidate_id: uuid.UUID
    candidate_name: str
    candidate_email: str
    opening_id: uuid.UUID
    opening_title: str
    slot_duration_minutes: int
    status: str
    expires_at: datetime
    public_url: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TimeSlot(BaseModel):
    start_time: datetime = Field(..., description="UTC ISO timestamp")
    end_time: datetime = Field(..., description="UTC ISO timestamp")
    start_time_local: str = Field(..., description="e.g. '09:00 AM'")
    end_time_local: str = Field(..., description="e.g. '09:30 AM'")
    date_str: str = Field(..., description="YYYY-MM-DD")
    timezone: str


class PublicSlotsResponse(BaseModel):
    token: str
    timezone: str
    slot_duration_minutes: int
    slots_by_date: Dict[str, List[TimeSlot]]
    total_slots_available: int


class InterviewRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    candidate_id: uuid.UUID
    candidate_name: str
    candidate_email: str
    candidate_phone: Optional[str] = None
    opening_id: uuid.UUID
    opening_title: str
    scheduling_link_id: Optional[uuid.UUID] = None
    title: str
    start_time: datetime
    end_time: datetime
    timezone: str
    google_calendar_event_id: Optional[str] = None
    meet_link: Optional[str] = None
    interviewer_email: str
    status: str
    cancellation_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None
    reminder_24h_sent: bool = False
    reminder_1h_sent: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PublicSchedulePageInfo(BaseModel):
    token: str
    status: str  # "active" | "expired" | "booked" | "cancelled"
    expires_at: datetime
    candidate_name: str
    candidate_email: str
    candidate_phone: Optional[str] = None
    opening_title: str
    slot_duration_minutes: int
    default_timezone: str
    interviewer_email: str
    existing_interview: Optional[InterviewRead] = None


class PublicBookSlotRequest(BaseModel):
    start_time: datetime
    timezone: Optional[str] = "Asia/Karachi"
    notes: Optional[str] = None


class InterviewRescheduleRequest(BaseModel):
    new_start_time: datetime
    timezone: Optional[str] = "Asia/Karachi"
    reason: Optional[str] = None


class InterviewCancelRequest(BaseModel):
    reason: Optional[str] = None
    cancelled_by: Optional[str] = "hr"  # "hr" or "candidate"


class ReminderProcessResult(BaseModel):
    reminders_24h_sent: int
    reminders_1h_sent: int
    interviews_processed: int
