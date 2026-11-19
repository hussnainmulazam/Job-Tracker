"""Google Integration Router — status, disconnection, Gmail background sync, email conversations & threads, and sending emails."""
import uuid
from typing import Optional, List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.models.google_account import GoogleAccount
from app.models.job_opening import JobOpening
from app.models.candidate import Candidate
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.schemas.google import (
    GmailSyncResponse,
    GoogleAccountStatusResponse,
    GoogleAccountUpdateRequest,
    GooglePreviewEmailRequest,
    GooglePreviewEmailResponse,
    GoogleSendEmailRequest,
    GoogleSendEmailResponse,
    EmailConversationSummary,
    EmailConversationsResponse,
    EmailMessageItem,
    EmailThreadResponse,
    EmailReplyRequest,
    EmailAIDraftRequest,
    EmailAIDraftResponse,
)
from app.services.google_service import GoogleService

router = APIRouter(tags=["Google Integration"])


@router.get(
    "/integrations/google/status",
    response_model=GoogleAccountStatusResponse,
    summary="Get Google connection and Gmail sync status",
)
def get_google_status(
    current_user: CurrentUser,
    session: SessionDep,
) -> GoogleAccountStatusResponse:
    """Returns whether Google OAuth is connected, granted scopes, reconnect banner info, and last sync status."""
    service = GoogleService(session)
    return service.get_status(current_user.id)


@router.post(
    "/integrations/google/disconnect",
    summary="Disconnect Google account and revoke tokens",
)
def disconnect_google(
    current_user: CurrentUser,
    session: SessionDep,
):
    """Disconnects linked Google account, revokes OAuth tokens, and clears credentials."""
    service = GoogleService(session)
    service.disconnect(current_user.id)
    return {"detail": "Google account disconnected successfully."}


@router.post(
    "/integrations/google/sync",
    response_model=GmailSyncResponse,
    summary="Trigger on-demand incremental Gmail resume sync",
)
def sync_gmail(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    session: SessionDep,
    query: str = Query(default=None, description="Optional custom Gmail search query"),
    label: str = Query(default=None, description="Optional Gmail label ID (INBOX, STARRED, etc.)"),
) -> GmailSyncResponse:
    """
    Executes incremental Gmail resume sync:
    - Downloads PDF/DOCX attachments
    - Deterministically parses name, email, contact details
    - Deduplicates against existing candidates per opening
    - Ingests new candidates into the pipeline
    - Auto-screens CVs with fit scores and sends auto-acknowledgement emails
    """
    service = GoogleService(session)
    try:
        return service.sync_gmail(
            user_id=current_user.id,
            query=query,
            label=label,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.patch(
    "/integrations/google/settings",
    response_model=GoogleAccountStatusResponse,
    summary="Update Gmail sync query, label, and default opening assignment",
)
def update_sync_settings(
    payload: GoogleAccountUpdateRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> GoogleAccountStatusResponse:
    """Updates background sync query, label filter, or target default opening for incoming CVs."""
    account = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == current_user.id)
    ).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No connected Google account found for this recruiter.",
        )

    if payload.default_opening_id is not None:
        if payload.default_opening_id:
            opening = session.exec(
                select(JobOpening).where(
                    JobOpening.id == payload.default_opening_id,
                    JobOpening.user_id == current_user.id,
                )
            ).first()
            if not opening:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"JobOpening '{payload.default_opening_id}' not found.",
                )
            account.default_opening_id = payload.default_opening_id
        else:
            account.default_opening_id = None

    if payload.sync_query is not None:
        account.sync_query = payload.sync_query
    if payload.sync_label is not None:
        account.sync_label = payload.sync_label
    if payload.auto_reply_enabled is not None:
        account.auto_reply_enabled = payload.auto_reply_enabled

    session.add(account)
    session.commit()
    session.refresh(account)

    service = GoogleService(session)
    return service.get_status(current_user.id)


