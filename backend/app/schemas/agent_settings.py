"""
Agent Settings and Today's Activity Schemas.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AgentSettingsRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    is_paused: bool = False
    paused_at: Optional[datetime] = None
    paused_reason: Optional[str] = None
    daily_send_limit: int = 50
    sends_today: int = 0
    sends_remaining: int = 50
    notify_email: Optional[str] = None
    notify_on_booking: bool = True
    notify_on_reply: bool = True
    notify_on_failure: bool = True
    daily_summary_enabled: bool = True
    daily_summary_time: str = "09:00"
    last_daily_summary_sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentSettingsUpdate(BaseModel):
    is_paused: Optional[bool] = None
    daily_send_limit: Optional[int] = Field(default=None, ge=1, le=1000)
    notify_email: Optional[str] = None
    notify_on_booking: Optional[bool] = None
    notify_on_reply: Optional[bool] = None
    notify_on_failure: Optional[bool] = None
    daily_summary_enabled: Optional[bool] = None
    daily_summary_time: Optional[str] = None


class AgentPauseToggleRequest(BaseModel):
    paused: Optional[bool] = None
    reason: Optional[str] = None


class AgentActivityFeedItem(BaseModel):
    id: str
    timestamp: datetime
    action: str
    category: str = "config"  # "screening" | "email" | "interview" | "error" | "config"
    title: str
    details: Optional[str] = None
    candidate_id: Optional[uuid.UUID] = None
    candidate_name: Optional[str] = None
    opening_id: Optional[uuid.UUID] = None
    opening_title: Optional[str] = None
    status: str = "info"  # "success" | "warning" | "error" | "info"

    model_config = ConfigDict(from_attributes=True)


class AgentTodayActivityResponse(BaseModel):
    is_paused: bool
    paused_reason: Optional[str] = None
    daily_send_limit: int
    daily_sends_today: int
    sends_today: int = 0
    sends_remaining: int
    cvs_ingested_today: int
    cvs_scored_today: int
    waiting_for_review_count: int
    waiting_for_review: int = 0
    interviews_booked_today: int
    interviews_scheduled_today: int
    interviews_today: int = 0
    failures_today: int
    activity_feed: List[AgentActivityFeedItem] = []
    feed: List[AgentActivityFeedItem] = []


class DailySummarySendRequest(BaseModel):
    force: bool = False
    recipient_email: Optional[str] = None


class DailySummarySendResponse(BaseModel):
    sent: bool
    recipient_email: str
    sent_at: datetime
    new_cvs_count: int
    waiting_review_count: int
    interviews_today_count: int
    sends_today: int
    subject: str
    preview: str
