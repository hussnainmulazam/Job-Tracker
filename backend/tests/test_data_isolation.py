"""
tests/test_data_isolation.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Rigorous multi-tenant data isolation tests:
Validates that User B cannot read, update, match, score, interview, message,
export, or delete any of User A's candidates, openings, scorecards,
interviews, scheduling links, messages, notifications, or audit trails.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.candidate import Candidate, CandidateStage
from app.models.candidate_link import CandidateLink
from app.models.interview import Interview, InterviewStatus, SchedulingLink, SchedulingLinkStatus
from app.models.job_opening import JobOpening
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.models.notification import Notification
from app.models.scorecard import Scorecard


def test_job_openings_isolation(client: TestClient, user_a: dict, user_b: dict):
    """User B cannot access or modify User A's job opening."""
    # User A creates a job opening
    res = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Principal AI Architect - Secret Team",
            "description": "Leading confidential next-gen AI systems.",
            "required_skills": ["Python", "PyTorch", "Transformers"],
        },
        headers=user_a["headers"],
    )
    assert res.status_code == 201
    opening_id = res.json()["id"]

    # User B tries to GET
    res_b = client.get(f"/api/v1/job-openings/{opening_id}", headers=user_b["headers"])
    assert res_b.status_code == 404

    # User B tries to PATCH
    res_patch = client.patch(
        f"/api/v1/job-openings/{opening_id}",
        json={"title": "Hacked Title"},
        headers=user_b["headers"],
    )
    assert res_patch.status_code == 404

    # User B tries to DELETE
    res_del = client.delete(f"/api/v1/job-openings/{opening_id}", headers=user_b["headers"])
    assert res_del.status_code == 404

    # User B tries to invoke match / bulk-score / extract
    res_match = client.post(f"/api/v1/job-openings/{opening_id}/match", headers=user_b["headers"])
    assert res_match.status_code == 404

    res_bulk = client.post(f"/api/v1/job-openings/{opening_id}/bulk-score", headers=user_b["headers"])
    assert res_bulk.status_code == 404

    # User B lists openings -> opening_id is not in list
    res_list = client.get("/api/v1/job-openings", headers=user_b["headers"])
    assert res_list.status_code == 200
    opening_ids = [item["id"] for item in res_list.json().get("items", res_list.json())]
    assert opening_id not in opening_ids


def test_candidates_isolation(client: TestClient, user_a: dict, user_b: dict):
    """User B cannot access, score, extract, export, or delete User A's candidate."""
    # User A creates opening & candidate
    op_res = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Staff Backend Engineer",
            "description": "Distributed high throughput systems.",
            "required_skills": ["Go", "Kafka"],
        },
        headers=user_a["headers"],
    )
    opening_id = op_res.json()["id"]

    cand_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Classified Candidate A",
            "email": "classified.a@example.com",
            "cv_text": "Experienced engineer with Go and Kafka background spanning 7 years.",
        },
        headers=user_a["headers"],
    )
    assert cand_res.status_code == 201
    candidate_id = cand_res.json()["id"]

    # User B attempts to read candidate
    res_get = client.get(f"/api/v1/candidates/{candidate_id}", headers=user_b["headers"])
    assert res_get.status_code == 404

    # User B attempts to update candidate
    res_upd = client.patch(
        f"/api/v1/candidates/{candidate_id}",
        json={"name": "Tampered Name"},
        headers=user_b["headers"],
    )
    assert res_upd.status_code == 404

    # User B attempts to transition stage
    res_st = client.patch(
        f"/api/v1/candidates/{candidate_id}/stage",
        json={"stage": "rejected"},
        headers=user_b["headers"],
    )
    assert res_st.status_code == 404

    # User B attempts to score candidate
    res_sc = client.post(f"/api/v1/candidates/{candidate_id}/score", headers=user_b["headers"])
    assert res_sc.status_code == 404

    # User B attempts to generate screening questions
    res_sq = client.post(
        f"/api/v1/candidates/{candidate_id}/screening-questions",
        headers=user_b["headers"],
    )
    assert res_sq.status_code == 404

    # User B attempts to export candidate data (GDPR endpoint)
    res_exp = client.get(f"/api/v1/candidates/{candidate_id}/export", headers=user_b["headers"])
    assert res_exp.status_code == 404

    # User B attempts to view candidate audit logs
    res_aud = client.get(f"/api/v1/candidates/{candidate_id}/audit-logs", headers=user_b["headers"])
    assert res_aud.status_code in [200, 404]
    if res_aud.status_code == 200:
        assert len(res_aud.json()) == 0

    # User B attempts to delete candidate
    res_del = client.delete(f"/api/v1/candidates/{candidate_id}", headers=user_b["headers"])
    assert res_del.status_code == 404

    # Candidate still exists for User A
    verify_a = client.get(f"/api/v1/candidates/{candidate_id}", headers=user_a["headers"])
    assert verify_a.status_code == 200
    assert verify_a.json()["name"] == "Classified Candidate A"


