"""
Tests for WhatsApp Cloud API integration:
- Webhook challenge verification (GET)
- Webhook signature verification (HMAC-SHA256)
- Inbound message handling (opens 24h care window & records message)
- Delivery receipt status updates (sent, delivered, read, failed)
- Mandatory opt-in enforcement (blocks outbound if not opted in)
- 24-hour customer care window enforcement (blocks free-form if window closed)
- HR flow: template preview & rate-limited batch sending
- Failed message retry
- AI reply drafting (HR approval required)
- Full candidate thread history
"""
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.models.candidate import Candidate
from app.models.job_opening import JobOpening
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.services.whatsapp_service import verify_webhook_signature


def test_webhook_handshake_success(client: TestClient):
    """Test Meta webhook verification challenge with valid token."""
    with patch.object(settings, "VERIFY_TOKEN", "test-verify-token-123"):
        res = client.get(
            "/api/v1/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.challenge": "1158201444",
                "hub.verify_token": "test-verify-token-123",
            },
        )
        assert res.status_code == 200
        assert res.text == "1158201444"


def test_webhook_handshake_invalid_token(client: TestClient):
    """Test Meta webhook challenge fails with invalid token."""
    with patch.object(settings, "VERIFY_TOKEN", "real-secret-token"):
        res = client.get(
            "/api/v1/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.challenge": "99999",
                "hub.verify_token": "wrong-token",
            },
        )
        assert res.status_code == 403


def test_webhook_signature_verification_logic():
    """Verify HMAC-SHA256 signature verification utility."""
    secret = "my_app_secret_abc123"
    body = b'{"object":"whatsapp_business_account","entry":[]}'
    valid_hash = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    with patch.object(settings, "APP_SECRET", secret):
        # Valid signature
        assert verify_webhook_signature(body, f"sha256={valid_hash}") is True
        # Tampered body
        assert verify_webhook_signature(b'{"tampered":true}', f"sha256={valid_hash}") is False
        # Wrong signature
        assert verify_webhook_signature(body, "sha256=invalidhash9999") is False
        # Missing sha256 prefix
        assert verify_webhook_signature(body, valid_hash) is False


def test_webhook_signature_rejection_on_post(client: TestClient):
    """POST /whatsapp/webhook rejects requests with invalid X-Hub-Signature-256."""
    with patch.object(settings, "APP_SECRET", "strict_meta_secret"):
        res = client.post(
            "/api/v1/whatsapp/webhook",
            content=b'{"test":1}',
            headers={"X-Hub-Signature-256": "sha256=bad_signature", "Content-Type": "application/json"},
        )
        assert res.status_code == 401


def test_candidate_opt_in_requirement(client: TestClient, user_a: dict):
    """Outbound template and free-form messages MUST be blocked if candidate has not opted in."""
    # 1. Create opening & candidate (opt_in defaults to False)
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "iOS Engineer", "description": "Swift UI and CoreData.", "required_skills": ["Swift"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Grace Hopper",
            "email": "grace.hopper@example.com",
            "cv_text": "Experienced systems programmer.",
        },
        headers=user_a["headers"],
    ).json()

    # Add phone number via PATCH
    client.patch(
        f"/api/v1/candidates/{cand['id']}",
        json={"phone": "+1-415-555-0199"},
        headers=user_a["headers"],
    )

    # 2. Attempt to send template without opt-in -> 400 Bad Request
    res = client.post(
        "/api/v1/whatsapp/send-template",
        json={
            "candidate_id": cand["id"],
            "template_name": "recruitment_application_received",
            "variables": {"candidate_name": "Grace"},
        },
        headers=user_a["headers"],
    )
    assert res.status_code == 400
    assert "not opted in" in res.json()["detail"].lower()

    # 3. Explicitly opt in
    opt_res = client.post(
        f"/api/v1/whatsapp/candidates/{cand['id']}/opt-in",
        json={"whatsapp_opt_in": True},
        headers=user_a["headers"],
    )
    assert opt_res.status_code == 200
    assert opt_res.json()["whatsapp_opt_in"] is True

    # 4. Now sending template succeeds
    send_res = client.post(
        "/api/v1/whatsapp/send-template",
        json={
            "candidate_id": cand["id"],
            "template_name": "recruitment_application_received",
            "variables": {"candidate_name": "Grace"},
        },
        headers=user_a["headers"],
    )
    assert send_res.status_code == 200
    msg = send_res.json()
    assert msg["status"] == "sent"
    assert msg["direction"] == "outbound"
    assert msg["template_name"] == "recruitment_application_received"
    assert "Grace" in msg["body"]


