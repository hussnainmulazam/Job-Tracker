"""
backend/app/routers/pipeline_agent.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
FastAPI router exposing endpoints for the Hiring Pipeline Agent.
Powers the Pipeline Page with real-time state machine transitions,
strict email template dispatches, and action audit logs.
"""

import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.candidate import Candidate
from app.services.pipeline_agent_service import (
    HiringPipelineAgent,
    PipelineStatus,
    get_candidate_pipeline_status,
)

router = APIRouter(prefix="/pipeline-agent", tags=["Pipeline Agent"])


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Schemas
# ─────────────────────────────────────────────────────────────────────────────
class CVIntakeRequest(BaseModel):
    name: str = Field(..., description="Candidate full name")
    email: str = Field(..., description="Candidate email address")
    job_title: str = Field(..., description="Target role / requisition title")
    cv_text: str = Field(..., description="Extracted resume text")
    cv_file_url: Optional[str] = Field(None, description="Optional resume storage URL")
    is_file_valid: bool = Field(True, description="Whether resume file was verified readable")


class HRReviewDecisionRequest(BaseModel):
    candidate_id: uuid.UUID
    decision: str = Field(..., description="APPROVE, REJECT, or ON_HOLD")
    feedback: Optional[str] = Field(None, description="HR feedback notes (auto-generated if empty for rejections)")


class CandidateReplyRequest(BaseModel):
    candidate_id: uuid.UUID
    round_name: str = Field("Initial", description="Initial, Behavioral, or Technical")
    reply_text: str = Field(..., description="Raw text of candidate availability reply")
    suggested_date: Optional[datetime] = Field(None, description="Optional parsed interview datetime")


class InterviewDecisionRequest(BaseModel):
    candidate_id: uuid.UUID
    round_name: str = Field("Initial", description="Initial, Behavioral, or Technical")
    decision: str = Field(..., description="APPROVE or REJECT")
    feedback: Optional[str] = Field(None, description="Interviewer feedback notes (required for rejection)")


class OfferActionRequest(BaseModel):
    candidate_id: uuid.UUID
    action: str = Field(
        ...,
        description="request_documents, offer_sent, offer_accepted, welcome_onboarding, or offer_declined",
    )
    note: Optional[str] = Field(None, description="Optional offer details or onboarding notes")


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/status", summary="Get overall pipeline agent health and candidates count by state")
def get_agent_status(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    candidates = session.exec(
        select(Candidate).where(Candidate.user_id == current_user.id)
    ).all()

    counts: Dict[str, int] = {}
    for c in candidates:
        st = get_candidate_pipeline_status(c)
        counts[st] = counts.get(st, 0) + 1

    return {
        "agent_name": "Hiring Pipeline Agent",
        "status": "active",
        "total_candidates": len(candidates),
        "status_breakdown": counts,
    }


@router.post("/cycle", summary="Trigger autonomous background cycles (reminders, timers, escalations)")
async def run_agent_cycle(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    agent = HiringPipelineAgent(session, current_user.id)
    cycle_result = await agent.process_background_cycles()
    return {"message": "Pipeline agent background cycle completed.", **cycle_result}


@router.post("/cv-intake", summary="Stage 1 & 2: Ingest CV, validate, deduplicate, score, and move to HR Review")
def cv_intake(
    payload: CVIntakeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    agent = HiringPipelineAgent(session, current_user.id)
    result = agent.stage_1_cv_intake(
        candidate_name=payload.name,
        candidate_email=payload.email,
        job_title=payload.job_title,
        cv_text=payload.cv_text,
        cv_file_url=payload.cv_file_url,
        is_file_valid=payload.is_file_valid,
    )
    return result


@router.post("/hr-review", summary="Stage 3: HR Approve, Reject, or Place On-Hold with automated email dispatch")
def hr_review_decision(
    payload: HRReviewDecisionRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    agent = HiringPipelineAgent(session, current_user.id)
    try:
        result = agent.stage_3_hr_review_decision(
            candidate_id=payload.candidate_id,
            decision=payload.decision,
            feedback=payload.feedback,
        )
        return result
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/candidate-reply", summary="Stage 4: Process candidate availability reply & match calendar")
async def candidate_availability_reply(
    payload: CandidateReplyRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    agent = HiringPipelineAgent(session, current_user.id)
    try:
        result = await agent.stage_4_handle_availability_reply(
            candidate_id=payload.candidate_id,
            round_name=payload.round_name,
            reply_text=payload.reply_text,
            suggested_dt=payload.suggested_date,
        )
        return result
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/interview-decision", summary="Stage 6: HR interview decision (Approve moves to next round or Offer)")
def interview_decision(
    payload: InterviewDecisionRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    agent = HiringPipelineAgent(session, current_user.id)
    try:
        result = agent.stage_6_interview_decision(
            candidate_id=payload.candidate_id,
            round_name=payload.round_name,
            decision=payload.decision,
            feedback=payload.feedback,
        )
        return result
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/offer-action", summary="Stage 7: Execute post-offer HR manual actions (cover note, onboarding)")
def offer_action(
    payload: OfferActionRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    agent = HiringPipelineAgent(session, current_user.id)
    try:
        result = agent.stage_7_offer_section_action(
            candidate_id=payload.candidate_id,
            action=payload.action,
            note=payload.note,
        )
        return result
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.get("/candidate/{candidate_id}/history", summary="Get complete structured pipeline action log for a candidate")
def get_candidate_history(
    candidate_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    candidate = session.exec(
        select(Candidate).where(Candidate.id == candidate_id, Candidate.user_id == current_user.id)
    ).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")

    ext = candidate.extracted_data or {}
    return {
        "candidate_id": str(candidate.id),
        "name": candidate.name,
        "email": candidate.email,
        "current_status": get_candidate_pipeline_status(candidate),
        "logs": ext.get("pipeline_logs", []),
    }
