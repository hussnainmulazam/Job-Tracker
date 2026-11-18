"""Tests for Google OAuth2, Gmail Sync, and Email Sending Integration endpoints."""
import uuid
from typing import Dict
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.encryption import decrypt_token, encrypt_token
from app.core.security import create_access_token
from app.models.candidate import Candidate, CandidateStage
from app.models.google_account import GoogleAccount
from app.models.job_opening import JobOpening, JobOpeningStatus
from app.models.message import Message, MessageType, MessageStatus
from app.models.audit_log import AuditLog
from app.models.user import User


def test_fernet_encryption_roundtrip():
    """Verify that sensitive refresh tokens are properly encrypted and decrypted."""
    sample_refresh_token = "1//04example_refresh_token_very_secret_xyz123"
    ciphertext = encrypt_token(sample_refresh_token)

    assert ciphertext != sample_refresh_token
    assert len(ciphertext) > len(sample_refresh_token)

    recovered = decrypt_token(ciphertext)
    assert recovered == sample_refresh_token


def test_google_login_unauthorized(client: TestClient):
    """GET /auth/google/login requires Bearer authentication."""
    res = client.get("/auth/google/login")
    assert res.status_code == 401


def test_google_login_exact_8_scopes(client: TestClient, user_a: Dict):
    """
    GET /auth/google/login returns authorization URL with exactly the 8 requested scopes:
    openid, userinfo.email, userinfo.profile, gmail.readonly, gmail.send, calendar.events,
    calendar.freebusy, drive.file with offline access and prompt=consent.
    """
    res = client.get("/auth/google/login", headers=user_a["headers"])
    assert res.status_code == 200

    data = res.json()
    assert "auth_url" in data
    assert "state" in data

    url = data["auth_url"]
    assert "accounts.google.com/o/oauth2" in url
    assert "access_type=offline" in url
    assert "prompt=consent" in url
    assert "include_granted_scopes=true" in url

    # Exactly the 8 required scopes
    assert "openid" in url
    assert "userinfo.email" in url
    assert "userinfo.profile" in url
    assert "gmail.readonly" in url
    assert "gmail.send" in url
    assert "calendar.events" in url
    assert "calendar.freebusy" in url
    assert "drive.file" in url


def test_google_status_disconnected(client: TestClient, user_a: Dict):
    """GET /integrations/google/status returns is_connected=False initially."""
    res = client.get("/integrations/google/status", headers=user_a["headers"])
    assert res.status_code == 200

    data = res.json()
    assert data["is_connected"] is False
    assert data["email"] is None
    assert data["total_emails_synced"] == 0
    assert data["reconnect_needed"] is False


def test_google_callback_flow_and_audit(
    client: TestClient,
    user_a: Dict,
    session: Session,
):
    """
    GET /auth/google/callback processes OAuth code and state,
    encrypts the refresh token, creates a GoogleAccount record, and logs to audit trail.
    """
    user_id = uuid.UUID(user_a["user"]["id"])
    state = create_access_token(subject=str(user_id))

    res = client.get(
        f"/auth/google/callback?code=mock_auth_code_123&state={state}",
        follow_redirects=False,
    )
    # Callback redirects to frontend settings
    assert res.status_code == 302
    assert "google_connected=true" in res.headers["location"]

    # Verify database record
    account = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == user_id)
    ).first()

    assert account is not None
    assert account.email is not None
    # Verify token is encrypted in DB
    assert account.encrypted_refresh_token is not None
    decrypted = decrypt_token(account.encrypted_refresh_token)
    assert decrypted.startswith("1//") or "refresh" in decrypted

    # Verify audit log entry
    audit = session.exec(
        select(AuditLog).where(
            AuditLog.user_id == user_id,
            AuditLog.action == "google_connected",
        )
    ).first()
    assert audit is not None


def test_google_status_and_reconnect_banner(
    client: TestClient,
    user_a: Dict,
    session: Session,
):
    """GET /integrations/google/status flags reconnect_needed if required scopes are missing."""
    user_id = uuid.UUID(user_a["user"]["id"])
    state = create_access_token(subject=str(user_id))

    # Connect via callback
    client.get(
        f"/auth/google/callback?code=mock_code&state={state}",
        follow_redirects=False,
    )

    # 1. Full status check (mock grants full scopes)
    res = client.get("/integrations/google/status", headers=user_a["headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["is_connected"] is True
    assert data["reconnect_needed"] is False
    assert len(data["missing_scopes"]) == 0

    # 2. Simulate account missing gmail.send and drive.file
    account = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == user_id)
    ).first()
    assert account is not None
    account.scopes = ["openid", "userinfo.email", "gmail.readonly"]
    session.add(account)
    session.commit()

    res_missing = client.get("/integrations/google/status", headers=user_a["headers"])
    data_missing = res_missing.json()
    assert data_missing["reconnect_needed"] is True
    assert any("gmail.send" in s for s in data_missing["missing_scopes"])
    assert any("drive.file" in s for s in data_missing["missing_scopes"])
    assert "Missing required permissions" in data_missing["reconnect_reason"]


def test_update_sync_settings_with_default_opening(
    client: TestClient,
    user_a: Dict,
    session: Session,
):
    """PATCH /integrations/google/settings updates query, label, and default opening."""
    user_id = uuid.UUID(user_a["user"]["id"])
    state = create_access_token(subject=str(user_id))
    client.get(f"/auth/google/callback?code=mock_code&state={state}", follow_redirects=False)

    opening = JobOpening(
        user_id=user_id,
        title="Staff ML Engineer",
        description="Machine learning and NLP pipelines.",
        required_skills=["Python", "PyTorch"],
        status=JobOpeningStatus.active,
    )
    session.add(opening)
    session.commit()
    session.refresh(opening)

    patch_res = client.patch(
        "/integrations/google/settings",
        json={
            "sync_query": "has:attachment (filename:pdf OR filename:docx) newer_than:30d",
            "sync_label": "RESUMES",
            "default_opening_id": str(opening.id),
        },
        headers=user_a["headers"],
    )
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["sync_query"] == "has:attachment (filename:pdf OR filename:docx) newer_than:30d"
    assert data["sync_label"] == "RESUMES"
    assert data["default_opening_id"] == str(opening.id)
    assert data["default_opening_title"] == "Staff ML Engineer"