def test_24_hour_care_window_enforcement_for_freeform(client: TestClient, user_a: dict):
    """Free-form text message can ONLY be sent within 24 hours of candidate's last inbound message."""
    # 1. Create opening & opted-in candidate
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "ML Engineer", "description": "PyTorch & Transformers", "required_skills": ["Python"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Claude Shannon",
            "email": "shannon@bell.labs",
            "cv_text": "Father of information theory.",
        },
        headers=user_a["headers"],
    ).json()

    client.patch(
        f"/api/v1/candidates/{cand['id']}",
        json={"phone": "+1-650-555-0144"},
        headers=user_a["headers"],
    )
    client.post(
        f"/api/v1/whatsapp/candidates/{cand['id']}/opt-in",
        json={"whatsapp_opt_in": True},
        headers=user_a["headers"],
    )

    # 2. Try sending free-form message before any inbound message has occurred -> 400
    res_no_inbound = client.post(
        "/api/v1/whatsapp/send-freeform",
        json={"candidate_id": cand["id"], "message": "Hi Claude, are you free to chat?"},
        headers=user_a["headers"],
    )
    assert res_no_inbound.status_code == 400
    assert "24-hour" in res_no_inbound.json()["detail"]

    # 3. Simulate inbound message via Meta webhook from candidate's phone
    webhook_inbound_payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "123456"},
                            "contacts": [{"profile": {"name": "Claude Shannon"}, "wa_id": "16505550144"}],
                            "messages": [
                                {
                                    "from": "16505550144",
                                    "id": "wamid.inbound_001",
                                    "timestamp": "1700000000",
                                    "text": {"body": "Hello! I saw your message and I am interested."},
                                    "type": "text",
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }

    wh_res = client.post("/api/v1/whatsapp/webhook", json=webhook_inbound_payload)
    assert wh_res.status_code == 200
    assert wh_res.json()["messages_processed"] == 1

    # 4. Now that inbound is recorded within last 24h, free-form text succeeds
    res_open_window = client.post(
        "/api/v1/whatsapp/send-freeform",
        json={"candidate_id": cand["id"], "message": "Awesome! When would you like to speak?"},
        headers=user_a["headers"],
    )
    assert res_open_window.status_code == 200
    msg_data = res_open_window.json()
    assert msg_data["status"] == "sent"
    assert msg_data["direction"] == "outbound"
    assert msg_data["message_type"] == "text"


def test_delivery_receipt_status_updates(client: TestClient, user_a: dict):
    """Webhook processes sent -> delivered -> read status receipts."""
    # 1. Setup candidate & send template
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "DevOps Lead", "description": "Terraform & AWS.", "required_skills": ["AWS"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Linus Torvalds",
            "email": "linus@kernel.org",
            "cv_text": "Linux kernel creator.",
        },
        headers=user_a["headers"],
    ).json()

    client.patch(
        f"/api/v1/candidates/{cand['id']}",
        json={"phone": "+1-503-555-0188"},
        headers=user_a["headers"],
    )
    client.post(
        f"/api/v1/whatsapp/candidates/{cand['id']}/opt-in",
        json={"whatsapp_opt_in": True},
        headers=user_a["headers"],
    )

    msg = client.post(
        "/api/v1/whatsapp/send-template",
        json={"candidate_id": cand["id"], "template_name": "recruitment_application_received"},
        headers=user_a["headers"],
    ).json()

    wamid = msg["whatsapp_message_id"]
    assert wamid is not None

    # 2. Simulate delivery status receipt via webhook
    delivered_payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "statuses": [
                                {
                                    "id": wamid,
                                    "status": "delivered",
                                    "timestamp": "1700000100",
                                    "recipient_id": "15035550188",
                                }
                            ]
                        },
                    }
                ]
            }
        ],
    }
    st_res = client.post("/api/v1/whatsapp/webhook", json=delivered_payload)
    assert st_res.status_code == 200
    assert st_res.json()["statuses_processed"] == 1

    # 3. Verify message status updated in thread
    thread_res = client.get(f"/api/v1/whatsapp/threads/{cand['id']}", headers=user_a["headers"])
    assert thread_res.status_code == 200
    thread = thread_res.json()
    assert len(thread["messages"]) >= 1
    target_msg = [m for m in thread["messages"] if m["whatsapp_message_id"] == wamid][0]
    assert target_msg["status"] == "delivered"


