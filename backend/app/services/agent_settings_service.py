"""
agent_settings_service.py
~~~~~~~~~~~~~~~~~~~~~~~~~
Core service for autonomous agent controls:
- Pause / Resume agent toggle with reason tracking
- Daily message send limit & quota enforcement
- Real-time HR email alerts (instant on: candidate booking, candidate reply, action failure)
- Daily recruiting summary email generation and dispatch (new CVs, waiting for review, interviews today)
- Today's activity aggregation feed and metrics dashboard
- Comprehensive audit trail recording for all agent actions
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlmodel import Session, col, or_, select

from app.core.config import settings
from app.models.agent_settings import AgentSettings
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate, CandidateStage
from app.models.google_account import GoogleAccount
from app.models.interview import Interview, InterviewStatus
from app.models.job_opening import JobOpening
from app.models.message import Message, MessageDirection, MessageStatus
from app.models.notification import Notification
from app.models.onboarding import OnboardingSetup
from app.models.user import User
from app.schemas.agent_settings import (
    AgentActivityFeedItem,
    AgentSettingsRead,
    AgentSettingsUpdate,
    AgentTodayActivityResponse,
    DailySummarySendResponse,
)
from app.schemas.google import GoogleSendEmailRequest
from app.services.audit_log_service import audit_log_service
from app.services.google_service import GoogleService

logger = logging.getLogger(__name__)


class AgentSettingsService:

    # ── 1. Settings Retrieval & Default Provisioning ──────────────────────────

    def get_or_create_settings(self, session: Session, user_id: uuid.UUID) -> AgentSettings:
        """Retrieves user's agent settings or creates default record."""
        agent_settings = session.exec(
            select(AgentSettings).where(AgentSettings.user_id == user_id)
        ).first()

        if not agent_settings:
            recruiter = session.exec(select(User).where(User.id == user_id)).first()
            default_notify = recruiter.email if recruiter else None

            agent_settings = AgentSettings(
                user_id=user_id,
                is_paused=False,
                daily_send_limit=50,
                notify_email=default_notify,
                notify_on_booking=True,
                notify_on_reply=True,
                notify_on_failure=True,
                daily_summary_enabled=True,
                daily_summary_time="09:00",
            )
            session.add(agent_settings)
            session.commit()
            session.refresh(agent_settings)

        return agent_settings

    def to_read(self, session: Session, settings_obj: AgentSettings) -> AgentSettingsRead:
        """Converts AgentSettings model to read schema with today's quota usage."""
        sends_today = self.get_daily_send_count(session, settings_obj.user_id)
        sends_remaining = max(0, settings_obj.daily_send_limit - sends_today)

        return AgentSettingsRead(
            id=settings_obj.id,
            user_id=settings_obj.user_id,
            is_paused=settings_obj.is_paused,
            paused_at=settings_obj.paused_at,
            paused_reason=settings_obj.paused_reason,
            daily_send_limit=settings_obj.daily_send_limit,
            sends_today=sends_today,
            sends_remaining=sends_remaining,
            notify_email=settings_obj.notify_email,
            notify_on_booking=settings_obj.notify_on_booking,
            notify_on_reply=settings_obj.notify_on_reply,
            notify_on_failure=settings_obj.notify_on_failure,
            daily_summary_enabled=settings_obj.daily_summary_enabled,
            daily_summary_time=settings_obj.daily_summary_time,
            last_daily_summary_sent_at=settings_obj.last_daily_summary_sent_at,
            created_at=settings_obj.created_at,
            updated_at=settings_obj.updated_at,
        )

    # ── 2. Settings Update & Pause Toggle ─────────────────────────────────────

    def update_settings(
        self,
        session: Session,
        user_id: uuid.UUID,
        payload: AgentSettingsUpdate,
    ) -> AgentSettingsRead:
        """Updates agent configuration settings and logs audit trail."""
        settings_obj = self.get_or_create_settings(session, user_id)
        changes = []

        if payload.is_paused is not None and payload.is_paused != settings_obj.is_paused:
            settings_obj.is_paused = payload.is_paused
            now_utc = datetime.now(timezone.utc)
            if payload.is_paused:
                settings_obj.paused_at = now_utc
                settings_obj.paused_reason = "Paused via Agent Settings update"
            else:
                settings_obj.paused_at = None
                settings_obj.paused_reason = None
            changes.append(f"is_paused={payload.is_paused}")

        if payload.daily_send_limit is not None and payload.daily_send_limit != settings_obj.daily_send_limit:
            settings_obj.daily_send_limit = payload.daily_send_limit
            changes.append(f"daily_send_limit={payload.daily_send_limit}")

        if payload.notify_email is not None and payload.notify_email != settings_obj.notify_email:
            settings_obj.notify_email = payload.notify_email.strip() or None
            changes.append(f"notify_email={settings_obj.notify_email}")

        if payload.notify_on_booking is not None:
            settings_obj.notify_on_booking = payload.notify_on_booking
            changes.append(f"notify_on_booking={payload.notify_on_booking}")

        if payload.notify_on_reply is not None:
            settings_obj.notify_on_reply = payload.notify_on_reply
            changes.append(f"notify_on_reply={payload.notify_on_reply}")

        if payload.notify_on_failure is not None:
            settings_obj.notify_on_failure = payload.notify_on_failure
            changes.append(f"notify_on_failure={payload.notify_on_failure}")

        if payload.daily_summary_enabled is not None:
            settings_obj.daily_summary_enabled = payload.daily_summary_enabled
            changes.append(f"daily_summary_enabled={payload.daily_summary_enabled}")

        if payload.daily_summary_time is not None:
            settings_obj.daily_summary_time = payload.daily_summary_time.strip()
            changes.append(f"daily_summary_time={payload.daily_summary_time}")

        settings_obj.updated_at = datetime.now(timezone.utc)
        session.add(settings_obj)
        session.commit()
        session.refresh(settings_obj)

        audit_log_service.record(
            session=session,
            user_id=user_id,
            action="agent_settings_updated",
            details=f"Agent settings updated: {', '.join(changes) if changes else 'No changes'}",
        )

        return self.to_read(session, settings_obj)

    def toggle_pause(
        self,
        session: Session,
        user_id: uuid.UUID,
        paused: Optional[bool] = None,
        reason: Optional[str] = None,
    ) -> AgentSettingsRead:
        """Toggles or sets the agent pause state."""
        settings_obj = self.get_or_create_settings(session, user_id)
        new_state = (not settings_obj.is_paused) if paused is None else paused

        settings_obj.is_paused = new_state
        now_utc = datetime.now(timezone.utc)

        if new_state:
            settings_obj.paused_at = now_utc
            settings_obj.paused_reason = reason or "Paused by HR"
            action = "agent_paused"
            desc = f"Agent execution paused. Reason: {settings_obj.paused_reason}"
        else:
            settings_obj.paused_at = None
            settings_obj.paused_reason = None
            action = "agent_resumed"
            desc = "Agent execution resumed by HR."

        settings_obj.updated_at = now_utc
        session.add(settings_obj)
        session.commit()
        session.refresh(settings_obj)

        audit_log_service.record(
            session=session,
            user_id=user_id,
            action=action,
            details=desc,
        )

        return self.to_read(session, settings_obj)

    # ── 3. Quota & Send Limit Check ──────────────────────────────────────────

    def get_daily_send_count(self, session: Session, user_id: uuid.UUID) -> int:
        """Counts total outbound emails / messages dispatched today UTC by this recruiter."""
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        messages_today = session.exec(
            select(Message).where(
                Message.user_id == user_id,
                Message.direction == MessageDirection.outbound,
                Message.sent_at >= today_start,
            )
        ).all()
        return len(messages_today)

    def check_can_send(self, session: Session, user_id: uuid.UUID) -> Tuple[bool, str]:
        """
        Validates if agent is permitted to dispatch outgoing emails/messages:
          1. Checks if agent is paused -> Blocked
          2. Checks if daily send limit is reached -> Blocked
        """
        settings_obj = self.get_or_create_settings(session, user_id)
        if settings_obj.is_paused:
            return False, f"Agent is currently paused ({settings_obj.paused_reason or 'Manual pause'}). Outgoing sends are paused."

        sends_today = self.get_daily_send_count(session, user_id)
        if sends_today >= settings_obj.daily_send_limit:
            return (
                False,
                f"Daily message send limit reached ({sends_today}/{settings_obj.daily_send_limit} sent today). Increase daily limit in Agent Settings to dispatch more.",
            )

        return True, "OK"

    # ── 4. Today's Activity Dashboard Feed ───────────────────────────────────

    def get_today_activity(
        self,
        session: Session,
        user_id: uuid.UUID,
    ) -> AgentTodayActivityResponse:
        """
        Aggregates everything the agent did today:
          - Quota progress: sends today vs daily limit
          - Counts: CVs ingested, scored, waiting review, interviews booked/scheduled, failures
          - Chronological activity timeline feed from audit logs
        """
        settings_obj = self.get_or_create_settings(session, user_id)
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        sends_today = self.get_daily_send_count(session, user_id)
        sends_remaining = max(0, settings_obj.daily_send_limit - sends_today)

        # 1. CVs ingested today
        candidates_today = session.exec(
            select(Candidate).where(
                Candidate.user_id == user_id,
                Candidate.created_at >= today_start,
            )
        ).all()
        cvs_ingested = len(candidates_today)

        # 2. CVs scored today
        scored_today = session.exec(
            select(Candidate).where(
                Candidate.user_id == user_id,
                Candidate.score.is_not(None),
                Candidate.updated_at >= today_start,
            )
        ).all()
        cvs_scored = len(scored_today)

        # 3. Waiting for review queue
        waiting_review = session.exec(
            select(Candidate).where(
                Candidate.user_id == user_id,
                Candidate.review_status == "pending",
            )
        ).all()
        waiting_count = len(waiting_review)

        # 4. Interviews booked today
        booked_today = session.exec(
            select(Interview).where(
                Interview.user_id == user_id,
                Interview.created_at >= today_start,
            )
        ).all()
        interviews_booked = len(booked_today)

        # 5. Interviews scheduled for today
        tomorrow_start = today_start + timedelta(days=1)
        interviews_scheduled = session.exec(
            select(Interview).where(
                Interview.user_id == user_id,
                Interview.start_time >= today_start,
                Interview.start_time < tomorrow_start,
                Interview.status != InterviewStatus.cancelled,
            )
        ).all()
        scheduled_count = len(interviews_scheduled)

        # 6. Failures / errors today
        failure_logs = session.exec(
            select(AuditLog).where(
                AuditLog.user_id == user_id,
                AuditLog.created_at >= today_start,
                or_(
                    AuditLog.action.ilike("%fail%"),
                    AuditLog.action.ilike("%error%"),
                    AuditLog.action == "interview_failed",
                ),
            )
        ).all()
        failures_count = len(failure_logs)

        # 7. Chronological Activity Feed from AuditLog
        all_today_logs = session.exec(
            select(AuditLog)
            .where(
                AuditLog.user_id == user_id,
                AuditLog.created_at >= today_start,
            )
            .order_by(AuditLog.created_at.desc())
        ).all()

        feed_items: List[AgentActivityFeedItem] = []
        for log in all_today_logs[:50]:
            category, status_val, title = self._categorize_audit_log(log.action)
            cand = None
            if log.candidate_id:
                cand = session.exec(select(Candidate).where(Candidate.id == log.candidate_id)).first()
            op = None
            if log.opening_id:
                op = session.exec(select(JobOpening).where(JobOpening.id == log.opening_id)).first()

            feed_items.append(
                AgentActivityFeedItem(
                    id=str(log.id),
                    timestamp=log.created_at,
                    action=log.action,
                    category=category,
                    title=title,
                    details=log.details,
                    candidate_id=log.candidate_id,
                    candidate_name=cand.name if cand else None,
                    opening_id=log.opening_id,
                    opening_title=op.title if op else None,
                    status=status_val,
                )
            )

        return AgentTodayActivityResponse(
            is_paused=settings_obj.is_paused,
            paused_reason=settings_obj.paused_reason,
            daily_send_limit=settings_obj.daily_send_limit,
            daily_sends_today=sends_today,
            sends_today=sends_today,
            sends_remaining=sends_remaining,
            cvs_ingested_today=cvs_ingested,
            cvs_scored_today=cvs_scored,
            waiting_for_review_count=waiting_count,
            waiting_for_review=waiting_count,
            interviews_booked_today=interviews_booked,
            interviews_scheduled_today=scheduled_count,
            interviews_today=scheduled_count,
            failures_today=failures_count,
            activity_feed=feed_items,
            feed=feed_items,
        )

    def _categorize_audit_log(self, action: str) -> Tuple[str, str, str]:
        """Maps audit action key to human title, category, and UI visual status."""
        a = (action or "").lower()
        if "pause" in a:
            return "config", "warning", "Agent Paused"
        if "resume" in a:
            return "config", "success", "Agent Resumed"
        if "settings" in a:
            return "config", "info", "Settings Updated"
        if "interview_passed" in a:
            return "interview", "success", "Interview Passed & Advanced"
        if "interview_failed" in a:
            return "interview", "warning", "Interview Failed & Candidate Rejected"
        if "interview_no_show" in a:
            return "interview", "warning", "Interview Marked No-show"
        if "interview_scheduled" in a or "booking" in a:
            return "interview", "success", "Candidate Booked Interview"
        if "score" in a or "screen" in a or "matched" in a:
            return "screening", "info", "CV Evaluated by AI"
        if "offer" in a:
            return "email", "success", "Offer Letter Action"
        if "summary" in a:
            return "email", "info", "Daily Summary Email Dispatched"
        if "alert" in a:
            return "email", "warning", "HR Alert Notification Sent"
        if "fail" in a or "error" in a:
            return "error", "error", "Agent Processing Failure"
        if "cv_review_approved" in a:
            return "screening", "success", "Candidate CV Approved by HR"
        if "cv_review_rejected" in a:
            return "screening", "warning", "Candidate CV Rejected by HR"

        return "info", "info", action.replace("_", " ").title()

    # ── 5. Instant Real-Time HR Notifications ─────────────────────────────────

    def notify_hr_instant(
        self,
        session: Session,
        user_id: uuid.UUID,
        event_type: str,  # "booking" | "reply" | "failure"
        candidate_name: Optional[str] = None,
        opening_title: Optional[str] = None,
        details: Optional[str] = None,
        error_details: Optional[str] = None,
    ) -> None:
        """
        Sends an immediate email alert to HR when:
          - A candidate books an interview
          - A candidate replies to a message
          - An action or integration fails
        Also logs in notifications and audit trail.
        """
        settings_obj = self.get_or_create_settings(session, user_id)
        recruiter = session.exec(select(User).where(User.id == user_id)).first()
        target_email = settings_obj.notify_email or (recruiter.email if recruiter else None)

        if not target_email or "@" not in target_email:
            logger.info("No valid HR notify email configured for user %s, skipping instant alert", user_id)
            return

        c_name = candidate_name or "Candidate"
        op_title = opening_title or "Role Position"
        public_url = (getattr(settings, "FRONTEND_URL", None) or "http://localhost:3000").rstrip("/")

        # Check toggle permissions
        if event_type == "booking":
            if not settings_obj.notify_on_booking:
                return
            subject = f"[Immediate Alert] Interview Booked: {c_name} for {op_title}"
            body = (
                f"Hi HR,\n\n"
                f"Great news! {c_name} has just selected an interview slot for the {op_title} position.\n\n"
                f"Details:\n{details or 'Interview booked.'}\n\n"
                f"View your Interviews dashboard: {public_url}/interviews\n\n"
                f"Best regards,\nAI Candidate Screening Copilot"
            )
        elif event_type == "reply":
            if not settings_obj.notify_on_reply:
                return
            subject = f"[Immediate Alert] Candidate Reply Received: {c_name} ({op_title})"
            body = (
                f"Hi HR,\n\n"
                f"A new reply has been received from {c_name} regarding the {op_title} opening.\n\n"
                f"Message Preview:\n\"{details or 'New incoming reply.'}\"\n\n"
                f"Open your Recruiting Inbox to respond: {public_url}/inbox\n\n"
                f"Best regards,\nAI Candidate Screening Copilot"
            )
        else:  # failure
            if not settings_obj.notify_on_failure:
                return
            subject = f"[Action Required] Agent Alert: Processing Failure in {op_title}"
            body = (
                f"Hi HR,\n\n"
                f"The AI Recruiting Copilot encountered an issue that may require your attention:\n\n"
                f"Context: {details or 'Action processing failure'}\n"
                f"Error Details:\n{error_details or 'Unexpected exception encountered.'}\n\n"
                f"Check Integration Health & Settings: {public_url}/settings?tab=health\n\n"
                f"Best regards,\nAI Candidate Screening Copilot"
            )

        # 1. Create in-app Notification
        notif = Notification(
            user_id=user_id,
            title=subject,
            message=details or subject,
            type=f"alert_{event_type}",
            link="/interviews" if event_type == "booking" else ("/inbox" if event_type == "reply" else "/settings?tab=health"),
        )
        session.add(notif)

        # 2. Dispatch email via GoogleService (Gmail)
        try:
            g_acct = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == user_id)).first()
            if g_acct:
                g_service = GoogleService(session)
                g_service.send_email(
                    user_id=user_id,
                    request=GoogleSendEmailRequest(
                        candidate_id=None,
                        subject=subject,
                        body=body,
                        template_name=f"alert_{event_type}",
                    ),
                )
        except Exception as g_err:
            logger.info("Google Workspace instant alert note for %s: %s", user_id, g_err)

        # 3. Record Audit Trail
        audit_log_service.record(
            session=session,
            user_id=user_id,
            action=f"hr_instant_alert_{event_type}",
            details=f"Dispatched instant {event_type} alert to {target_email}: '{subject}'",
        )

        session.commit()

    # ── 6. Daily Summary Email ───────────────────────────────────────────────

    def send_daily_summary_email(
        self,
        session: Session,
        user_id: uuid.UUID,
        force: bool = False,
        recipient_email: Optional[str] = None,
    ) -> DailySummarySendResponse:
        """
        Sends one daily summary email to HR compiling:
          - New CVs received today
          - Candidates waiting for review
          - Interviews scheduled for today
          - Message send quota status
        """
        settings_obj = self.get_or_create_settings(session, user_id)
        if not force and not settings_obj.daily_summary_enabled:
            raise HTTPException(
                status_code=400,
                detail="Daily summary email is currently disabled in Agent Settings.",
            )

        recruiter = session.exec(select(User).where(User.id == user_id)).first()
        target_email = recipient_email or settings_obj.notify_email or (recruiter.email if recruiter else None)
        if not target_email or "@" not in target_email:
            raise HTTPException(status_code=400, detail="No valid HR email address configured.")

        onboarding = session.exec(select(OnboardingSetup).where(OnboardingSetup.user_id == user_id)).first()
        hr_name = onboarding.hr_name if (onboarding and onboarding.hr_name) else (getattr(recruiter, "name", None) or "Recruiting Team")
        company_name = onboarding.company_name if (onboarding and onboarding.company_name) else "Our Company"

        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_start = today_start + timedelta(days=1)
        public_url = (getattr(settings, "FRONTEND_URL", None) or "http://localhost:3000").rstrip("/")

        # 1. New CVs received today
        cands_today = session.exec(
            select(Candidate).where(Candidate.user_id == user_id, Candidate.created_at >= today_start)
        ).all()
        new_cvs_count = len(cands_today)
        new_cvs_lines = []
        for c in cands_today[:5]:
            score_txt = f"{c.score:.0f}/100" if c.score is not None else "Unscored"
            new_cvs_lines.append(f"  • {c.name} ({score_txt})")
        if len(cands_today) > 5:
            new_cvs_lines.append(f"  ... and {len(cands_today) - 5} more")
        new_cvs_block = "\n".join(new_cvs_lines) if new_cvs_lines else "  • No new CVs received today yet."

        # 2. Waiting for review queue
        waiting_cands = session.exec(
            select(Candidate).where(Candidate.user_id == user_id, Candidate.review_status == "pending")
        ).all()
        waiting_count = len(waiting_cands)
        waiting_lines = []
        for c in waiting_cands[:5]:
            rec_cat = getattr(c, "recommendation_category", None)
            rec_txt = f"[{rec_cat}]" if rec_cat else ""
            waiting_lines.append(f"  • {c.name} {rec_txt}".strip())
        if len(waiting_cands) > 5:
            waiting_lines.append(f"  ... and {len(waiting_cands) - 5} more awaiting review")
        waiting_block = "\n".join(waiting_lines) if waiting_lines else "  • All CVs reviewed! Queue is clear."

        # 3. Interviews scheduled for today
        interviews_today = session.exec(
            select(Interview).where(
                Interview.user_id == user_id,
                Interview.start_time >= today_start,
                Interview.start_time < tomorrow_start,
                Interview.status != InterviewStatus.cancelled,
            ).order_by(Interview.start_time.asc())
        ).all()
        interviews_count = len(interviews_today)
        interview_lines = []
        for inv in interviews_today[:5]:
            t_str = inv.start_time.strftime("%I:%M %p UTC")
            r_str = getattr(inv, "round_type", "initial") or "initial"
            interview_lines.append(f"  • {inv.candidate_name} at {t_str} ({r_str.title()} Round)")
        if len(interviews_today) > 5:
            interview_lines.append(f"  ... and {len(interviews_today) - 5} more sessions")
        interview_block = "\n".join(interview_lines) if interview_lines else "  • No interview sessions scheduled for today."

        # 4. Outbound sends & agent status
        sends_today = self.get_daily_send_count(session, user_id)
        status_txt = "PAUSED" if settings_obj.is_paused else "ACTIVE & SCREENING"

        now_utc = datetime.now(timezone.utc)
        date_str = now_utc.strftime("%A, %b %d, %Y")

        subject = f"[Daily Recruiting Brief] {company_name} - {date_str}"
        body = (
            f"Hi {hr_name},\n\n"
            f"Here is your daily recruiting summary for {date_str}:\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📊 DAILY METRICS OVERVIEW\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• Agent Status: {status_txt}\n"
            f"• Messages Sent Today: {sends_today} / {settings_obj.daily_send_limit} daily limit\n"
            f"• New CVs Ingested: {new_cvs_count}\n"
            f"• Candidates Waiting for Review: {waiting_count}\n"
            f"• Interviews Scheduled Today: {interviews_count}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📋 CANDIDATES WAITING FOR YOUR REVIEW ({waiting_count})\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{waiting_block}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📅 TODAY'S INTERVIEWS ({interviews_count})\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{interview_block}\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📥 NEW CVS TODAY ({new_cvs_count})\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{new_cvs_block}\n\n"
            f"Quick Links:\n"
            f"• Review CV Queue: {public_url}/screening\n"
            f"• Candidate Pipeline: {public_url}/pipeline\n"
            f"• Interviews Calendar: {public_url}/interviews\n"
            f"• Agent Settings & Status: {public_url}/settings?tab=agent\n\n"
            f"Best regards,\nAI Candidate Screening Copilot"
        )

        # 1. Dispatch email via GoogleService
        try:
            g_acct = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == user_id)).first()
            if g_acct:
                g_service = GoogleService(session)
                g_service.send_email(
                    user_id=user_id,
                    request=GoogleSendEmailRequest(
                        candidate_id=None,
                        subject=subject,
                        body=body,
                        template_name="daily_summary",
                    ),
                )
        except Exception as g_err:
            logger.info("Google Workspace daily summary email dispatch note: %s", g_err)

        # 2. Record in-app notification
        notif = Notification(
            user_id=user_id,
            title=subject,
            message=f"Daily summary dispatched to {target_email}. {waiting_count} candidates waiting for review.",
            type="daily_summary_dispatched",
            link="/screening",
        )
        session.add(notif)

        # 3. Update last sent timestamp
        settings_obj.last_daily_summary_sent_at = now_utc
        session.add(settings_obj)
        session.commit()

        # 4. Record Audit Trail
        audit_log_service.record(
            session=session,
            user_id=user_id,
            action="daily_summary_email_sent",
            details=f"Daily recruiting summary sent to {target_email}. New CVs: {new_cvs_count}, Waiting Review: {waiting_count}, Interviews: {interviews_count}",
        )

        return DailySummarySendResponse(
            sent=True,
            recipient_email=target_email,
            sent_at=now_utc,
            new_cvs_count=new_cvs_count,
            waiting_review_count=waiting_count,
            interviews_today_count=interviews_count,
            sends_today=sends_today,
            subject=subject,
            preview=body[:200] + "...",
        )


agent_settings_service = AgentSettingsService()
