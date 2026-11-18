"""
outreach.py
~~~~~~~~~~~
FastAPI router for the outreach agent:
- AI personalized message drafting from JD & candidate data (WhatsApp or Email, Hinglish or English)
- Approval queue with single & bulk approval (hard rule: nothing sent without HR approval)
- Dispatch with scheduling link attachment
- Lifecycle stage updates: Contacted on candidate reply, Scheduled on booking, Interviewed after interview time
- Audit trail tracking with exact failure reasons and retry actions.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.dependencies import CurrentUser
from app.core.rate_limit import rate_limit
from app.db import SessionDep
from app.schemas.outreach import (
    ApprovalQueueItem,
    ApproveResult,
    BulkApproveRequest,
    BulkApproveResponse,
    DraftUpdateRequest,
    OutreachAuditItem,
    OutreachDraftRequest,
    OutreachDraftResponse,
    StageSyncResponse,
)
from app.services.outreach_service import outreach_service

router = APIRouter(prefix="/outreach", tags=["Outreach Agent"])


@router.post(
    "/draft",
    response_model=OutreachDraftResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Draft personalized outreach message for shortlisted candidate (WhatsApp or Email, Hinglish or English)",
    dependencies=[Depends(rate_limit(times=30, seconds=60, scope="outreach:draft"))],
)
async def draft_outreach(
    payload: OutreachDraftRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> OutreachDraftResponse:
    """
    Drafts a personalized message from JD and candidate data:
    - Moves candidate stage to 'shortlisted'
    - Generates/attaches unique candidate scheduling link
    - Queues in messages with hr_approved=False and status='pending'
    - Logs outreach_drafted in audit trail.
    """
    return await outreach_service.draft_outreach(
        session=session,
        user_id=current_user.id,
        candidate_id=payload.candidate_id,
        channel=payload.channel,
        language=payload.language,
        instructions=payload.instructions,
    )


@router.get(
    "/queue",
    response_model=List[ApprovalQueueItem],
    summary="Get HR approval queue of pending outreach drafts",
)
def get_approval_queue(
    session: SessionDep,
    current_user: CurrentUser,
    candidate_id: Optional[uuid.UUID] = Query(None, description="Filter by candidate"),
    channel: Optional[str] = Query(None, description="Filter by channel: whatsapp or email"),
) -> List[ApprovalQueueItem]:
    """
    Shows all outreach messages awaiting HR review (hr_approved == False).
    Nothing is sent until explicitly approved.
    """
    return outreach_service.get_approval_queue(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        channel=channel,
    )


@router.put(
    "/drafts/{message_id}",
    response_model=ApprovalQueueItem,
    summary="HR edits draft message text/subject before approving",
)
def update_draft_message(
    message_id: uuid.UUID,
    payload: DraftUpdateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> ApprovalQueueItem:
    """Allows HR to modify draft wording prior to dispatch."""
    return outreach_service.update_draft(
        session=session,
        user_id=current_user.id,
        message_id=message_id,
        payload=payload,
    )


@router.post(
    "/approve/{message_id}",
    response_model=ApproveResult,
    summary="HR approves single draft and triggers transmission",
    dependencies=[Depends(rate_limit(times=30, seconds=60, scope="outreach:send"))],
)
async def approve_and_send(
    message_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> ApproveResult:
    """
    HR approves single message:
    - Sets hr_approved = True
    - Transmits via WhatsApp or Email
    - Records success or exact error failure in audit trail.
    """
    return await outreach_service.approve_and_send(
        session=session,
        user_id=current_user.id,
        message_id=message_id,
    )


@router.post(
    "/bulk-approve",
    response_model=BulkApproveResponse,
    summary="HR bulk-approves and dispatches multiple outreach drafts",
    dependencies=[Depends(rate_limit(times=15, seconds=60, scope="outreach:bulk_send"))],
)
async def bulk_approve_and_send(
    payload: BulkApproveRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> BulkApproveResponse:
    """
    HR bulk approves an array of draft message IDs.
    Transmits each message and reports individual results and failure reasons.
    """
    return await outreach_service.bulk_approve_and_send(
        session=session,
        user_id=current_user.id,
        message_ids=payload.message_ids,
    )


@router.post(
    "/retry/{message_id}",
    response_model=ApproveResult,
    summary="Retry a failed outreach message",
    dependencies=[Depends(rate_limit(times=20, seconds=60, scope="outreach:retry"))],
)
async def retry_failed_outreach(
    message_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> ApproveResult:
    """
    Re-attempts sending a failed outreach message.
    Increments retry_count and logs audit trail.
    """
    return await outreach_service.retry_failed_outreach(
        session=session,
        user_id=current_user.id,
        message_id=message_id,
    )


@router.get(
    "/audit-trail",
    response_model=List[OutreachAuditItem],
    summary="Get outreach audit trail with failure reasons and retry capabilities",
)
def get_outreach_audit_trail(
    session: SessionDep,
    current_user: CurrentUser,
    candidate_id: Optional[uuid.UUID] = Query(None, description="Filter by candidate"),
    limit: int = Query(50, ge=1, le=200),
) -> List[OutreachAuditItem]:
    """
    Returns audit trail of candidate outreach actions, stage transitions,
    and transmission errors with retry metadata.
    """
    return outreach_service.get_outreach_audit_trail(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        limit=limit,
    )


@router.post(
    "/sync-stages",
    response_model=StageSyncResponse,
    summary="Sync candidate stages for passed interviews -> 'interviewed'",
)
def sync_interviewed_stages(
    session: SessionDep,
    current_user: CurrentUser,
) -> StageSyncResponse:
    """
    Evaluates completed interviews whose end_time has passed and transitions candidates to 'interviewed'.
    """
    return outreach_service.sync_completed_interviews(
        session=session,
        user_id=current_user.id,
    )