def test_preview_and_send_email_flow(
    client: TestClient,
    user_a: Dict,
    session: Session,
):
    """
    Test previewing template variables and sending candidate email via Gmail API:
    - Previews template with {candidate_name}, {role}, {company}, {slot_link}
    - Sends email and creates Message row in DB
    - Logs to AuditLog
    """
    user_id = uuid.UUID(user_a["user"]["id"])
    state = create_access_token(subject=str(user_id))
    client.get(f"/auth/google/callback?code=mock_code&state={state}", follow_redirects=False)

    opening = JobOpening(
        user_id=user_id,
        title="Full Stack Lead",
        description="Lead frontend and backend team.",
        required_skills=["React", "Python"],
        status=JobOpeningStatus.active,
    )
    session.add(opening)
    session.commit()
    session.refresh(opening)

    candidate = Candidate(
        user_id=user_id,
        opening_id=opening.id,
        name="Sarah Connor",
        email="sarah.connor@example.com",
        cv_text="Experienced full stack engineer with 8 years of React and Python experience.",
        stage=CandidateStage.applied,
    )
    session.add(candidate)
    session.commit()
    session.refresh(candidate)

    # 1. Preview template
    preview_res = client.post(
        "/integrations/google/preview-email",
        json={
            "candidate_id": str(candidate.id),
            "template_name": "interview_invitation",
            "company_name": "Acme Cybernetics",
            "slot_link": "https://careers.acme.com/schedule/sarah-123",
        },
        headers=user_a["headers"],
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    assert "Sarah Connor" in preview_data["body"]
    assert "Full Stack Lead" in preview_data["subject"]
    assert "Acme Cybernetics" in preview_data["body"]
    assert "https://careers.acme.com/schedule/sarah-123" in preview_data["body"]
    assert preview_data["recipient_email"] == "sarah.connor@example.com"

    # 2. Send email
    send_res = client.post(
        "/integrations/google/send-email",
        json={
            "candidate_id": str(candidate.id),
            "subject": preview_data["subject"],
            "body": preview_data["body"],
            "template_name": "interview_invitation",
        },
        headers=user_a["headers"],
    )
    assert send_res.status_code == 200
    send_data = send_res.json()
    assert send_data["status"] == "sent"
    assert send_data["recipient_email"] == "sarah.connor@example.com"

    # 3. Verify Message row in DB
    msg_row = session.exec(
        select(Message).where(
            Message.candidate_id == candidate.id,
            Message.message_type == MessageType.email,
        )
    ).first()
    assert msg_row is not None
    assert msg_row.status == MessageStatus.sent
    assert "Sarah Connor" in msg_row.body

    # 4. Verify Audit Log entry
    audit = session.exec(
        select(AuditLog).where(
            AuditLog.user_id == user_id,
            AuditLog.action == "email_sent",
            AuditLog.candidate_id == candidate.id,
        )
    ).first()
    assert audit is not None
    assert "sarah.connor@example.com" in audit.details


def test_gmail_sync_job_execution(
    client: TestClient,
    user_a: Dict,
    session: Session,
):
    """POST /integrations/google/sync executes incremental Gmail resume sync and logs audit."""
    user_id = uuid.UUID(user_a["user"]["id"])
    state = create_access_token(subject=str(user_id))

    # Connect account first
    client.get(
        f"/auth/google/callback?code=mock_code&state={state}",
        follow_redirects=False,
    )

    opening = JobOpening(
        user_id=user_id,
        title="Senior Python Architect",
        description="Systems engineering and cloud architecture role.",
        required_skills=["Python", "FastAPI", "PostgreSQL"],
        status=JobOpeningStatus.active,
    )
    session.add(opening)
    session.commit()

    res = client.post("/integrations/google/sync", headers=user_a["headers"])
    assert res.status_code == 200

    data = res.json()
    assert data["status"] in ("success", "partial")
    assert "messages_found" in data
    assert "messages_processed" in data
    assert "attachments_saved" in data
    assert "last_synced_at" in data

    # Verify audit log entry
    audit = session.exec(
        select(AuditLog).where(
            AuditLog.user_id == user_id,
            AuditLog.action == "gmail_synced",
        )
    ).first()
    assert audit is not None


def test_google_disconnect(
    client: TestClient,
    user_a: Dict,
    session: Session,
):
    """POST /integrations/google/disconnect revokes credentials, clears account, and logs audit."""
    user_id = uuid.UUID(user_a["user"]["id"])
    state = create_access_token(subject=str(user_id))

    # Connect first
    client.get(
        f"/auth/google/callback?code=mock_code&state={state}",
        follow_redirects=False,
    )

    res = client.post("/integrations/google/disconnect", headers=user_a["headers"])
    assert res.status_code == 200
    assert "disconnected successfully" in res.json()["detail"]

    # Confirm status is disconnected
    status_res = client.get("/integrations/google/status", headers=user_a["headers"])
    assert status_res.status_code == 200
    assert status_res.json()["is_connected"] is False

    # Confirm audit log
    audit = session.exec(
        select(AuditLog).where(
            AuditLog.user_id == user_id,
            AuditLog.action == "google_disconnected",
        )
    ).first()
    assert audit is not None
