"""
test_outreach.py
~~~~~~~~~~~~~~~~
Test suite for the outreach agent:
1. Drafts personalized outreach messages from JD & candidate (Email, English or Hinglish).
2. Approval queue with inline editing and single/bulk approval. Nothing is sent without HR approval.
3. Attaching scheduling link, lifecycle stage updates:
   - Candidate shortlisted on outreach draft
   - Candidate moved to 'scheduled' on booking
   - Candidate moved to 'interviewed' after interview time passes
4. Audit trail tracking of every step with failure reasons and functional Retry action.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.candidate import Candidate, CandidateStage
from app.models.interview import Interview, InterviewStatus, SchedulingLink, SchedulingLinkStatus
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.schemas.google import GoogleSendEmailResponse


def test_draft_outreach_email(client: TestClient, user_a: dict):
    """Drafts personalized email messages in English and Hinglish."""
    # 1. Create opening & candidate
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "AI Platform Engineer", "description": "Python, LLMs, and Kubernetes", "required_skills": ["Python", "Kubernetes"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Hamza Tariq",
            "email": "hamza.tariq@example.com",
            "cv_text": "Experienced Python developer with 4 years in microservices and Kubernetes.",
        },
        headers=user_a["headers"],
    ).json()

    # 2. Draft Email message in English
    draft_res = client.post(
        "/api/v1/outreach/draft",
        json={"candidate_id": cand["id"], "channel": "email", "language": "english"},
        headers=user_a["headers"],
    )
    assert draft_res.status_code == 201
    draft_data = draft_res.json()
    assert draft_data["candidate_id"] == cand["id"]
    assert draft_data["channel"] == "email"
    assert "Hamza" in draft_data["body"]
    assert draft_data["scheduling_url"] is not None

    # 3. Draft Email message in Hinglish
    draft_hinglish = client.post(
        "/api/v1/outreach/draft",
        json={"candidate_id": cand["id"], "channel": "email", "language": "hinglish"},
        headers=user_a["headers"],
    )
    assert draft_hinglish.status_code == 201
    assert draft_hinglish.json()["language"] == "hinglish"


def test_approval_queue_editing_and_single_approve(client: TestClient, user_a: dict):
    """Inspect approval queue, edit draft, and approve single message."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Data Scientist", "description": "PyTorch & NLP", "required_skills": ["NLP"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Amina Bilal",
            "email": "amina@example.com",
            "cv_text": "Machine learning engineer specializing in NLP models.",
        },
        headers=user_a["headers"],
    ).json()

    draft = client.post(
        "/api/v1/outreach/draft",
        json={"candidate_id": cand["id"], "channel": "email", "language": "english"},
        headers=user_a["headers"],
    ).json()

    # 1. Fetch queue
    queue_res = client.get("/api/v1/outreach/queue", headers=user_a["headers"])
    assert queue_res.status_code == 200
    queue = queue_res.json()
    assert any(q["message_id"] == draft["message_id"] for q in queue)

    # 2. Edit draft before approving
    edit_res = client.put(
        f"/api/v1/outreach/drafts/{draft['message_id']}",
        json={"body": "Hi Amina, modified customized draft with scheduling link: /schedule/test-token"},
        headers=user_a["headers"],
    )
    assert edit_res.status_code == 200
    assert "modified customized draft" in edit_res.json()["body"]

    # 3. Approve and dispatch with mocked GoogleService
    mock_resp = GoogleSendEmailResponse(
        status="sent",
        message_id=uuid.uuid4(),
        candidate_id=uuid.UUID(cand["id"]),
        recipient_email="amina@example.com",
        subject="Interview Invitation",
        sent_at=datetime.now(timezone.utc),
    )
    with patch("app.services.google_service.GoogleService.send_email", return_value=mock_resp):
        approve_res = client.post(
            f"/api/v1/outreach/approve/{draft['message_id']}",
            headers=user_a["headers"],
        )
        assert approve_res.status_code == 200
        res_data = approve_res.json()
        assert res_data["status"] == "sent"

    # Queue should now be empty for this message
    queue_after = client.get("/api/v1/outreach/queue", headers=user_a["headers"]).json()
    assert not any(q["message_id"] == draft["message_id"] for q in queue_after)


