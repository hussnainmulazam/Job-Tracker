"""
test_agent_settings.py
~~~~~~~~~~~~~~~~~~~~~~
Integration and functional tests for Agent Settings, Autonomous Controls & Daily Summaries:
1. Get default agent settings (auto-creates if none exists).
2. Update agent configuration (daily send limit, notification toggles, summary time).
3. Pause Agent and Resume Agent with reason and audit log tracking.
4. Daily send quota calculation & enforcement:
   - When daily send limit is reached -> sends blocked.
   - When agent is paused -> sends blocked.
5. Immediate HR alerts by email/notification:
   - When candidate books interview -> instant notification to HR.
   - When candidate replies -> instant notification to HR.
   - When processing/transmission fails -> instant notification to HR.
6. Daily summary email:
   - Compiles CVs received today, candidates waiting review, and interviews scheduled today.
   - Dispatches summary and records in audit trail.
7. What the agent did today activity feed & KPI counters.
"""
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.agent_settings import AgentSettings
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate, CandidateStage
from app.models.job_opening import JobOpening
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.models.notification import Notification
from app.models.interview import Interview, InterviewStatus
from app.services.agent_settings_service import agent_settings_service


def test_get_or_create_default_agent_settings(client: TestClient, user_a: dict, session: Session):
    """Verifies that GET /api/v1/agent/settings creates and returns sensible defaults."""
    res = client.get("/api/v1/agent/settings", headers=user_a["headers"])
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["is_paused"] is False
    assert data["daily_send_limit"] == 50
    assert data["sends_today"] == 0
    assert data["sends_remaining"] == 50
    assert data["notify_on_booking"] is True
    assert data["notify_on_reply"] is True
    assert data["notify_on_failure"] is True
    assert data["daily_summary_enabled"] is True
    assert data["daily_summary_time"] == "09:00"


def test_update_agent_settings(client: TestClient, user_a: dict, session: Session):
    """Verifies updating daily quota, alert recipient, and notification toggles."""
    res = client.put(
        "/api/v1/agent/settings",
        json={
            "daily_send_limit": 100,
            "notify_email": "recruiter.lead@example.com",
            "notify_on_booking": True,
            "notify_on_reply": False,
            "notify_on_failure": True,
            "daily_summary_enabled": True,
            "daily_summary_time": "08:30",
        },
        headers=user_a["headers"],
    )
    assert res.status_code == 200, res.text
    updated = res.json()

    assert updated["daily_send_limit"] == 100
    assert updated["notify_email"] == "recruiter.lead@example.com"
    assert updated["notify_on_reply"] is False
    assert updated["daily_summary_time"] == "08:30"

    # Verify audit log recorded
    logs = session.exec(
        select(AuditLog).where(AuditLog.user_id == uuid.UUID(user_a["user"]["id"]))
    ).all()
    setting_logs = [l for l in logs if l.action == "agent_settings_updated"]
    assert len(setting_logs) >= 1
    assert "daily_send_limit=100" in setting_logs[-1].details


def test_pause_and_resume_agent(client: TestClient, user_a: dict, session: Session):
    """Verifies Pause Agent button toggle and resume action with audit trail."""
    user_id = uuid.UUID(user_a["user"]["id"])

    # 1. Pause Agent
    res_pause = client.post(
        "/api/v1/agent/pause",
        json={"paused": True, "reason": "Updating interview guidelines for Q4"},
        headers=user_a["headers"],
    )
    assert res_pause.status_code == 200, res_pause.text
    data_pause = res_pause.json()
    assert data_pause["is_paused"] is True
    assert data_pause["paused_reason"] == "Updating interview guidelines for Q4"

    # Verify check_can_send blocks sending
    can_send, reason = agent_settings_service.check_can_send(session, user_id)
    assert can_send is False
    assert "paused" in reason.lower()

    # 2. Resume Agent
    res_resume = client.post(
        "/api/v1/agent/pause",
        json={"paused": False},
        headers=user_a["headers"],
    )
    assert res_resume.status_code == 200, res_resume.text
    data_resume = res_resume.json()
    assert data_resume["is_paused"] is False
    assert data_resume["paused_reason"] is None

    # Verify can send is now True
    can_send, reason = agent_settings_service.check_can_send(session, user_id)
    assert can_send is True

    # Verify audit trail logs for pause and resume
    logs = session.exec(
        select(AuditLog).where(AuditLog.user_id == user_id).order_by(AuditLog.created_at.desc())
    ).all()
    actions = [l.action for l in logs]
    assert "agent_paused" in actions
    assert "agent_resumed" in actions


