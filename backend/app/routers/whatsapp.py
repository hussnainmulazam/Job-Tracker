"""
FastAPI router for WhatsApp Cloud API integration:
- Webhook verification (GET challenge handshake) & notification handler (POST HMAC-SHA256 signature verification)
- Send template message (strictly requires candidate opt-in)
- Send free-form message (strictly requires candidate opt-in & open 24h customer service window)
- Multi-candidate HR batch preview and rate-limited send
- Candidate thread retrieval with 24h care window countdown
- Failed message retry
- AI reply drafting (HR must approve before sending)
- Candidate WhatsApp communication opt-in toggle
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlmodel import Session

from app.core.config import settings
from app.core.dependencies import CurrentUser
from app.core.rate_limit import rate_limit
from app.db import SessionDep
from app.schemas.whatsapp import (
    ContactCandidateRequest,
    ContactCandidateResponse,
    WhatsAppAIDraftRequest,
    WhatsAppAIDraftResponse,
    WhatsAppBatchPreviewRequest,
    WhatsAppBatchPreviewResponse,
    WhatsAppBatchSendRequest,
    WhatsAppBatchSendResponse,
    WhatsAppConversationSummary,
    WhatsAppConversationsResponse,
    WhatsAppMessageRead,
    WhatsAppOptInUpdate,
    WhatsAppSendFreeformRequest,
    WhatsAppSendTemplateRequest,
    WhatsAppStatusResponse,
    WhatsAppTemplateDefinition,
    WhatsAppThreadResponse,
)
from app.services.whatsapp_service import verify_webhook_signature, whatsapp_service

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp Cloud API"])


# ── 0. Connection Status & Token Validation ──────────────────────────────────

@router.get(
    "/status",
    response_model=WhatsAppStatusResponse,
    summary="Get WhatsApp Cloud API connection status and live token validity",
)
def get_status() -> WhatsAppStatusResponse:
    """
    Validates configured WHATSAPP_TOKEN against Meta's Graph API.
    Identifies expired tokens (code 190 / HTTP 401) and returns descriptive instructions for Settings.
    """
    res = whatsapp_service.validate_token()
    return WhatsAppStatusResponse(**res)


# ── 1. Webhook Handshake & Notification Endpoints ─────────────────────────────

@router.get(
    "/webhook",
    summary="Meta WhatsApp Webhook Verification Handshake",
    dependencies=[Depends(rate_limit(times=120, seconds=60, scope="whatsapp:webhook"))],
)
def verify_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
):
    """
    Handles Meta's initial webhook subscription verification challenge.
    Checks that hub.verify_token matches configured VERIFY_TOKEN.
    """
    expected_verify_token = settings.VERIFY_TOKEN or "recruiter-verify-token"

    if hub_mode == "subscribe" and hub_verify_token == expected_verify_token:
        # Return hub.challenge as plain text string with HTTP 200
        return Response(content=hub_challenge or "", media_type="text/plain", status_code=200)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Invalid verification token or hub mode.",
    )


@router.post(
    "/webhook",
    summary="Meta WhatsApp Webhook Inbound Events & Statuses",
    dependencies=[Depends(rate_limit(times=120, seconds=60, scope="whatsapp:webhook"))],
)
async def receive_webhook_event(
    request: Request,
    session: SessionDep,
    x_hub_signature_256: Optional[str] = Header(None, alias="X-Hub-Signature-256"),
):
    """
    Receives incoming WhatsApp events (inbound messages and delivery status updates).
    Verifies payload signature with APP_SECRET (HMAC-SHA256).
    """
    raw_body = await request.body()

    # Verify signature if APP_SECRET is configured
    if settings.APP_SECRET:
        if not verify_webhook_signature(raw_body, x_hub_signature_256):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid X-Hub-Signature-256 signature.",
            )

    try:
        json_payload = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload must be valid JSON.",
        )

    result = await whatsapp_service.process_webhook_payload(session, json_payload)
    return result


# ── 2. Templates & Previews ───────────────────────────────────────────────────

@router.get(
    "/templates",
    response_model=List[WhatsAppTemplateDefinition],
    summary="List available standard recruiting WhatsApp templates",
)
def list_templates() -> List[WhatsAppTemplateDefinition]:
    """Retrieve all available pre-approved recruiting message templates."""
    return whatsapp_service.list_templates()


@router.post(
    "/batch-preview",
    response_model=WhatsAppBatchPreviewResponse,
    summary="Preview template variables for selected candidates before HR approval",
)
async def preview_batch_templates(
    payload: WhatsAppBatchPreviewRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WhatsAppBatchPreviewResponse:
    """
    HR Flow Step 1 & 2: Select candidates -> Preview template with substituted variables.
    Flags candidates who have not opted in or lack phone numbers.
    """
    return await whatsapp_service.preview_batch_templates(
        session=session,
        user_id=current_user.id,
        candidate_ids=payload.candidate_ids,
        template_name=payload.template_name,
        language_code=payload.language_code,
        custom_variables=payload.custom_variables,
    )


# ── 3. Sending Messages ───────────────────────────────────────────────────────

@router.post(
    "/send-template",
    response_model=WhatsAppMessageRead,
    summary="Send a pre-approved template message (requires candidate opt-in)",
    dependencies=[Depends(rate_limit(times=30, seconds=60, scope="whatsapp:send"))],
)
async def send_template_message(
    payload: WhatsAppSendTemplateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WhatsAppMessageRead:
    """
    Send a template message to an individual candidate.
    Strictly verifies candidate opt-in; blocks otherwise.
    """
    msg = await whatsapp_service.send_template_message(
        session=session,
        candidate_id=payload.candidate_id,
        user_id=current_user.id,
        template_name=payload.template_name,
        language_code=payload.language_code,
        variables=payload.variables,
    )
    return WhatsAppMessageRead.model_validate(msg)


@router.post(
    "/send-freeform",
    response_model=WhatsAppMessageRead,
    summary="Send a free-form message (only when 24h care window is open & opted-in)",
    dependencies=[Depends(rate_limit(times=30, seconds=60, scope="whatsapp:send"))],
)
async def send_freeform_message(
    payload: WhatsAppSendFreeformRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WhatsAppMessageRead:
    """
    Send a direct text message to a candidate.
    Enforces Meta's 24-hour customer service window based on last inbound time.
    Blocks if candidate is not opted in or window is expired.
    """
    msg = await whatsapp_service.send_freeform_message(
        session=session,
        candidate_id=payload.candidate_id,
        user_id=current_user.id,
        text_content=payload.message,
        ai_drafted=False,
        hr_approved=True,
    )
    return WhatsAppMessageRead.model_validate(msg)


@router.post(
    "/batch-send",
    response_model=WhatsAppBatchSendResponse,
    summary="HR Flow: Approve and dispatch rate-limited batch template messages",
)
async def batch_send_templates(
    payload: WhatsAppBatchSendRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WhatsAppBatchSendResponse:
    """
    HR Flow Step 3: Approve & Send.
    Sends template messages with rate limiting, logging individual results.
    """
    return await whatsapp_service.batch_send_templates(
        session=session,
        user_id=current_user.id,
        candidate_ids=payload.candidate_ids,
        template_name=payload.template_name,
        language_code=payload.language_code,
        custom_variables=payload.custom_variables,
    )


# ── 4. Candidate Thread & Chat Management ─────────────────────────────────────

@router.get(
    "/conversations",
    response_model=WhatsAppConversationsResponse,
    summary="Get unified WhatsApp candidate conversations feed",
)
def list_conversations(
    session: SessionDep,
    current_user: CurrentUser,
    filter_status: Optional[str] = Query(None, description="'all', 'awaiting_reply', or 'window_open'"),
) -> WhatsAppConversationsResponse:
    """
    Retrieve candidate conversation threads, 24h care window countdowns, and awaiting reply status.
    Used by the Recruiter Unified Inbox.
    """
    return whatsapp_service.list_conversations(
        session=session,
        user_id=current_user.id,
        filter_status=filter_status,
    )


@router.get(
    "/threads/{candidate_id}",
    response_model=WhatsAppThreadResponse,
    summary="Get candidate WhatsApp conversation thread and 24h window status",
)
def get_candidate_thread(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> WhatsAppThreadResponse:
    """
    Retrieve message history, delivery statuses, opt-in state, and live 24h care window timer.
    """
    return whatsapp_service.get_candidate_thread(
        session=session,
        candidate_id=candidate_id,
        user_id=current_user.id,
    )


@router.post(
    "/candidates/{candidate_id}/opt-in",
    summary="Record or update candidate WhatsApp communication opt-in status",
)
def update_candidate_opt_in(
    candidate_id: uuid.UUID,
    payload: WhatsAppOptInUpdate,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Sets candidate's WhatsApp opt-in flag.
    Outbound messages require this flag to be True.
    """
    cand = whatsapp_service.set_candidate_opt_in(
        session=session,
        candidate_id=candidate_id,
        user_id=current_user.id,
        opt_in=payload.whatsapp_opt_in,
    )
    return {
        "candidate_id": str(cand.id),
        "whatsapp_opt_in": cand.whatsapp_opt_in,
        "whatsapp_opt_in_at": cand.whatsapp_opt_in_at,
    }