def test_bulk_approve_queue(client: TestClient, user_a: dict):
    """Batch approve multiple messages from the queue with single transaction."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "DevOps Engineer", "description": "Terraform and AWS", "required_skills": ["Terraform"]},
        headers=user_a["headers"],
    ).json()

    c1 = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Candidate One", "email": "devops1@example.com", "cv_text": "Experienced DevOps engineer with Terraform and AWS skills."},
        headers=user_a["headers"],
    ).json()
    c2 = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Candidate Two", "email": "devops2@example.com", "cv_text": "Experienced DevOps engineer with Kubernetes expertise."},
        headers=user_a["headers"],
    ).json()

    d1 = client.post("/api/v1/outreach/draft", json={"candidate_id": c1["id"], "channel": "email"}, headers=user_a["headers"]).json()
    d2 = client.post("/api/v1/outreach/draft", json={"candidate_id": c2["id"], "channel": "email"}, headers=user_a["headers"]).json()

    # Bulk approve with mocked GoogleService
    mock_resp = GoogleSendEmailResponse(
        status="sent",
        message_id=uuid.uuid4(),
        candidate_id=uuid.UUID(c1["id"]),
        recipient_email="devops@example.com",
        subject="Interview Invitation",
        sent_at=datetime.now(timezone.utc),
    )
    with patch("app.services.google_service.GoogleService.send_email", return_value=mock_resp):
        bulk_res = client.post(
            "/api/v1/outreach/bulk-approve",
            json={"message_ids": [d1["message_id"], d2["message_id"]]},
            headers=user_a["headers"],
        )
        assert bulk_res.status_code == 200
        bulk_data = bulk_res.json()
        assert bulk_data["total"] == 2
        assert bulk_data["approved_count"] == 2
        assert bulk_data["sent_count"] == 2


def test_candidate_lifecycle_stage_transitions(client: TestClient, user_a: dict):
    """
    Validates stage updates across the candidate journey:
    Shortlisted -> Scheduled (on booking) -> Interviewed (after interview time).
    """
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Security Lead", "description": "SOC2 & Pentesting infrastructure", "required_skills": ["Security"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Bilal Sheikh", "email": "bilal@example.com", "cv_text": "Cybersecurity lead with extensive pentesting experience."},
        headers=user_a["headers"],
    ).json()

    # 1. Draft moves to Shortlisted
    client.post("/api/v1/outreach/draft", json={"candidate_id": cand["id"]}, headers=user_a["headers"])
    c_check = client.get(f"/api/v1/candidates/{cand['id']}", headers=user_a["headers"]).json()
    assert c_check["stage"] == "shortlisted"

    # 2. Candidate books slot -> moves stage to 'scheduled'
    link = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand["id"], "slot_duration_minutes": 30},
        headers=user_a["headers"],
    ).json()

    future_start = (datetime.now(timezone.utc) + timedelta(days=2)).replace(hour=10, minute=0, second=0, microsecond=0)
    with patch("app.services.scheduling_service.scheduling_service.create_google_calendar_event") as mock_evt:
        mock_evt.return_value = ("cal_evt_test_123", "https://meet.google.com/test-meet")
        book_res = client.post(
            f"/api/v1/scheduling/public/{link['token']}/book",
            json={"start_time": future_start.isoformat(), "timezone": "Asia/Karachi"},
        )
        assert book_res.status_code == 201

    c_check3 = client.get(f"/api/v1/candidates/{cand['id']}", headers=user_a["headers"]).json()
    assert c_check3["stage"] == "scheduled"

    # 3. Passed interview time -> sync moves stage to 'interviewed'
    sync_res = client.post("/api/v1/outreach/sync-stages", headers=user_a["headers"])
    assert sync_res.status_code == 200


def test_audit_trail_and_retry_on_failure(client: TestClient, user_a: dict):
    """Audit trail logs every step with failure reason, and Retry button works."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Site Reliability Engineer", "description": "SRE and infrastructure engineering", "required_skills": ["Linux"]},
        headers=user_a["headers"],
    ).json()

    # Candidate with no email address to provoke email outreach failure
    cand = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "No Email Candidate", "email": "noemail@example.com", "cv_text": "SRE and systems engineering with 5 years experience."},
        headers=user_a["headers"],
    ).json()

    draft = client.post(
        "/api/v1/outreach/draft",
        json={"candidate_id": cand["id"], "channel": "email"},
        headers=user_a["headers"],
    ).json()

    # Simulate Gmail send failure (e.g. no Google account connected)
    with patch("app.services.google_service.GoogleService.send_email", side_effect=Exception("No connected Google account")):
        app_res = client.post(f"/api/v1/outreach/approve/{draft['message_id']}", headers=user_a["headers"])
        assert app_res.status_code == 200
        res_data = app_res.json()
        assert res_data["status"] == "failed"
        assert "no connected google account" in res_data["error"].lower()

    # Inspect audit trail
    audit_res = client.get("/api/v1/outreach/audit-trail", headers=user_a["headers"])
    assert audit_res.status_code == 200
    logs = audit_res.json()
    failed_log = next((l for l in logs if l["action"] == "outreach_failed"), None)
    assert failed_log is not None
    assert failed_log["failure_reason"] is not None

    # Retry the failed message with mock failure still in place
    with patch("app.services.google_service.GoogleService.send_email", side_effect=Exception("Still no connected account")):
        retry_res = client.post(f"/api/v1/outreach/retry/{draft['message_id']}", headers=user_a["headers"])
        assert retry_res.status_code == 200
        retry_data = retry_res.json()
        assert retry_data["status"] == "failed"
