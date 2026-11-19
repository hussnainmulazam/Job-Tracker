import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.message import MessageDirection, MessageStatus, MessageType


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    candidate_id: uuid.UUID
    user_id: uuid.UUID
    direction: MessageDirection
    message_type: MessageType
    body: str
    template_name: Optional[str] = None
    status: MessageStatus
    error_message: Optional[str] = None
    ai_drafted: bool = False
    hr_approved: bool = True
    sent_at: Optional[datetime] = None
    created_at: datetime