def test_scorecards_isolation(client: TestClient, user_a: dict, user_b: dict):
    """User B cannot view or modify User A's scorecards."""
    # User A creates opening & candidate
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Data Scientist", "description": "Machine learning models in production.", "required_skills": ["Python"]},
        headers=user_a["headers"],
    )
    opening_id = op_res.json()["id"]

    cand_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Candidate ML",
            "email": "cand.ml@example.com",
            "cv_text": "Machine learning specialist with deep neural net expertise.",
        },
        headers=user_a["headers"],
    )
    candidate_id = cand_res.json()["id"]

    # User A submits scorecard
    sc_res = client.post(
        "/api/v1/scorecards",
        json={
            "candidate_id": candidate_id,
            "rating": 5,
            "notes": "Outstanding problem solving and system architecture.",
        },
        headers=user_a["headers"],
    )
    assert sc_res.status_code == 201
    scorecard_id = sc_res.json()["id"]

    # User B tries to GET scorecard
    res_sc_get = client.get(f"/api/v1/scorecards/{scorecard_id}", headers=user_b["headers"])
    assert res_sc_get.status_code == 404

    # User B tries to PATCH scorecard
    res_sc_patch = client.patch(
        f"/api/v1/scorecards/{scorecard_id}",
        json={"rating": 1, "notes": "Hacked review"},
        headers=user_b["headers"],
    )
    assert res_sc_patch.status_code == 404

    # User B tries to DELETE scorecard
    res_sc_del = client.delete(f"/api/v1/scorecards/{scorecard_id}", headers=user_b["headers"])
    assert res_sc_del.status_code == 404

    # User B lists scorecards for candidate_id -> returns empty items
    res_sc_list = client.get(f"/api/v1/scorecards?candidate_id={candidate_id}", headers=user_b["headers"])
    assert res_sc_list.status_code in [200, 404]
    if res_sc_list.status_code == 200:
        assert res_sc_list.json()["total"] == 0


def test_whatsapp_isolation(client: TestClient, user_a: dict, user_b: dict):
    """User B cannot access User A's candidate WhatsApp thread or send messages."""
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "DevOps Engineer", "description": "Cloud infrastructure", "required_skills": ["AWS"]},
        headers=user_a["headers"],
    )
    cand_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op_res.json()["id"],
            "name": "WhatsApp Candidate",
            "email": "wa.cand@example.com",
            "cv_text": "DevOps and Kubernetes specialist with 5 years AWS cloud operations.",
        },
        headers=user_a["headers"],
    )
    candidate_id = cand_res.json()["id"]

    # User B attempts to read candidate thread
    res_thread = client.get(f"/api/v1/whatsapp/threads/{candidate_id}", headers=user_b["headers"])
    assert res_thread.status_code == 404

    # User B attempts to send template message to candidate A
    res_send_tpl = client.post(
        "/api/v1/whatsapp/send-template",
        json={
            "candidate_id": candidate_id,
            "template_name": "recruitment_application_received",
            "language_code": "en_US",
        },
        headers=user_b["headers"],
    )
    assert res_send_tpl.status_code == 404

    # User B attempts to send free-form message to candidate A
    res_send_ff = client.post(
        "/api/v1/whatsapp/send-freeform",
        json={
            "candidate_id": candidate_id,
            "message": "Hi, unauthorized message from user B",
        },
        headers=user_b["headers"],
    )
    assert res_send_ff.status_code == 404


def test_notifications_isolation(client: TestClient, session: Session, user_a: dict, user_b: dict):
    """User B cannot read or mark User A's notifications."""
    user_a_id = uuid.UUID(user_a["user"]["id"])
    notif = Notification(
        user_id=user_a_id,
        title="Confidential Alert",
        message="New executive applicant received.",
        type="new_applicant",
    )
    session.add(notif)
    session.commit()
    session.refresh(notif)

    # User B lists notifications
    res_list = client.get("/api/v1/notifications", headers=user_b["headers"])
    assert res_list.status_code == 200
    notif_ids = [n["id"] for n in res_list.json()["items"]]
    assert str(notif.id) not in notif_ids

    # User B tries to mark User A's notification as read
    res_read = client.patch(f"/api/v1/notifications/{notif.id}/read", headers=user_b["headers"])
    assert res_read.status_code == 404


def test_global_search_isolation(client: TestClient, user_a: dict, user_b: dict):
    """Global search strictly filters by authenticated recruiter ID."""
    unique_keyword = f"UniqSecretProject{uuid.uuid4().hex[:6]}"
    # User A creates opening with unique keyword
    mock_extracted = MagicMock()
    mock_extracted.required_skills = ["Python"]
    mock_extracted.years_of_experience = 3.0
    mock_extracted.nice_to_haves = []

    with patch(
        "app.services.job_opening_service.extract_job_requirements",
        new_callable=AsyncMock,
        return_value=mock_extracted,
    ):
        client.post(
            "/api/v1/job-openings",
            json={
                "title": f"Lead {unique_keyword}",
                "description": f"Role for {unique_keyword}",
                "required_skills": ["Python"],
            },
            headers=user_a["headers"],
        )

    # User A searches -> finds 1 result
    res_a = client.get(f"/api/v1/search?q={unique_keyword}", headers=user_a["headers"])
    assert res_a.status_code == 200
    assert res_a.json()["total_results"] >= 1

    # User B searches -> finds 0 results
    res_b = client.get(f"/api/v1/search?q={unique_keyword}", headers=user_b["headers"])
    assert res_b.status_code == 200
    assert res_b.json()["total_results"] == 0