def test_daily_send_limit_enforcement(client: TestClient, user_a: dict, session: Session):
    """Verifies that exceeding the daily send quota blocks further messages."""
    user_id = uuid.UUID(user_a["user"]["id"])

    # Set daily limit to 2
    client.put(
        "/api/v1/agent/settings",
        json={"daily_send_limit": 2},
        headers=user_a["headers"],
    )

    # Dispatch 2 messages today
    now = datetime.now(timezone.utc)
    for i in range(2):
        msg = Message(
            user_id=user_id,
            candidate_id=uuid.uuid4(),
            direction=MessageDirection.outbound,
            message_type=MessageType.email,
            body=f"Test message {i}",
            status=MessageStatus.sent,
            sent_at=now,
        )
        session.add(msg)
    session.commit()

    # Check quota usage
    count = agent_settings_service.get_daily_send_count(session, user_id)
    assert count == 2

    # Check can send
    can_send, reason = agent_settings_service.check_can_send(session, user_id)
    assert can_send is False
    assert "Daily message send limit reached" in reason

    # Check activity endpoint reflects quota
    res = client.get("/api/v1/agent/today-activity", headers=user_a["headers"])
    assert res.status_code == 200
    activity = res.json()
    assert activity["sends_today"] == 2
    assert activity["sends_remaining"] == 0


def test_notify_hr_instant_booking(session: Session, user_a: dict):
    """Verifies instant notification when a candidate books a slot."""
    user_id = uuid.UUID(user_a["user"]["id"])

    agent_settings_service.notify_hr_instant(
        session=session,
        user_id=user_id,
        event_type="booking",
        candidate_name="Sarah Connor",
        opening_title="Security Lead",
        details="Booked slot for Initial Interview on Friday at 2:00 PM UTC.",
    )

    # Verify notification created
    notifs = session.exec(
        select(Notification).where(Notification.user_id == user_id)
    ).all()
    booking_notifs = [n for n in notifs if "Sarah Connor" in n.title or "Sarah Connor" in n.message]
    assert len(booking_notifs) >= 1
    assert "Booked" in booking_notifs[0].title or "Scheduled" in booking_notifs[0].title

    # Verify audit log
    logs = session.exec(
        select(AuditLog).where(AuditLog.user_id == user_id, AuditLog.action == "hr_instant_alert_booking")
    ).all()
    assert len(logs) >= 1
    assert "booking" in logs[-1].details.lower()


def test_notify_hr_instant_reply(session: Session, user_a: dict):
    """Verifies instant notification when a candidate replies to email."""
    user_id = uuid.UUID(user_a["user"]["id"])

    agent_settings_service.notify_hr_instant(
        session=session,
        user_id=user_id,
        event_type="reply",
        candidate_name="David Bowman",
        opening_title="Autonomous Systems Engineer",
        details="Subject: Re: Next Steps\n\nI am eager to meet with the team!",
    )

    notifs = session.exec(
        select(Notification).where(Notification.user_id == user_id)
    ).all()
    reply_notifs = [n for n in notifs if "David Bowman" in n.title or "David Bowman" in n.message]
    assert len(reply_notifs) >= 1
    assert "Reply" in reply_notifs[0].title

    logs = session.exec(
        select(AuditLog).where(AuditLog.user_id == user_id, AuditLog.action == "hr_instant_alert_reply")
    ).all()
    assert len(logs) >= 1