@router.post(
    "/messages/{message_id}/retry",
    response_model=WhatsAppMessageRead,
    summary="Retry sending a failed message",
)
async def retry_failed_message(
    message_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> WhatsAppMessageRead:
    """
    Retry a message in 'failed' status.
    Increments retry_count and handles 24h window re-validation.
    """
    msg = await whatsapp_service.retry_failed_message(
        session=session,
        message_id=message_id,
        user_id=current_user.id,
    )
    return WhatsAppMessageRead.model_validate(msg)


# ── 5. AI Reply Drafting (HR Must Approve Before Send) ────────────────────────

@router.post(
    "/ai-draft-reply",
    response_model=WhatsAppAIDraftResponse,
    summary="AI drafts a WhatsApp reply for candidate (HR must approve before sending)",
)
async def ai_draft_reply(
    payload: WhatsAppAIDraftRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WhatsAppAIDraftResponse:
    """
    AI synthesizes candidate context, job opening requirements, and chat history to draft a response.
    Returns draft for recruiter review.
    Does NOT send to candidate until HR approves and explicitly dispatches.
    """
    return await whatsapp_service.ai_draft_reply(
        session=session,
        candidate_id=payload.candidate_id,
        user_id=current_user.id,
        instructions=payload.instructions,
    )


# ── 6. Contact Candidate Action (WhatsApp or Email with JD Variables) ────────

@router.get(
    "/candidates/{candidate_id}/contact-preview",
    summary="Get pre-filled contact variables from JD and care window status",
)
def get_contact_preview(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Returns candidate phone status, 24h care window status, and prefilled variables
    from the job opening (role, location, next steps, company) for previewing.
    """
    return whatsapp_service.get_contact_preview(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
    )


@router.post(
    "/contact/{candidate_id}",
    response_model=ContactCandidateResponse,
    summary="HR Flow: Contact candidate via WhatsApp or Email after preview & approval",
    dependencies=[Depends(rate_limit(times=20, seconds=60, scope="whatsapp:contact"))],
)
async def contact_candidate(
    candidate_id: uuid.UUID,
    payload: ContactCandidateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> ContactCandidateResponse:
    """
    Contact candidate via WhatsApp or Email:
    - Pick WhatsApp or Email
    - Preview message with variables filled from JD (role, location, next steps)
    - HR approves, then it sends
    - Requires opt-in flag for WhatsApp
    - Rate-limited to prevent abuse
    """
    return await whatsapp_service.contact_candidate(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        payload=payload,
    )
