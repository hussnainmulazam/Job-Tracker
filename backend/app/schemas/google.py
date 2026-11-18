"""Google integration schemas — validation and serialization for Google OAuth2, Gmail sync, and email sending."""
import uuid
from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class GoogleAuthUrlResponse(BaseModel):
    auth_url: str = Field(..., description="Google OAuth2 consent screen URL")
    state: str = Field(..., description="Secure CSRF state token encoding user session")


class GoogleAccountStatusResponse(BaseModel):
    is_connected: bool = Field(..., description="Whether recruiter has linked their Google account")
    email: Optional[str] = Field(default=None, description="Linked Google account email")
    scopes: List[str] = Field(default_factory=list, description="OAuth scopes granted by recruiter")
    missing_scopes: List[str] = Field(default_factory=list, description="Required scopes that have not been granted yet")
    reconnect_needed: bool = Field(default=False, description="Whether re-authentication is required due to missing scopes or token revocation")
    reconnect_reason: Optional[str] = Field(default=None, description="Detailed explanation for why reconnection is needed")
    last_synced_at: Optional[datetime] = Field(default=None, description="Timestamp of last Gmail sync")
    last_sync_status: str = Field(default="never", description="Status of last sync: never, success, partial, failed, token_revoked")
    sync_query: str = Field(
        default="has:attachment (filename:pdf OR filename:docx) newer_than:30d",
        description="Gmail search filter query used for syncing candidate resumes",
    )
    sync_label: str = Field(default="INBOX", description="Gmail label to sync from")
    default_opening_id: Optional[uuid.UUID] = Field(default=None, description="Default job opening for incoming resumes without subject match")
    default_opening_title: Optional[str] = Field(default=None, description="Title of default job opening")
    total_emails_synced: int = Field(default=0, description="Total resume emails processed")


class GoogleAccountUpdateRequest(BaseModel):
    sync_query: Optional[str] = Field(default=None, min_length=1, max_length=500)
    sync_label: Optional[str] = Field(default=None, min_length=1, max_length=100)
    default_opening_id: Optional[uuid.UUID] = Field(default=None, description="Set default job opening for Gmail resumes")


class GmailSyncResponse(BaseModel):
    status: str = Field(..., description="Sync outcome: success, partial, or failed")
    messages_found: int = Field(..., description="Total candidate messages found matching query")
    messages_processed: int = Field(..., description="New candidate messages processed")
    attachments_saved: int = Field(..., description="PDF/DOCX resumes extracted and stored")
    candidates_created: int = Field(..., description="Candidate profiles created in database")
    errors: List[str] = Field(default_factory=list, description="Any warnings, failures, or rate limit notices encountered")
    last_synced_at: datetime = Field(..., description="Current sync timestamp")


class EmailSyncedRead(BaseModel):
    id: uuid.UUID
    message_id: str
    thread_id: Optional[str] = None
    sender: Optional[str] = None
    subject: Optional[str] = None
    snippet: Optional[str] = None
    attachment_names: List[str] = Field(default_factory=list)
    attachment_urls: List[str] = Field(default_factory=list)
    synced_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GooglePreviewEmailRequest(BaseModel):
    candidate_id: uuid.UUID = Field(..., description="Candidate recipient ID")
    template_name: str = Field(default="interview_invitation", description="Template key or 'custom'")
    custom_subject: Optional[str] = Field(default=None, description="Custom subject when template is custom or override")
    custom_body: Optional[str] = Field(default=None, description="Custom body when template is custom or override")
    slot_link: Optional[str] = Field(default=None, description="Candidate self-scheduling slot link")
    company_name: Optional[str] = Field(default=None, description="Company name override")


class GooglePreviewEmailResponse(BaseModel):
    candidate_id: uuid.UUID
    candidate_name: str
    candidate_email: str
    recipient_email: Optional[str] = None
    subject: str
    body: str
    variables: Dict[str, str] = Field(default_factory=dict)


class GoogleSendEmailRequest(BaseModel):
    candidate_id: uuid.UUID = Field(..., description="Candidate recipient ID")
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    template_name: Optional[str] = Field(default="custom", description="Template name used, if any")


class GoogleSendEmailResponse(BaseModel):
    message_id: uuid.UUID
    candidate_id: uuid.UUID
    recipient_email: str
    subject: str
    status: str
    sent_at: datetime
    google_message_id: Optional[str] = None
