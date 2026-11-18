"""
outreach.py
~~~~~~~~~~~
Pydantic schemas for the outreach agent:
- AI personalized message drafting (WhatsApp/Email, Hinglish/English)
- Recruiter approval queue (single and bulk)
- Delivery tracking, stage transitions, and audit trail with retry actions.
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class OutreachDraftRequest(BaseModel):
    candidate_id: uuid.UUID
    channel: str = Field(default="whatsapp", description="'whatsapp' or 'email'")
    language: str = Field(default="english", description="'english' or 'hinglish'")
    instructions: Optional[str] = Field(
        default=None,
        description="Optional custom recruiter notes, e.g. 'Emphasize Python and invite for Round 1'",
    )


class OutreachDraftResponse(BaseModel):
    message_id: uuid.UUID
    candidate_id: uuid.UUID
    candidate_name: str
    channel: str
    language: str
    body: str
    subject: Optional[str] = None
    scheduling_url: Optional[str] = None
    status: str
    ai_drafted: bool
    hr_approved: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApprovalQueueItem(BaseModel):
    message_id: uuid.UUID
    candidate_id: uuid.UUID
    candidate_name: str
    candidate_email: str
    candidate_phone: Optional[str] = None
    candidate_stage: str
    opening_id: Optional[uuid.UUID] = None
    opening_title: Optional[str] = None
    channel: str
    language: str
    body: str
    subject: Optional[str] = None
    scheduling_url: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    retry_count: int = 0
    created_at: datetime


class DraftUpdateRequest(BaseModel):
    body: str
    subject: Optional[str] = None


class BulkApproveRequest(BaseModel):
    message_ids: List[uuid.UUID]


class ApproveResult(BaseModel):
    message_id: uuid.UUID
    candidate_id: uuid.UUID
    candidate_name: str
    channel: str
    status: str  # "sent", "failed", etc.
    error: Optional[str] = None


class BulkApproveResponse(BaseModel):
    total: int
    approved_count: int
    sent_count: int
    failed_count: int
    results: List[ApproveResult]


class OutreachAuditItem(BaseModel):
    id: uuid.UUID
    action: str
    candidate_id: Optional[uuid.UUID] = None
    candidate_name: Optional[str] = None
    opening_title: Optional[str] = None
    from_stage: Optional[str] = None
    to_stage: Optional[str] = None
    details: Optional[str] = None
    failure_reason: Optional[str] = None
    message_id: Optional[uuid.UUID] = None
    retryable: bool = False
    created_at: datetime


class StageSyncResponse(BaseModel):
    interviews_checked: int
    stages_updated_to_interviewed: int
    candidate_ids_updated: List[uuid.UUID]