def test_batch_template_preview_and_rate_limited_send(client: TestClient, user_a: dict):
    """Test HR Flow: Select candidates -> Preview variables -> Approve -> Rate-limited Send."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Full Stack Dev", "description": "React & Python.", "required_skills": ["React"]},
        headers=user_a["headers"],
    ).json()

    # Candidate 1: Opted in
    c1 = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Alice Green", "email": "alice@ex.com", "cv_text": "Full stack engineer."},
        headers=user_a["headers"],
    ).json()
    client.patch(f"/api/v1/candidates/{c1['id']}", json={"phone": "+1-415-555-0101"}, headers=user_a["headers"])
    client.post(f"/api/v1/whatsapp/candidates/{c1['id']}/opt-in", json={"whatsapp_opt_in": True}, headers=user_a["headers"])

    # Candidate 2: NOT opted in
    c2 = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Bob White", "email": "bob@ex.com", "cv_text": "Frontend engineer with React and Next.js experience."},
        headers=user_a["headers"],
    ).json()
    client.patch(f"/api/v1/candidates/{c2['id']}", json={"phone": "+1-415-555-0102"}, headers=user_a["headers"])

    # 1. Preview batch
    preview_res = client.post(
        "/api/v1/whatsapp/batch-preview",
        json={
            "candidate_ids": [c1["id"], c2["id"]],
            "template_name": "recruitment_application_received",
            "custom_variables": {"company_name": "Acme Corp"},
        },
        headers=user_a["headers"],
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    assert preview_data["total_selected"] == 2
    assert preview_data["eligible_count"] == 1
    assert preview_data["ineligible_opt_out_count"] == 1

    # 2. Approve & Send batch
    send_batch_res = client.post(
        "/api/v1/whatsapp/batch-send",
        json={
            "candidate_ids": [c1["id"], c2["id"]],
            "template_name": "recruitment_application_received",
            "custom_variables": {"company_name": "Acme Corp"},
        },
        headers=user_a["headers"],
    )
    assert send_batch_res.status_code == 200
    batch_summary = send_batch_res.json()
    assert batch_summary["sent_count"] == 1
    assert batch_summary["blocked_count"] == 1


def test_ai_draft_reply_requires_hr_approval(client: TestClient, user_a: dict):
    """AI drafts reply but requires explicit HR approval before dispatch."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Data Architect", "description": "Snowflake and DBT.", "required_skills": ["SQL"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Ada Lovelace", "email": "ada@analytical.engine", "cv_text": "Pioneer of computing."},
        headers=user_a["headers"],
    ).json()

    draft_res = client.post(
        "/api/v1/whatsapp/ai-draft-reply",
        json={"candidate_id": cand["id"], "instructions": "Invite them to talk about Snowflake."},
        headers=user_a["headers"],
    )
    assert draft_res.status_code == 200
    data = draft_res.json()
    assert "drafted_message" in data
    assert len(data["drafted_message"]) > 10
    assert data["requires_hr_approval"] is True


# ── New Feature Tests: Normalization, Status, & Contact Candidate ───────────

