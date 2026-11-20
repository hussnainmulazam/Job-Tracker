"""
backend/app/routers/cv_review.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
FastAPI router for the CV Review Flow:
- When a CV arrives, AI scores it against the opening (default pass mark 80, editable per opening)
- Categorizes recommendation: Recommended / Borderline / Not recommended
- Places candidate in 'Needs HR Review' queue (review_status='pending')
- Single & bulk HR Approve or Reject actions:
  * Approve: sends CV Passed and Job Details emails and scheduling link, advances stage to Shortlisted
  * Reject: sends Rejection template email, advances stage to Rejected
- Hard Rule: Nothing is sent before HR decides
- Logs every decision in the audit trail.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.schemas.candidate import (
    CVReviewDecisionRequest,
    CVReviewDecisionResponse,
    CVReviewOpeningPassMarkUpdate,
    CVReviewQueueItem,
)
from app.schemas.job_opening import JobOpeningRead
from app.services.cv_review_service import cv_review_service

router = APIRouter(prefix="/cv-review", tags=["CV Review Flow"])


@router.get(
    "/queue",
    response_model=List[CVReviewQueueItem],
    status_code=status.HTTP_200_OK,
    summary="Get candidates in the CV Review Queue (Needs HR Review / Approved / Rejected)",
)
def get_review_queue_endpoint(
    session: SessionDep,
    current_user: CurrentUser,
    opening_id: Optional[uuid.UUID] = Query(None, description="Filter by job opening ID"),
    status: Optional[str] = Query("pending", description="Filter by review status: pending, approved, rejected, or all"),
    search: Optional[str] = Query(None, description="Search candidate name, email, skills, or opening title"),
) -> List[CVReviewQueueItem]:
    """
    Returns candidate review queue items with match fit scores, recommendation labels
    (Recommended / Borderline / Not recommended), matched skills, missing skills, and short reason.
    """
    return cv_review_service.get_review_queue(
        session=session,
        user_id=current_user.id,
        opening_id=opening_id,
        status_filter=status or "pending",
        search=search,
    )


@router.post(
    "/decision",
    response_model=CVReviewDecisionResponse,
    status_code=status.HTTP_200_OK,
    summary="HR Review Decision: Approve or Reject candidates (single or bulk)",
)
async def submit_review_decision_endpoint(
    payload: CVReviewDecisionRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> CVReviewDecisionResponse:
    """
    Submits HR review decision for one or multiple candidates.
    - Action 'approve':
        * Generates candidate's unique scheduling link
        * Dispatches 'CV Passed' and 'Job Details' emails
        * Sets candidate stage to Shortlisted
        * Records in recruiter audit trail
    - Action 'reject':
        * Dispatches 'Rejection' template email
        * Sets candidate stage to Rejected
        * Records in recruiter audit trail
    - HARD RULE: Nothing is sent before HR decides.
    """
    return await cv_review_service.decide_review(
        session=session,
        user_id=current_user.id,
        payload=payload,
    )


@router.post(
    "/score/{candidate_id}",
    response_model=CVReviewQueueItem,
    status_code=status.HTTP_200_OK,
    summary="Run AI fit scoring for candidate and place into Needs HR Review queue",
)
async def score_candidate_review_endpoint(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    force_rerun: bool = Query(False, description="Force re-evaluation of CV against opening"),
) -> CVReviewQueueItem:
    """
    Evaluates candidate CV text against their target JobOpening, computes recommendation
    (Recommended, Borderline, or Not recommended) using the opening's pass mark,
    and lands candidate in the 'Needs HR Review' queue.
    """
    return await cv_review_service.score_and_queue_candidate(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        force_rerun=force_rerun,
    )


@router.patch(
    "/opening/{opening_id}/pass-mark",
    response_model=JobOpeningRead,
    status_code=status.HTTP_200_OK,
    summary="Update pass mark threshold for a job opening (default 80)",
)
def update_opening_pass_mark_endpoint(
    opening_id: uuid.UUID,
    payload: CVReviewOpeningPassMarkUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> JobOpeningRead:
    """
    Updates the pass mark (1-100) for a job opening.
    AI recommendation labels (Recommended / Borderline / Not recommended) will automatically
    recalculate according to this updated threshold.
    """
    opening = cv_review_service.update_opening_pass_mark(
        session=session,
        user_id=current_user.id,
        opening_id=opening_id,
        pass_mark=payload.pass_mark,
    )
    return JobOpeningRead.model_validate(opening)
