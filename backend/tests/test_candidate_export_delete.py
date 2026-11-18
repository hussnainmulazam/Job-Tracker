"""
tests/test_candidate_export_delete.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Tests for:
1. Candidate data export endpoint (GET /api/v1/candidates/{id}/export) - GDPR compliance
2. Candidate full cascading delete (DELETE /api/v1/candidates/{id})
3. Fernet token encryption & decryption roundtrip
4. Sliding window rate limiting returning HTTP 429 Too Many Requests
"""
import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.encryption import decrypt_token, encrypt_token
from app.core.rate_limit import rate_limit, reset_rate_limits
from app.models.candidate import Candidate, CandidateStage
from app.models.candidate_link import CandidateLink
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.models.scorecard import Scorecard
from app.models.audit_log import AuditLog


def test_token_encryption_roundtrip():
    """Validates Fernet symmetric encryption and decryption for Google OAuth tokens."""
    plain_token = "ya29.a0AfH6SMB_secret_refresh_token_1234567890_abcdef"
    cipher = encrypt_token(plain_token)
    assert cipher != plain_token
    assert len(cipher) > len(plain_token)

    decrypted = decrypt_token(cipher)
    assert decrypted == plain_token


def test_candidate_data_export_endpoint(client: TestClient, session: Session, user_a: dict):
    """
    GET /api/v1/candidates/{id}/export returns full GDPR subject access package:
    candidate info, links, scorecards, messages, interviews, scheduling links, and audit trail.
    """
    user_id = uuid.UUID(user_a["user"]["id"])

    # 1. Create opening
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Cloud Architect", "description": "GCP infrastructure", "required_skills": ["GCP", "Terraform"]},
        headers=user_a["headers"],
    )
    opening_id = op_res.json()["id"]

    # 2. Create candidate
    cand_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Sarah Connor",
            "email": "sarah.connor@example.com",
            "cv_text": "Senior cloud architect with 10 years experience deploying GCP, Kubernetes, and Terraform.",
        },
        headers=user_a["headers"],
    )
    assert cand_res.status_code == 201
    candidate_id = uuid.UUID(cand_res.json()["id"])

    # 3. Add link
    link = CandidateLink(
        user_id=user_id,
        candidate_id=candidate_id,
        link_type="github",
        url="https://github.com/sarahconnor",
        is_verified=True,
        confidence=1.0,
        source="cv",
    )
    session.add(link)

    # 4. Add scorecard
    scorecard = Scorecard(
        user_id=user_id,
        candidate_id=candidate_id,
        rating=5,
        notes="Exemplary cloud systems architecture background.",
    )
    session.add(scorecard)

    # 5. Add message
    msg = Message(
        user_id=user_id,
        candidate_id=candidate_id,
        direction=MessageDirection.outbound,
        message_type=MessageType.text,
        body="Hi Sarah, your interview is scheduled.",
        status=MessageStatus.sent,
    )
    session.add(msg)
    session.commit()

    # 6. Call export endpoint
    res = client.get(f"/api/v1/candidates/{candidate_id}/export", headers=user_a["headers"])
    assert res.status_code == 200
    data = res.json()

    assert data["candidate"]["name"] == "Sarah Connor"
    assert data["candidate"]["email"] == "sarah.connor@example.com"
    assert len(data["links"]) >= 1
    assert data["links"][0]["url"] == "https://github.com/sarahconnor"
    assert len(data["scorecards"]) >= 1
    assert data["scorecards"][0]["rating"] == 5
    assert len(data["messages"]) >= 1
    assert data["messages"][0]["body"] == "Hi Sarah, your interview is scheduled."
    assert "audit_trail" in data
    assert "exported_at" in data

    # Verify audit log was recorded for the export
    audits = session.exec(
        select(AuditLog).where(
            AuditLog.candidate_id == candidate_id,
            AuditLog.action == "candidate_data_exported",
        )
    ).all()
    assert len(audits) >= 1


def test_candidate_cascading_delete(client: TestClient, session: Session, user_a: dict):
    """
    DELETE /api/v1/candidates/{id} performs full cascading deletion of all associated
    records (scorecards, links, messages) and safely detaches audit logs.
    """
    user_id = uuid.UUID(user_a["user"]["id"])

    # 1. Create opening & candidate
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Site Reliability Engineer", "description": "Site reliability engineering and production systems.", "required_skills": ["Linux"]},
        headers=user_a["headers"],
    )
    opening_id = op_res.json()["id"]

    cand_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Marcus Wright",
            "email": "marcus.wright@example.com",
            "cv_text": "Site reliability engineer with experience in Linux kernels and Prometheus.",
        },
        headers=user_a["headers"],
    )
    candidate_id = uuid.UUID(cand_res.json()["id"])

    # 2. Add child records
    link = CandidateLink(
        user_id=user_id,
        candidate_id=candidate_id,
        link_type="linkedin",
        url="https://linkedin.com/in/marcuswright",
        source="cv",
    )
    session.add(link)

    scorecard = Scorecard(
        user_id=user_id,
        candidate_id=candidate_id,
        rating=4,
        notes="Solid reliability experience.",
    )
    session.add(scorecard)

    msg = Message(
        user_id=user_id,
        candidate_id=candidate_id,
        direction=MessageDirection.outbound,
        message_type=MessageType.text,
        body="Invitation to interview.",
        status=MessageStatus.sent,
    )
    session.add(msg)
    session.commit()

    # 3. Perform DELETE
    del_res = client.delete(f"/api/v1/candidates/{candidate_id}", headers=user_a["headers"])
    assert del_res.status_code == 204

    # 4. Verify candidate is gone
    get_res = client.get(f"/api/v1/candidates/{candidate_id}", headers=user_a["headers"])
    assert get_res.status_code == 404

    # 5. Verify child records are cascaded and deleted
    remaining_links = session.exec(select(CandidateLink).where(CandidateLink.candidate_id == candidate_id)).all()
    assert len(remaining_links) == 0

    remaining_sc = session.exec(select(Scorecard).where(Scorecard.candidate_id == candidate_id)).all()
    assert len(remaining_sc) == 0

    remaining_msg = session.exec(select(Message).where(Message.candidate_id == candidate_id)).all()
    assert len(remaining_msg) == 0


def test_rate_limiting_enforcement(client: TestClient):
    """
    Verifies that requests exceeding rate limits receive HTTP 429 Too Many Requests
    with a Retry-After header.
    """
    reset_rate_limits()

    # Hit /api/v1/auth/login repeatedly beyond limit
    for _ in range(10):
        client.post("/api/v1/auth/login", json={"email": "nonexistent@example.com", "password": "WrongPassword!"})

    # The 11th request must trigger HTTP 429
    res_429 = client.post("/api/v1/auth/login", json={"email": "nonexistent@example.com", "password": "WrongPassword!"})
    assert res_429.status_code == 429
    assert "Rate limit exceeded" in res_429.json()["detail"]
    assert "Retry-After" in res_429.headers

    # Resetting limits restores normal access
    reset_rate_limits()
    res_restored = client.post("/api/v1/auth/login", json={"email": "nonexistent@example.com", "password": "WrongPassword!"})
    assert res_restored.status_code == 401  # Normal credential failure, not rate limited
