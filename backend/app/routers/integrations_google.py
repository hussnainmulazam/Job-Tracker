"""Google Integration Router — status, disconnection, Gmail background sync, and sending emails."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.models.google_account import GoogleAccount
from app.models.job_opening import JobOpening
from app.schemas.google import (
    GmailSyncResponse,
    GoogleAccountStatusResponse,
    GoogleAccountUpdateRequest,
    GooglePreviewEmailRequest,
    GooglePreviewEmailResponse,
    GoogleSendEmailRequest,
    GoogleSendEmailResponse,
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
    label: str = Query(default=None, description="Optional custom Gmail label ID"),
) -> GmailSyncResponse:
    """
    Executes Gmail resume sync job:
      - Searches messages matching query/label for PDF/DOCX attachments
      - Skips already synced message IDs (incremental)
      - Extracts and saves resumes to Supabase Storage
      - Creates candidate profiles automatically
    """
    service = GoogleService(session)
    try:
        return service.sync_gmail(
            user_id=current_user.id,
            override_query=query,
            override_label=label,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.patch(
    "/integrations/google/settings",
    response_model=GoogleAccountStatusResponse,
    summary="Update Gmail sync query, label filters, or default job opening",
)
def update_sync_settings(
    payload: GoogleAccountUpdateRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> GoogleAccountStatusResponse:
    """Updates the HR search query, label, or default job opening used by the Gmail sync job."""
    account = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == current_user.id)
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Google account connected.",
        )

    if payload.sync_query is not None:
        account.sync_query = payload.sync_query
    if payload.sync_label is not None:
        account.sync_label = payload.sync_label

    if payload.default_opening_id is not None:
        # Validate opening belongs to user
        opening = session.exec(
            select(JobOpening).where(
                JobOpening.id == payload.default_opening_id,
                JobOpening.user_id == current_user.id,
            )
        ).first()
        if not opening:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job opening '{payload.default_opening_id}' not found.",
            )
        account.default_opening_id = payload.default_opening_id

    session.add(account)
    session.commit()
    session.refresh(account)

    service = GoogleService(session)
    return service.get_status(current_user.id)


@router.post(
    "/integrations/google/preview-email",
    response_model=GooglePreviewEmailResponse,
    summary="Preview candidate email before sending via Gmail API",
)
def preview_email(
    payload: GooglePreviewEmailRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> GooglePreviewEmailResponse:
    """Interpolates template variables (candidate_name, role, company, slot_link) and previews message."""
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