@router.post(
    "/integrations/google/preview-email",
    response_model=GooglePreviewEmailResponse,
    summary="Preview candidate email with resolved template variables",
)
def preview_email(
    payload: GooglePreviewEmailRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> GooglePreviewEmailResponse:
    """Pre-renders an email template with candidate and job requisition variables."""
    service = GoogleService(session)
    try:
        return service.preview_email(current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.post(
    "/integrations/google/send-email",
    response_model=GoogleSendEmailResponse,
    summary="Send candidate email via Gmail API (gmail.send) from recruiter's account",
)
def send_email(
    payload: GoogleSendEmailRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> GoogleSendEmailResponse:
    """
    Sends email to candidate using the connected recruiter's Gmail account (gmail.send).
    Stores outbound record in messages table and records in audit trail.
    """
    service = GoogleService(session)
    try:
        return service.send_email(current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.get(
    "/integrations/google/conversations",
    response_model=EmailConversationsResponse,
    summary="List recruiting email conversations across candidates",
)
def list_conversations(
    current_user: CurrentUser,
    session: SessionDep,
    filter_status: Optional[str] = Query(default="all"),
) -> EmailConversationsResponse:
    """Lists email conversations grouped by candidate for the Recruiting Inbox."""
    candidates = session.exec(
        select(Candidate)
        .where(Candidate.user_id == current_user.id)
        .order_by(Candidate.updated_at.desc())
    ).all()

    openings_map = {
        op.id: op.title
        for op in session.exec(select(JobOpening).where(JobOpening.user_id == current_user.id)).all()
    }

    conversations = []
    awaiting_count = 0

    for cand in candidates:
        last_msg = session.exec(
            select(Message)
            .where(Message.candidate_id == cand.id, Message.user_id == current_user.id)
            .order_by(Message.created_at.desc())
        ).first()

        is_awaiting = last_msg is not None and last_msg.direction == MessageDirection.inbound
        if is_awaiting:
            awaiting_count += 1

        if filter_status == "awaiting_reply" and not is_awaiting:
            continue

        conv = EmailConversationSummary(
            candidate_id=cand.id,
            candidate_name=cand.name,
            candidate_email=cand.email,
            candidate_stage=cand.stage.value if hasattr(cand.stage, "value") else str(cand.stage),
            opening_title=openings_map.get(cand.opening_id, "General Applications"),
            last_message_body=last_msg.body if last_msg else "Candidate application received.",
            last_message_subject=last_msg.template_name if (last_msg and last_msg.template_name) else "Application Status",
            last_message_direction=last_msg.direction.value if last_msg else "inbound",
            last_message_at=last_msg.created_at if last_msg else cand.created_at,
            unread=is_awaiting,
        )
        conversations.append(conv)

    return EmailConversationsResponse(
        conversations=conversations,
        total_conversations=len(conversations),
        awaiting_reply_count=awaiting_count,
    )


@router.get(
    "/integrations/google/threads/{candidate_id}",
    response_model=EmailThreadResponse,
    summary="Get candidate email thread history",
)
def get_thread(
    candidate_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
) -> EmailThreadResponse:
    """Returns candidate details and full email communication thread history."""
    cand = session.exec(
        select(Candidate).where(Candidate.id == candidate_id, Candidate.user_id == current_user.id)
    ).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    opening = session.exec(
        select(JobOpening).where(JobOpening.id == cand.opening_id)
    ).first()

    messages = session.exec(
        select(Message)
        .where(Message.candidate_id == candidate_id, Message.user_id == current_user.id)
        .order_by(Message.created_at.asc())
    ).all()

    msg_items = [
        EmailMessageItem(
            id=m.id,
            candidate_id=m.candidate_id,
            direction=m.direction.value if hasattr(m.direction, "value") else str(m.direction),
            subject=m.template_name or "Candidate Email",
            body=m.body,
            status=m.status.value if hasattr(m.status, "value") else str(m.status),
            sent_at=m.sent_at,
            created_at=m.created_at,
        )
        for m in messages
    ]

    return EmailThreadResponse(
        candidate_id=cand.id,
        candidate_name=cand.name,
        candidate_email=cand.email,
        candidate_stage=cand.stage.value if hasattr(cand.stage, "value") else str(cand.stage),
        opening_title=opening.title if opening else "Position",
        messages=msg_items,
    )


@router.post(
    "/integrations/google/reply",
    response_model=GoogleSendEmailResponse,
    summary="Send reply email in candidate thread",
)
def send_reply(
    payload: EmailReplyRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> GoogleSendEmailResponse:
    """Dispatches a direct email reply to candidate via Gmail API."""
    service = GoogleService(session)
    cand = session.exec(
        select(Candidate).where(Candidate.id == payload.candidate_id, Candidate.user_id == current_user.id)
    ).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    subj = payload.subject or "Next steps regarding your application"
    send_req = GoogleSendEmailRequest(
        candidate_id=payload.candidate_id,
        subject=subj,
        body=payload.message,
        template_name="candidate_email_reply",
    )
    return service.send_email(current_user.id, send_req)


@router.post(
    "/integrations/google/ai-draft-reply",
    response_model=EmailAIDraftResponse,
    summary="AI draft response to candidate email",
)
async def ai_draft_reply(
    payload: EmailAIDraftRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> EmailAIDraftResponse:
    """Generates an AI personalized email response using candidate and job context."""
    cand = session.exec(
        select(Candidate).where(Candidate.id == payload.candidate_id, Candidate.user_id == current_user.id)
    ).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    opening = session.exec(
        select(JobOpening).where(JobOpening.id == cand.opening_id)
    ).first()
    job_title = opening.title if opening else "Position"

    sys_prompt = "You are a professional executive recruiter writing an email response to an applicant."
    user_prompt = (
        f"Candidate Name: {cand.name}\n"
        f"Job Title: {job_title}\n"
        f"Candidate Skills: {', '.join(cand.matched_skills or [])}\n"
        f"Recruiter Notes: {payload.instructions or 'Follow up warmly about interview next steps.'}\n\n"
        f"Write a concise, polished email reply under 130 words. Do not use bracket placeholders."
    )

    drafted_text = ""
    try:
        from app.services.ai_router import ai_router
        drafted_text, _, _ = await ai_router.complete_with_chain(
            task_name="drafts",
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
        )
    except Exception:
        drafted_text = (
            f"Hi {cand.name},\n\n"
            f"Thank you for connecting with us regarding the {job_title} role.\n\n"
            f"We have reviewed your profile and would love to move forward with the next steps. "
            f"Please let us know your general availability for a brief call.\n\n"
            f"Best regards,\nRecruiting Team"
        )

    return EmailAIDraftResponse(
        candidate_id=cand.id,
        drafted_subject=f"Update regarding your application for {job_title}",
        drafted_message=drafted_text.strip(),
    )
