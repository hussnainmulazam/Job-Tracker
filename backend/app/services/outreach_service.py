"""
outreach_service.py
~~~~~~~~~~~~~~~~~~~
Core service for the outreach agent:
1. Drafts personalised outreach messages from JD and candidate data (WhatsApp or Email, Hinglish or English).
2. Manages the Recruiter Approval Queue (single & bulk approval). Nothing is sent without HR approval.
3. Sends approved messages with scheduling link, and manages candidate lifecycle stages:
   - Shortlisted: candidate selected for outreach
   - Contacted: candidate replies
   - Scheduled: candidate books a slot
   - Interviewed: after interview time passes
4. Logs every step to the audit trail with exact failure reasons and retry support.
"""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlmodel import Session, col, or_, select

from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate, CandidateStage
from app.models.google_account import GoogleAccount
from app.models.interview import Interview, InterviewStatus, SchedulingLink, SchedulingLinkStatus
from app.models.job_opening import JobOpening
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.models.user import User
from app.schemas.google import GoogleSendEmailRequest
from app.schemas.outreach import (
    ApprovalQueueItem,
    ApproveResult,
    BulkApproveResponse,
    DraftUpdateRequest,
    OutreachAuditItem,
    OutreachDraftResponse,
    StageSyncResponse,
)
from app.services.ai_router import ai_router
from app.services.audit_log_service import audit_log_service
from app.services.google_service import GoogleService
from app.services.scheduling_service import scheduling_service
from app.schemas.google import GoogleSendEmailRequest

logger = logging.getLogger(__name__)