def test_notify_hr_instant_failure(client: TestClient, user_a: dict, session: Session):
    """Verifies instant alert when something fails, including test endpoint."""
    user_id = uuid.UUID(user_a["user"]["id"])

    # 1. Direct service call
    agent_settings_service.notify_hr_instant(
        session=session,
        user_id=user_id,
        event_type="failure",
        candidate_name="Grace Hopper",
        details="SMTP connection timeout while sending offer letter.",
    )

    notifs = session.exec(
        select(Notification).where(Notification.user_id == user_id)
    ).all()
    fail_notifs = [n for n in notifs if "Failure" in n.title or "Error" in n.title]
    assert len(fail_notifs) >= 1

    # 2. Test failure endpoint
    res = client.post("/api/v1/agent/test-failure-alert", headers=user_a["headers"])
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_send_daily_summary_email(client: TestClient, user_a: dict, session: Session):
    """Verifies daily summary compiles new CVs, waiting review, and today's interviews."""
    user_id = uuid.UUID(user_a["user"]["id"])

    # 1. Create opening
    op = JobOpening(
        user_id=user_id,
        title="Senior Backend Engineer",
        description="Build robust microservices",
        required_skills=["Python", "PostgreSQL"],
    )
    session.add(op)
    session.commit()
    session.refresh(op)

    # 2. Add candidates (one applied/waiting review)
    cand = Candidate(
        user_id=user_id,
        opening_id=op.id,
        name="Jordan Lee",
        email="jordan.lee@example.com",
        cv_text="Extensive Python microservice backend engineering experience.",
        stage=CandidateStage.applied,
        review_status="pending",
    )
    session.add(cand)
    session.commit()

    # 3. Add interview scheduled today
    now = datetime.now(timezone.utc)
    interview = Interview(
        user_id=user_id,
        candidate_id=cand.id,
        opening_id=op.id,
        title="Technical Round 1",
        candidate_name=cand.name,
        candidate_email=cand.email,
        interviewer_email="recruiter@example.com",
        round_type="initial",
        status=InterviewStatus.scheduled,
        start_time=now + timedelta(hours=2),
        end_time=now + timedelta(hours=2, minutes=30),
    )
    session.add(interview)
    session.commit()

    # 4. Trigger Daily Summary
    res = client.post(
        "/api/v1/agent/send-daily-summary",
        json={"force": True},
        headers=user_a["headers"],
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["sent"] is True
    assert data["waiting_review_count"] >= 1
    assert data["interviews_today_count"] >= 1
    assert "daily recruiting summary" in data["preview"].lower()

    # Verify audit log
    logs = session.exec(
        select(AuditLog).where(AuditLog.user_id == user_id, AuditLog.action == "daily_summary_email_sent")
    ).all()
    assert len(logs) >= 1


def test_today_activity_feed_and_kpis(client: TestClient, user_a: dict, session: Session):
    """Verifies live activity feed returns correct KPIs and chronological items."""
    user_id = uuid.UUID(user_a["user"]["id"])

    # Record some actions
    from app.services.audit_log_service import audit_log_service
    audit_log_service.record(
        session=session,
        user_id=user_id,
        action="cv_review_approved",
        details="Approved candidate Maya Lin for Frontend Lead role.",
    )
    audit_log_service.record(
        session=session,
        user_id=user_id,
        action="interview_scheduled",
        details="Interview booked with Ken Thompson for 3:00 PM.",
    )

    res = client.get("/api/v1/agent/today-activity", headers=user_a["headers"])
    assert res.status_code == 200, res.text
    activity = res.json()

    assert "cvs_ingested_today" in activity
    assert "interviews_today" in activity
    assert "activity_feed" in activity
    assert len(activity["activity_feed"]) >= 2

    # Check categories
    categories = [item["category"] for item in activity["activity_feed"]]
    assert "screening" in categories or "cv_review" in categories
    assert "interview" in categories


def test_cv_review_blocked_when_agent_paused(client: TestClient, user_a: dict, session: Session):
    """Verifies that CV review decisions are blocked when the agent is paused."""
    # 1. Create opening & candidate
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "ML Engineer", "description": "PyTorch deep learning models"},
        headers=user_a["headers"],
    )
    op = op_res.json()

    cand_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Nadia Thorne",
            "email": "nadia.thorne@example.com",
            "cv_text": "Experienced machine learning engineer specializing in NLP.",
        },
        headers=user_a["headers"],
    )
    cand = cand_res.json()

    # 2. Pause agent
    client.post(
        "/api/v1/agent/pause",
        json={"paused": True, "reason": "System freeze for compliance audit"},
        headers=user_a["headers"],
    )

    # 3. Try to approve candidate
    review_res = client.post(
        "/api/v1/cv-review/decision",
        json={"candidate_ids": [cand["id"]], "action": "approve"},
        headers=user_a["headers"],
    )
    assert review_res.status_code == 400
    assert "paused" in review_res.json()["detail"].lower()

    # 4. Resume agent and retry
    client.post(
        "/api/v1/agent/pause",
        json={"paused": False},
        headers=user_a["headers"],
    )
    review_res2 = client.post(
        "/api/v1/cv-review/decision",
        json={"candidate_ids": [cand["id"]], "action": "approve"},
        headers=user_a["headers"],
    )
    assert review_res2.status_code == 200
    assert review_res2.json()["approved_count"] == 1
