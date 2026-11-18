"""
Schemas for WhatsApp Cloud API messaging, webhooks, templates, threads, and AI drafting.
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class WhatsAppTemplateVariable(BaseModel):
    key: str
    label: str
    default_source: Optional[str] = Field(
        default=None,
        description="e.g. 'candidate_name', 'job_title', 'recruiter_name'",
    )


class WhatsAppTemplateDefinition(BaseModel):
    name: str
    display_name: str
    category: str
    language: str = "en_US"
    body_template: str
    variables: List[WhatsAppTemplateVariable] = Field(default_factory=list)


class WhatsAppSendTemplateRequest(BaseModel):
    candidate_id: uuid.UUID
    template_name: str
    language_code: str = "en_US"
    variables: Dict[str, str] = Field(
        default_factory=dict,
        description="Key-value mapping matching template placeholders",
    )


class WhatsAppSendFreeformRequest(BaseModel):
    candidate_id: uuid.UUID
    message: str = Field(..., min_length=1, max_length=4096)


class WhatsAppBatchCandidatePreview(BaseModel):
    candidate_id: uuid.UUID
    candidate_name: str
    phone: Optional[str] = None
    whatsapp_opt_in: bool
    can_send: bool
    rendered_preview: str
    variables: Dict[str, str]


class WhatsAppBatchPreviewRequest(BaseModel):
    candidate_ids: List[uuid.UUID]
    template_name: str
    language_code: str = "en_US"
    custom_variables: Dict[str, str] = Field(default_factory=dict)


class WhatsAppBatchPreviewResponse(BaseModel):
    template_name: str
    body_template: str
    previews: List[WhatsAppBatchCandidatePreview]
    total_selected: int
    eligible_count: int
    ineligible_opt_out_count: int


class WhatsAppBatchSendRequest(BaseModel):
    candidate_ids: List[uuid.UUID]
    template_name: str
    language_code: str = "en_US"
    custom_variables: Dict[str, str] = Field(default_factory=dict)


class WhatsAppBatchSendResult(BaseModel):
    candidate_id: uuid.UUID
    candidate_name: str
    phone: Optional[str] = None
    status: str  # "sent", "blocked_opt_out", "failed"
    message_id: Optional[str] = None
    error: Optional[str] = None


class WhatsAppBatchSendResponse(BaseModel):
    total_selected: int
    sent_count: int
    blocked_count: int
    failed_count: int
    results: List[WhatsAppBatchSendResult]


class WhatsAppAIDraftRequest(BaseModel):
    candidate_id: uuid.UUID
    instructions: Optional[str] = None


class WhatsAppAIDraftResponse(BaseModel):
    candidate_id: uuid.UUID
    drafted_message: str
    care_window_open: bool
    requires_hr_approval: bool = True
    context_summary: str


class WhatsAppOptInUpdate(BaseModel):
    whatsapp_opt_in: bool


class WhatsAppMessageRead(BaseModel):
    id: uuid.UUID
    candidate_id: uuid.UUID
    candidate_name: Optional[str] = None
    candidate_phone: Optional[str] = None
    direction: str  # "inbound" | "outbound"
    message_type: str  # "template" | "text"
    body: str
    template_name: Optional[str] = None
    template_language: Optional[str] = None
    template_variables: Optional[Dict[str, Any]] = None
    whatsapp_message_id: Optional[str] = None
    status: str  # "pending" | "sent" | "delivered" | "read" | "failed"
    error_message: Optional[str] = None
    retry_count: int = 0
    ai_drafted: bool = False
    hr_approved: bool = True
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WhatsAppThreadResponse(BaseModel):
    candidate_id: uuid.UUID
    candidate_name: str
    candidate_phone: Optional[str] = None
    whatsapp_opt_in: bool
    whatsapp_opt_in_at: Optional[datetime] = None
    last_inbound_whatsapp_at: Optional[datetime] = None
    care_window_open: bool
    care_window_expires_at: Optional[datetime] = None
    seconds_remaining: Optional[int] = None
    messages: List[WhatsAppMessageRead]


class WhatsAppConversationSummary(BaseModel):
    candidate_id: uuid.UUID
    candidate_name: str
    candidate_email: str
    candidate_phone: Optional[str] = None
    opening_id: Optional[uuid.UUID] = None
    opening_title: Optional[str] = None
    candidate_stage: str
    candidate_score: Optional[float] = None
    whatsapp_opt_in: bool
    last_message_body: Optional[str] = None
    last_message_direction: Optional[str] = None
    last_message_status: Optional[str] = None
    last_message_at: Optional[datetime] = None
    total_messages: int = 0
    awaiting_reply: bool = False
    care_window_open: bool = False
    care_window_expires_at: Optional[datetime] = None
    seconds_remaining: Optional[int] = None


class WhatsAppConversationsResponse(BaseModel):
    conversations: List[WhatsAppConversationSummary]
    total_conversations: int
    awaiting_reply_count: int


class WhatsAppStatusResponse(BaseModel):
    configured: bool = Field(..., description="Whether credentials are set in .env")
    valid: bool = Field(..., description="Whether Meta validated credentials successfully")
    is_expired: bool = Field(..., description="Whether access token is expired (code 190 / 401)")
    phone_number_id: Optional[str] = None
    display_phone_number: Optional[str] = None
    verified_name: Optional[str] = None
    quality_rating: Optional[str] = None
    error_code: Optional[int] = None
    error_message: Optional[str] = None
    status_message: str = Field(..., description="Human-readable status or error instruction")
    default_template: str = Field(default="hello_world", description="Default pre-approved template name")


class ContactCandidateRequest(BaseModel):
    channel: str = Field(default="whatsapp", description="'whatsapp' or 'email'")
    message: str = Field(..., min_length=1, max_length=4096)
    subject: Optional[str] = Field(default=None, description="Email subject if channel is email")
    template_name: Optional[str] = Field(default=None, description="WhatsApp or email template override")
    whatsapp_opt_in: bool = Field(default=True, description="Candidate communication opt-in consent")
    variables: Optional[Dict[str, str]] = Field(default=None, description="Custom variables override (role, location, next_steps)")


class ContactCandidateResponse(BaseModel):
    candidate_id: uuid.UUID
    candidate_name: str
    channel: str
    status: str
    message_id: Optional[uuid.UUID] = None
    whatsapp_message_id: Optional[str] = None
    used_template: Optional[str] = None
    care_window_open: bool = False
    error_message: Optional[str] = None
    sent_at: Optional[datetime] = None