class OutreachService:
    # ── 1. AI Message Drafting ───────────────────────────────────────────────

    async def draft_outreach(
        self,
        session: Session,
        user_id: uuid.UUID,
        candidate_id: uuid.UUID,
        channel: str = "email",
        language: str = "english",
        instructions: Optional[str] = None,
    ) -> OutreachDraftResponse:
        """
        Drafts a personalised outreach message from the JD and candidate data.
        Supports WhatsApp or Email, Hinglish or English.
        Moves candidate stage to 'shortlisted' if not already past it.
        Attaches a candidate tokenized scheduling link.
        Saves draft to `messages` table with hr_approved=False and status='pending_approval'.
        """
        candidate = session.exec(
            select(Candidate).where(Candidate.id == candidate_id, Candidate.user_id == user_id)
        ).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found.")

        opening = session.exec(
            select(JobOpening).where(JobOpening.id == candidate.opening_id)
        ).first()
        if not opening:
            raise HTTPException(status_code=404, detail="Associated job opening not found.")

        # Ensure candidate is marked shortlisted
        old_stage = candidate.stage
        if candidate.stage in [CandidateStage.applied, CandidateStage.screening]:
            candidate.stage = CandidateStage.shortlisted
            candidate.updated_at = datetime.now(timezone.utc)
            session.add(candidate)
            session.commit()
            session.refresh(candidate)

            audit_log_service.record(
                session=session,
                user_id=user_id,
                candidate_id=candidate.id,
                opening_id=opening.id,
                action="stage_transition",
                from_stage=old_stage.value if hasattr(old_stage, "value") else str(old_stage),
                to_stage="shortlisted",
                details="Candidate shortlisted for recruiter outreach.",
            )

        # 1. Ensure or generate scheduling link
        active_link = session.exec(
            select(SchedulingLink).where(
                SchedulingLink.candidate_id == candidate.id,
                SchedulingLink.status == SchedulingLinkStatus.active,
                SchedulingLink.expires_at > datetime.now(timezone.utc),
            )
        ).first()

        if active_link:
            token = active_link.token
        else:
            link_read = scheduling_service.create_scheduling_link(
                session=session,
                user_id=user_id,
                candidate_id=candidate.id,
                slot_duration_minutes=30,
                validity_days=7,
            )
            token = link_read.token

        public_base = settings.FRONTEND_URL or "http://localhost:3000"
        scheduling_url = f"{public_base}/schedule/{token}"

        # 2. Extract key candidate details & JD highlights
        matched_skills_list = candidate.matched_skills if isinstance(candidate.matched_skills, list) else []
        skills_text = ", ".join(matched_skills_list[:3]) if matched_skills_list else "your technical background"
        req_skills_list = opening.required_skills if isinstance(opening.required_skills, list) else []
        jd_skills_text = ", ".join(req_skills_list[:3]) if req_skills_list else opening.title

        channel_clean = channel.lower().strip()
        lang_clean = language.lower().strip()

        # 3. Call AI router for personalized drafting (with intelligent fallback)
        draft_body = ""
        subject = f"Interview Invitation: {opening.title} opportunity"

        try:
            sys_prompt = (
                "You are an expert executive talent recruiter. "
                "Your goal is to draft a personalized, compelling outreach message to a shortlisted candidate. "
                "Always incorporate the provided scheduling link seamlessly. "
                "Never invent candidate qualifications not present in the prompt. "
                "Return ONLY the drafted message text (with Subject line on first line if email)."
            )

            user_prompt = (
                f"Candidate Name: {candidate.name}\n"
                f"Candidate Summary: {candidate.summary or 'Experienced professional'}\n"
                f"Candidate Top Skills: {skills_text}\n"
                f"Job Title: {opening.title}\n"
                f"Job Location: {getattr(opening, 'location', 'Remote / Hybrid')}\n"
                f"Key Requisition Skills: {jd_skills_text}\n"
                f"Interview Scheduling Link: {scheduling_url}\n"
                f"Channel: {channel_clean.upper()}\n"
                f"Language: {lang_clean.upper()}\n"
                f"Additional Instructions: {instructions or 'Invite to initial screening conversation.'}\n\n"
            )

            if lang_clean == "hinglish":
                user_prompt += (
                    "Write in natural Hinglish (conversational Hindi written in English/Latin script mixed with English). "
                    "Make it sound natural and professional (e.g., 'Hi [Name], humne aapka profile dekha aur...')."
                )
            else:
                user_prompt += "Write in polished, engaging professional English."

            if channel_clean == "whatsapp":
                user_prompt += " Keep it concise (under 120 words), direct, and suitable for WhatsApp chat."
            else:
                user_prompt += " Format with 'Subject: [Subject Line]' on line 1, then a blank line, greeting, body, scheduling link, and closing."

            ai_res, model_used, latency = await ai_router.complete_with_chain(
                task_name="drafts",
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.7,
                timeout=25.0,
            )
            draft_body = (ai_res or "").strip()

            if channel_clean == "email" and "Subject:" in draft_body:
                parts = draft_body.split("\n", 2)
                if parts[0].startswith("Subject:"):
                    subject = parts[0].replace("Subject:", "").strip()
                    draft_body = parts[2].strip() if len(parts) > 2 else parts[1].strip()

        except Exception as exc:
            logger.warning("AI drafting router exception (%s). Using high-quality heuristic fallback.", exc)
            if lang_clean == "hinglish":
                if channel_clean == "whatsapp":
                    draft_body = (
                        f"Hi {candidate.name}! Humne aapka profile review kiya for {opening.title} role aur aapka experience in {skills_text} really impressed us. "
                        f"Hum aapse short discussion karna chahte hain. Please is link se convenient time slot book kar lijiye: {scheduling_url}\n\n"
                        f"Looking forward to connecting!"
                    )
                else:
                    subject = f"Discussion regarding {opening.title} role at our team"
                    draft_body = (
                        f"Hi {candidate.name},\n\n"
                        f"Aapka profile review karne ke baad we are very excited about your background in {skills_text}. "
                        f"Hum aapse {opening.title} position ke baare mein baat karna chahte hain.\n\n"
                        f"Aap apne convenience ke according neeche diye gaye scheduling link se interview slot book kar sakte hain:\n"
                        f"{scheduling_url}\n\n"
                        f"Looking forward to speaking with you!\n\n"
                        f"Best regards,\nRecruiting Team"
                    )
            else:
                if channel_clean == "whatsapp":
                    draft_body = (
                        f"Hi {candidate.name}! We came across your background and were impressed by your expertise in {skills_text}. "
                        f"We would love to discuss the {opening.title} opportunity with you. "
                        f"Please select a convenient time for a chat here: {scheduling_url}\n\n"
                        f"Looking forward to speaking!"
                    )
                else:
                    subject = f"Interview Invitation: {opening.title}"
                    draft_body = (
                        f"Hi {candidate.name},\n\n"
                        f"Thank you for considering opportunities with us. We reviewed your profile and were especially impressed by your experience with {skills_text}.\n\n"
                        f"We would love to invite you for an interview for the {opening.title} role. Please use the link below to select a time that fits your schedule:\n"
                        f"{scheduling_url}\n\n"
                        f"Looking forward to our conversation.\n\n"
                        f"Best regards,\nRecruiting Team"
                    )

        # 4. Save to messages table with hr_approved=False
        now_utc = datetime.now(timezone.utc)
        message = Message(
            candidate_id=candidate.id,
            user_id=user_id,
            direction=MessageDirection.outbound,
            message_type=MessageType.email if channel_clean == "email" else MessageType.text,
            body=draft_body,
            status=MessageStatus.pending,
            ai_drafted=True,
            hr_approved=False,  # HARD CONSTRAINT: nothing sent without approval
            template_variables={
                "language": lang_clean,
                "channel": channel_clean,
                "subject": subject,
                "scheduling_url": scheduling_url,
                "opening_title": opening.title,
            },
            created_at=now_utc,
            updated_at=now_utc,
        )
        session.add(message)
        session.commit()
        session.refresh(message)

        # Log audit trail
        audit_log_service.record(
            session=session,
            user_id=user_id,
            candidate_id=candidate.id,
            opening_id=opening.id,
            action="outreach_drafted",
            details=json.dumps({
                "message_id": str(message.id),
                "channel": channel_clean,
                "language": lang_clean,
                "scheduling_url": scheduling_url,
                "hr_approved": False,
            }),
        )

        return OutreachDraftResponse(
            message_id=message.id,
            candidate_id=candidate.id,
            candidate_name=candidate.name,
            channel=channel_clean,
            language=lang_clean,
            body=draft_body,
            subject=subject if channel_clean == "email" else None,
            scheduling_url=scheduling_url,
            status=message.status.value if hasattr(message.status, "value") else str(message.status),
            ai_drafted=message.ai_drafted,
            hr_approved=message.hr_approved,
            created_at=message.created_at,
        )

    # ── 2. Approval Queue Management ─────────────────────────────────────────

    def get_approval_queue(
        self,
        session: Session,
        user_id: uuid.UUID,
        candidate_id: Optional[uuid.UUID] = None,
        channel: Optional[str] = None,
    ) -> List[ApprovalQueueItem]:
        """
        Retrieves messages waiting in the HR approval queue (hr_approved == False).
        """
        query = select(Message).where(
            Message.user_id == user_id,
            Message.direction == MessageDirection.outbound,
            Message.hr_approved == False,
        )

        if candidate_id:
            query = query.where(Message.candidate_id == candidate_id)

        messages = session.exec(query.order_by(Message.created_at.desc())).all()

        items: List[ApprovalQueueItem] = []
        for msg in messages:
            cand = session.exec(select(Candidate).where(Candidate.id == msg.candidate_id)).first()
            if not cand:
                continue

            opening = session.exec(select(JobOpening).where(JobOpening.id == cand.opening_id)).first()

            vars_dict = msg.template_variables or {}
            msg_channel = vars_dict.get("channel", "email" if msg.message_type == MessageType.email else "whatsapp")
            if channel and channel.lower() != msg_channel.lower():
                continue

            msg_lang = vars_dict.get("language", "english")
            subject = vars_dict.get("subject")
            scheduling_url = vars_dict.get("scheduling_url")

            cand_stage_str = cand.stage.value if hasattr(cand.stage, "value") else str(cand.stage)

            items.append(
                ApprovalQueueItem(
                    message_id=msg.id,
                    candidate_id=cand.id,
                    candidate_name=cand.name,
                    candidate_email=cand.email,
                    candidate_phone=cand.phone,
                    candidate_stage=cand_stage_str,
                    opening_id=opening.id if opening else None,
                    opening_title=opening.title if opening else None,
                    channel=msg_channel,
                    language=msg_lang,
                    body=msg.body,
                    subject=subject,
                    scheduling_url=scheduling_url,
                    status=msg.status.value if hasattr(msg.status, "value") else str(msg.status),
                    error_message=msg.error_message,
                    retry_count=msg.retry_count,
                    created_at=msg.created_at,
                )
            )

        return items

    def update_draft(
        self,
        session: Session,
        user_id: uuid.UUID,
        message_id: uuid.UUID,
        payload: DraftUpdateRequest,
    ) -> ApprovalQueueItem:
        """Allows HR to edit the drafted message text and subject before approving."""
        msg = session.exec(
            select(Message).where(Message.id == message_id, Message.user_id == user_id)
        ).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Draft message not found.")

        msg.body = payload.body
        vars_dict = dict(msg.template_variables or {})
        if payload.subject:
            vars_dict["subject"] = payload.subject
        msg.template_variables = vars_dict
        msg.updated_at = datetime.now(timezone.utc)

        session.add(msg)
        session.commit()
        session.refresh(msg)

        # Re-fetch item
        queue = self.get_approval_queue(session, user_id, candidate_id=msg.candidate_id)
        for it in queue:
            if it.message_id == msg.id:
                return it

        raise HTTPException(status_code=500, detail="Failed to format updated draft.")

    # ── 3. Approval & Dispatch ───────────────────────────────────────────────

    async def approve_and_send(
        self,
        session: Session,
        user_id: uuid.UUID,
        message_id: uuid.UUID,
    ) -> ApproveResult:
        """
        HR approves and immediately dispatches the message:
        - Sets hr_approved = True
        - Dispatches via WhatsApp or Email
        - Logs audit trail with exact failure reasons if failed
        - NO silent failures.
        """
        msg = session.exec(
            select(Message).where(Message.id == message_id, Message.user_id == user_id)
        ).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found.")

        candidate = session.exec(select(Candidate).where(Candidate.id == msg.candidate_id)).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate record not found.")

        vars_dict = msg.template_variables or {}
        channel = vars_dict.get("channel", "email" if msg.message_type == MessageType.email else "whatsapp")
        now_utc = datetime.now(timezone.utc)

        # Mark HR Approved
        msg.hr_approved = True
        session.add(msg)
        session.commit()

        audit_log_service.record(
            session=session,
            user_id=user_id,
            candidate_id=candidate.id,
            action="outreach_approved",
            details=json.dumps({"message_id": str(msg.id), "channel": channel}),
        )

        send_error: Optional[str] = None
        send_success = False

        # Dispatch via Gmail API
        if not candidate.email:
            send_error = "Candidate has no email address on file."
        else:
            try:
                google_service = GoogleService(session)
                subject = vars_dict.get("subject") or "Interview Invitation"
                email_req = GoogleSendEmailRequest(
                    candidate_id=candidate.id,
                    subject=subject,
                    body=msg.body,
                    template_name="outreach_interview_invitation",
                )
                google_service.send_email(user_id=user_id, request=email_req)
                send_success = True
            except Exception as exc:
                send_error = str(exc)
                logger.warning("Email outreach failed for message %s: %s", msg.id, exc)

        if send_success:
            msg.status = MessageStatus.sent
            msg.sent_at = now_utc
            msg.error_message = None
            session.add(msg)
            session.commit()

            audit_log_service.record(
                session=session,
                user_id=user_id,
                candidate_id=candidate.id,
                action="outreach_sent",
                details=json.dumps({"message_id": str(msg.id), "channel": channel, "status": "sent"}),
            )

            return ApproveResult(
                message_id=msg.id,
                candidate_id=candidate.id,
                candidate_name=candidate.name,
                channel=channel,
                status="sent",
                error=None,
            )
        else:
            msg.status = MessageStatus.failed
            msg.failed_at = now_utc
            msg.error_message = send_error or "Unknown transmission error"
            session.add(msg)
            session.commit()

            audit_log_service.record(
                session=session,
                user_id=user_id,
                candidate_id=candidate.id,
                action="outreach_failed",
                details=json.dumps({
                    "message_id": str(msg.id),
                    "channel": channel,
                    "status": "failed",
                    "error": send_error,
                }),
            )

            return ApproveResult(
                message_id=msg.id,
                candidate_id=candidate.id,
                candidate_name=candidate.name,
                channel=channel,
                status="failed",
                error=send_error,
            )

    async def bulk_approve_and_send(
        self,
        session: Session,
        user_id: uuid.UUID,
        message_ids: List[uuid.UUID],
    ) -> BulkApproveResponse:
        """
        Bulk approves and dispatches all selected messages.
        Returns detailed summary of sent and failed items.
        """
        results: List[ApproveResult] = []
        sent_count = 0
        failed_count = 0

        for mid in message_ids:
            try:
                res = await self.approve_and_send(session=session, user_id=user_id, message_id=mid)
                results.append(res)
                if res.status == "sent":
                    sent_count += 1
                else:
                    failed_count += 1
            except Exception as exc:
                failed_count += 1
                results.append(
                    ApproveResult(
                        message_id=mid,
                        candidate_id=uuid.UUID(int=0),
                        candidate_name="Unknown",
                        channel="unknown",
                        status="failed",
                        error=str(exc),
                    )
                )

        return BulkApproveResponse(
            total=len(message_ids),
            approved_count=len(message_ids),
            sent_count=sent_count,
            failed_count=failed_count,
            results=results,
        )

    # ── 4. Retry Failed Step ─────────────────────────────────────────────────

    async def retry_failed_outreach(
        self,
        session: Session,
        user_id: uuid.UUID,
        message_id: uuid.UUID,
    ) -> ApproveResult:
        """
        Explicit retry action for failed outreach steps.
        Increments retry_count, attempts re-transmission, and updates audit trail.
        """
        msg = session.exec(
            select(Message).where(Message.id == message_id, Message.user_id == user_id)
        ).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found.")

        msg.retry_count += 1
        msg.status = MessageStatus.pending
        session.add(msg)
        session.commit()

        audit_log_service.record(
            session=session,
            user_id=user_id,
            candidate_id=msg.candidate_id,
            action="outreach_retry_initiated",
            details=json.dumps({"message_id": str(msg.id), "retry_count": msg.retry_count}),
        )

        return await self.approve_and_send(session=session, user_id=user_id, message_id=msg.id)

    # ── 5. Candidate Lifecycle Stage Transitions ─────────────────────────────

    def handle_candidate_reply(
        self,
        session: Session,
        candidate_id: uuid.UUID,
        reply_snippet: str = "",
    ) -> None:
        """
        When candidate replies (WhatsApp inbound or Email sync):
        Move stage to 'contacted' and record in audit log.
        """
        candidate = session.exec(select(Candidate).where(Candidate.id == candidate_id)).first()
        if not candidate:
            return

        old_stage = candidate.stage
        old_stage_str = old_stage.value if hasattr(old_stage, "value") else str(old_stage)

        # Update stage to 'contacted' if not already scheduled/interviewed/offer
        if old_stage_str in ["applied", "screening", "shortlisted"]:
            candidate.stage = CandidateStage.contacted
            candidate.updated_at = datetime.now(timezone.utc)
            session.add(candidate)
            session.commit()

            audit_log_service.record(
                session=session,
                user_id=candidate.user_id,
                candidate_id=candidate.id,
                opening_id=candidate.opening_id,
                action="candidate_replied",
                from_stage=old_stage_str,
                to_stage="contacted",
                details=json.dumps({"reply_snippet": reply_snippet[:150]}),
            )
            logger.info("Candidate %s transitioned from '%s' to 'contacted' on inbound reply.", candidate.id, old_stage_str)

    def handle_candidate_booked(
        self,
        session: Session,
        candidate_id: uuid.UUID,
        interview_id: uuid.UUID,
    ) -> None:
        """
        When candidate books an interview slot:
        Move stage to 'scheduled' and record in audit log.
        """
        candidate = session.exec(select(Candidate).where(Candidate.id == candidate_id)).first()
        if not candidate:
            return

        old_stage = candidate.stage
        old_stage_str = old_stage.value if hasattr(old_stage, "value") else str(old_stage)

        candidate.stage = CandidateStage.scheduled
        candidate.updated_at = datetime.now(timezone.utc)
        session.add(candidate)
        session.commit()

        audit_log_service.record(
            session=session,
            user_id=candidate.user_id,
            candidate_id=candidate.id,
            opening_id=candidate.opening_id,
            action="interview_scheduled",
            from_stage=old_stage_str,
            to_stage="scheduled",
            details=json.dumps({"interview_id": str(interview_id)}),
        )
        logger.info("Candidate %s transitioned from '%s' to 'scheduled'.", candidate.id, old_stage_str)

    def sync_completed_interviews(
        self,
        session: Session,
        user_id: Optional[uuid.UUID] = None,
    ) -> StageSyncResponse:
        """
        After interview time passes (interview.end_time < now_utc):
        Move candidate stage to 'interviewed' and record in audit log.
        """
        now_utc = datetime.now(timezone.utc)
        query = select(Interview).where(
            Interview.end_time <= now_utc,
            Interview.status != InterviewStatus.cancelled,
        )
        if user_id:
            query = query.where(Interview.user_id == user_id)

        passed_interviews = session.exec(query).all()
        updated_cands: List[uuid.UUID] = []

        for inv in passed_interviews:
            cand = session.exec(select(Candidate).where(Candidate.id == inv.candidate_id)).first()
            if not cand:
                continue

            cand_stage_str = cand.stage.value if hasattr(cand.stage, "value") else str(cand.stage)
            if cand_stage_str in ["scheduled", "interview", "contacted", "shortlisted"]:
                old_stage_str = cand_stage_str
                cand.stage = CandidateStage.interviewed
                cand.updated_at = now_utc
                session.add(cand)

                inv.status = InterviewStatus.completed
                inv.updated_at = now_utc
                session.add(inv)

                audit_log_service.record(
                    session=session,
                    user_id=inv.user_id,
                    candidate_id=cand.id,
                    opening_id=cand.opening_id,
                    action="interview_completed",
                    from_stage=old_stage_str,
                    to_stage="interviewed",
                    details=json.dumps({
                        "interview_id": str(inv.id),
                        "end_time": inv.end_time.isoformat(),
                    }),
                )
                updated_cands.append(cand.id)

        session.commit()
        return StageSyncResponse(
            interviews_checked=len(passed_interviews),
            stages_updated_to_interviewed=len(updated_cands),
            candidate_ids_updated=updated_cands,
        )

    # ── 6. Audit Trail Query ─────────────────────────────────────────────────

    def get_outreach_audit_trail(
        self,
        session: Session,
        user_id: uuid.UUID,
        candidate_id: Optional[uuid.UUID] = None,
        limit: int = 50,
    ) -> List[OutreachAuditItem]:
        """
        Returns audit trail for outreach events, stage transitions, and failures with retry metadata.
        """
        query = select(AuditLog).where(AuditLog.user_id == user_id)
        if candidate_id:
            query = query.where(AuditLog.candidate_id == candidate_id)

        logs = session.exec(query.order_by(AuditLog.created_at.desc()).limit(limit)).all()
        items: List[OutreachAuditItem] = []

        for log in logs:
            cand_name = None
            if log.candidate_id:
                cand = session.exec(select(Candidate).where(Candidate.id == log.candidate_id)).first()
                cand_name = cand.name if cand else None

            op_title = None
            if log.opening_id:
                op = session.exec(select(JobOpening).where(JobOpening.id == log.opening_id)).first()
                op_title = op.title if op else None

            # Parse failure reason or message_id from details if json
            failure_reason = None
            message_id: Optional[uuid.UUID] = None
            retryable = False

            if log.details:
                try:
                    d_parsed = json.loads(log.details)
                    if isinstance(d_parsed, dict):
                        failure_reason = d_parsed.get("error")
                        mid_str = d_parsed.get("message_id")
                        if mid_str:
                            try:
                                message_id = uuid.UUID(mid_str)
                            except Exception:
                                pass
                except Exception:
                    pass

            if log.action in ["outreach_failed", "whatsapp_send_failed", "email_send_failed"]:
                retryable = message_id is not None
                if not failure_reason:
                    failure_reason = log.details

            items.append(
                OutreachAuditItem(
                    id=log.id,
                    action=log.action,
                    candidate_id=log.candidate_id,
                    candidate_name=cand_name,
                    opening_title=op_title,
                    from_stage=log.from_stage,
                    to_stage=log.to_stage,
                    details=log.details,
                    failure_reason=failure_reason,
                    message_id=message_id,
                    retryable=retryable,
                    created_at=log.created_at,
                )
            )

        return items


outreach_service = OutreachService()
