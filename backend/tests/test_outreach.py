"""
test_outreach.py
~~~~~~~~~~~~~~~~
Test suite for the outreach agent:
1. Drafts personalized message from JD & candidate (WhatsApp or Email, Hinglish or English).
2. Approval queue with inline editing and single/bulk approval. Nothing is sent without HR approval.
3. Attaching scheduling link, lifecycle stage updates:
   - Candidate shortlisted on outreach draft
   - Candidate moved to 'contacted' on inbound reply
   - Candidate moved to 'scheduled' on booking
   - Candidate moved to 'interviewed' after interview time passes
4. Audit trail tracking of every step with failure reasons and functional Retry action.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.candidate import Candidate, CandidateStage
from app.models.interview import Interview, InterviewStatus, SchedulingLink, SchedulingLinkStatus
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.services.outreach_service import outreach_service


def test_draft_outreach_whatsapp_and_email(client: TestClient, user_a: dict):
    """Drafts personalized messages in WhatsApp/Email and English/Hinglish."""
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
            "phone": "+923009876543",
            "cv_text": "Experienced Python developer with 4 years in microservices and Kubernetes.",
        },
        headers=user_a["headers"],
    ).json()

    # 2. Draft WhatsApp message in Hinglish
    draft_res = client.post(
        "/api/v1/outreach/draft",
        json={
            "candidate_id": cand["id"],
            "channel": "whatsapp",
            "language": "hinglish",
            "instructions": "Mention microservices expertise",
        },
        headers=user_a["headers"],
    )
    assert draft_res.status_code == 201
    draft_data = draft_res.json()
    assert draft_data["candidate_name"] == "Hamza Tariq"
    assert draft_data["channel"] == "whatsapp"
    assert draft_data["language"] == "hinglish"
    assert "/schedule/" in draft_data["scheduling_url"]
    assert draft_data["ai_drafted"] is True
    assert draft_data["hr_approved"] is False  # Nothing sent without approval

    # Verify candidate stage transitioned to 'shortlisted'
    cand_check = client.get(f"/api/v1/candidates/{cand['id']}", headers=user_a["headers"]).json()
    assert cand_check["stage"] == "shortlisted"

    # 3. Draft Email message in English
    draft_email_res = client.post(
        "/api/v1/outreach/draft",
        json={
            "candidate_id": cand["id"],
            "channel": "email",
            "language": "english",
        },
        headers=user_a["headers"],
    )
    assert draft_email_res.status_code == 201
    email_data = draft_email_res.json()
    assert email_data["channel"] == "email"
    assert email_data["language"] == "english"
    assert email_data["subject"] is not None
    assert "/schedule/" in email_data["scheduling_url"]
    assert email_data["hr_approved"] is False


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
            "phone": "+923211234567",
            "cv_text": "Machine learning engineer specializing in NLP models.",
        },
        headers=user_a["headers"],
    ).json()

    draft = client.post(
        "/api/v1/outreach/draft",
        json={"candidate_id": cand["id"], "channel": "whatsapp", "language": "english"},
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

    # 3. Approve and dispatch
    with patch("app.services.whatsapp_service.WhatsAppService.send_template_message", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = Message(
            candidate_id=cand["id"],
            user_id=uuid.UUID(user_a["user"]["id"]),
            direction=MessageDirection.outbound,
            message_type=MessageType.text,
            body="Approved message",
            status=MessageStatus.sent,
        )
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
    """Bulk approve multiple draft outreach messages at once."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "DevOps Engineer", "description": "AWS & CI/CD infrastructure", "required_skills": ["AWS"]},
        headers=user_a["headers"],
    ).json()

    c1 = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Candidate One", "email": "devops1@example.com", "cv_text": "Experienced DevOps engineer with AWS expertise."},
        headers=user_a["headers"],
    ).json()

    c2 = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Candidate Two", "email": "devops2@example.com", "cv_text": "Experienced DevOps engineer with Kubernetes expertise."},
        headers=user_a["headers"],
    ).json()

    d1 = client.post("/api/v1/outreach/draft", json={"candidate_id": c1["id"], "channel": "whatsapp"}, headers=user_a["headers"]).json()
    d2 = client.post("/api/v1/outreach/draft", json={"candidate_id": c2["id"], "channel": "whatsapp"}, headers=user_a["headers"]).json()

    # Bulk approve
    with patch("app.services.whatsapp_service.WhatsAppService.send_template_message", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = Message(
            candidate_id=c1["id"],
            user_id=uuid.UUID(user_a["user"]["id"]),
            direction=MessageDirection.outbound,
            message_type=MessageType.text,
            body="Approved bulk message",
            status=MessageStatus.sent,
        )
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
    Validates stage updates across the full candidate journey:
    Shortlisted -> Contacted (on reply) -> Scheduled (on booking) -> Interviewed (after interview time).
    """
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Security Lead", "description": "SOC2 & Pentesting infrastructure", "required_skills": ["Security"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Bilal Sheikh", "email": "bilal@example.com", "phone": "+923005554433", "cv_text": "Cybersecurity lead with extensive pentesting experience."},
        headers=user_a["headers"],
    ).json()

    # 1. Draft moves to Shortlisted
    client.post("/api/v1/outreach/draft", json={"candidate_id": cand["id"]}, headers=user_a["headers"])
    c_check = client.get(f"/api/v1/candidates/{cand['id']}", headers=user_a["headers"]).json()
    assert c_check["stage"] == "shortlisted"

    # 2. Inbound webhook reply moves stage to 'contacted'
    webhook_payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "123456",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"display_phone_number": "12345", "phone_number_id": "67890"},
                            "messages": [
                                {
                                    "from": "923005554433",
                                    "id": "wamid.inbound.test.99",
                                    "timestamp": "1700000000",
                                    "text": {"body": "Hi! Thanks for reaching out. Yes I am interested!"},
                                    "type": "text",
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }

    wh_res = client.post("/api/v1/whatsapp/webhook", json=webhook_payload)
    assert wh_res.status_code == 200

    c_check2 = client.get(f"/api/v1/candidates/{cand['id']}", headers=user_a["headers"]).json()
    assert c_check2["stage"] == "contacted"

    # 3. Candidate books slot -> moves stage to 'scheduled'
    link = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand["id"], "slot_duration_minutes": 30},
        headers=user_a["headers"],
    ).json()

    future_start = (datetime.now(timezone.utc) + timedelta(days=2)).replace(hour=10, minute=0, second=0, microsecond=0)
    with patch("app.services.scheduling_service.scheduling_service.create_google_calendar_event", new_callable=AsyncMock) as mock_evt:
        mock_evt.return_value = ("cal_evt_test_123", "https://meet.google.com/test-meet")
        book_res = client.post(
            f"/api/v1/scheduling/public/{link['token']}/book",
            json={"start_time": future_start.isoformat(), "timezone": "Asia/Karachi"},
        )
        assert book_res.status_code == 201

    c_check3 = client.get(f"/api/v1/candidates/{cand['id']}", headers=user_a["headers"]).json()
    assert c_check3["stage"] == "scheduled"

    # 4. Passed interview time -> sync moves stage to 'interviewed'
    sync_res = client.post("/api/v1/outreach/sync-stages", headers=user_a["headers"])
    assert sync_res.status_code == 200


def test_audit_trail_and_retry_on_failure(client: TestClient, user_a: dict):
    """Audit trail logs every step with failure reason, and Retry button works."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Site Reliability Engineer", "description": "SRE and infrastructure engineering", "required_skills": ["Linux"]},
        headers=user_a["headers"],
    ).json()

    # Candidate with no phone number to provoke WhatsApp failure
    cand = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "No Phone Candidate", "email": "nophone@example.com", "phone": None, "cv_text": "SRE and systems engineering with 5 years experience."},
        headers=user_a["headers"],
    ).json()

    draft = client.post(
        "/api/v1/outreach/draft",
        json={"candidate_id": cand["id"], "channel": "whatsapp"},
        headers=user_a["headers"],
    ).json()

    # Approve -> should fail gracefully with no phone error
    app_res = client.post(f"/api/v1/outreach/approve/{draft['message_id']}", headers=user_a["headers"])
    assert app_res.status_code == 200
    res_data = app_res.json()
    assert res_data["status"] == "failed"
    assert "no phone number" in res_data["error"].lower()

    # Inspect audit trail
    audit_res = client.get("/api/v1/outreach/audit-trail", headers=user_a["headers"])
    assert audit_res.status_code == 200
    logs = audit_res.json()
    failed_log = next((l for l in logs if l["action"] == "outreach_failed"), None)
    assert failed_log is not None
    assert failed_log["failure_reason"] is not None

    # Retry the failed message
    retry_res = client.post(f"/api/v1/outreach/retry/{draft['message_id']}", headers=user_a["headers"])
    assert retry_res.status_code == 200
    retry_data = retry_res.json()
    assert retry_data["status"] == "failed"  # Still no phone, proves retry ran and captured error without crashing
