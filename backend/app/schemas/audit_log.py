"""AuditLog schemas — models for tracking recruiter operations and candidate events."""
import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class AuditLogRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    candidate_id: Optional[uuid.UUID] = None
    candidate_name: Optional[str] = None
    opening_id: Optional[uuid.UUID] = None
    opening_title: Optional[str] = None
    action: str
    from_stage: Optional[str] = None
    to_stage: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime


class PaginatedAuditLogs(BaseModel):
    items: List[AuditLogRead]
    total: int