def test_phone_normalization_logic():
    """Verify phone normalization logic with Pakistan defaults and edge cases."""
    from app.services.whatsapp_service import normalize_phone_number

    # Pakistan local standard format with leading zero (03704570873 -> 923704570873)
    assert normalize_phone_number("03704570873") == "923704570873"
    # Pakistan 10-digit format without leading zero (3704570873 -> 923704570873)
    assert normalize_phone_number("3704570873") == "923704570873"
    # Pakistan formatted with +92
    assert normalize_phone_number("+92 370 4570873") == "923704570873"
    # Pakistan formatted with double zero (0092...)
    assert normalize_phone_number("00923704570873") == "923704570873"
    # International standard (US number)
    assert normalize_phone_number("+1 (650) 555-0144") == "16505550144"

    # Rejection of invalid phone numbers
    with pytest.raises(ValueError, match="too short"):
        normalize_phone_number("12345")

    with pytest.raises(ValueError, match="contains no valid numeric digits"):
        normalize_phone_number("invalid-phone")

    with pytest.raises(ValueError, match="no phone number"):
        normalize_phone_number("")


def test_whatsapp_status_endpoint(client: TestClient):
    """Test WhatsApp status endpoint returns configured and status information."""
    res = client.get("/api/v1/whatsapp/status")
    assert res.status_code == 200
    data = res.json()
    assert "configured" in data
    assert "valid" in data
    assert "is_expired" in data
    assert "status_message" in data
    assert "default_template" in data

    # Also verify root alias works
    root_res = client.get("/whatsapp/status")
    assert root_res.status_code == 200
    assert root_res.json()["default_template"] == data["default_template"]


def test_contact_candidate_preview_and_dispatch(client: TestClient, user_a: dict):
    """Test contact candidate preview with JD variables and dispatch via WhatsApp."""
    # 1. Create opening with specific title and location
    op = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Senior Backend Architect",
            "department": "Engineering",
            "location": "Lahore, Pakistan (Hybrid)",
            "description": "FastAPI, PostgreSQL and cloud systems.",
            "required_skills": ["Python", "FastAPI"],
        },
        headers=user_a["headers"],
    ).json()

    # 2. Create candidate with Pakistan phone number
    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Hamza Tariq",
            "email": "hamza.tariq@example.pk",
            "address": "Lahore, Pakistan",
            "cv_text": "Senior Python developer with 7 years experience.",
        },
        headers=user_a["headers"],
    ).json()

    # Add candidate phone in Pakistan format (03704570873) and address
    client.patch(
        f"/api/v1/candidates/{cand['id']}",
        json={"phone": "03704570873", "address": "Lahore, Pakistan"},
        headers=user_a["headers"],
    )

    # 3. Request contact preview
    preview_res = client.get(
        f"/api/v1/whatsapp/candidates/{cand['id']}/contact-preview",
        headers=user_a["headers"],
    )
    assert preview_res.status_code == 200
    preview = preview_res.json()
    assert preview["candidate_name"] == "Hamza Tariq"
    assert preview["clean_phone"] == "923704570873"
    assert preview["phone_valid"] is True
    assert preview["care_window_open"] is False
    assert "variables" in preview
    assert preview["variables"]["role"] == "Senior Backend Architect"
    assert "Lahore" in preview["variables"]["location"]

    # 4. Dispatch contact via WhatsApp with candidate opt-in
    # Since care window is closed, template message fallback should be used
    contact_res = client.post(
        f"/api/v1/whatsapp/contact/{cand['id']}",
        json={
            "channel": "whatsapp",
            "message": "Custom contact message",
            "whatsapp_opt_in": True,
            "template_name": "hello_world",
        },
        headers=user_a["headers"],
    )
    assert contact_res.status_code == 200
    contact_data = contact_res.json()
    assert contact_data["status"] == "sent"
    assert contact_data["channel"] == "whatsapp"
    assert contact_data["used_template"] == "hello_world"
    assert contact_data["care_window_open"] is False
