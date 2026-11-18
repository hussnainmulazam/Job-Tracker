"""
tests/test_playwright_flow.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Automated full recruiter lifecycle test:
connect -> sync -> create opening -> match -> extract -> message -> schedule.
Validates the complete recruitment pipeline with mocked external services
(Google OAuth, Gmail API, Meta WhatsApp Cloud API, OpenRouter AI, Google Calendar).
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.models.candidate import CandidateStage
from app.models.google_account import GoogleAccount
from app.models.interview import AvailabilitySchedule
from app.core.encryption import encrypt_token


def test_full_recruiter_lifecycle_flow(client: TestClient, session, user_a: dict):
    """
    Executes the end-to-end recruiter lifecycle:
    connect -> sync -> create opening -> match -> extract -> message -> schedule.
    """
    user_id = uuid.UUID(user_a["user"]["id"])
    headers = user_a["headers"]

    # ──────────────────────────────────────────────────────────────────────────
    # Step 1: CONNECT — Verify Google Workspace status
    # ──────────────────────────────────────────────────────────────────────────
    # Seed active encrypted Google account for recruiter
    google_acc = GoogleAccount(
        user_id=user_id,
        email="recruiter.google@example.com",
        encrypted_refresh_token=encrypt_token("ya29.mock_refresh_token_xyz"),
        scopes="openid,email,profile,gmail.readonly,calendar.events,calendar.freebusy,spreadsheets",
        sync_label="Recruiting",
    )
    session.add(google_acc)

    # Seed availability schedule for interviews
    schedule = AvailabilitySchedule(
        user_id=user_id,
        timezone="Asia/Karachi",
        slot_duration_minutes=30,
        buffer_minutes=10,
        weekly_hours={
            "mon": [{"start": "09:00", "end": "17:00"}],
            "tue": [{"start": "09:00", "end": "17:00"}],
            "wed": [{"start": "09:00", "end": "17:00"}],
            "thu": [{"start": "09:00", "end": "17:00"}],
            "fri": [{"start": "09:00", "end": "17:00"}],
            "sat": [],
            "sun": [],
        },
    )
    session.add(schedule)
    session.commit()

    status_res = client.get("/api/v1/integrations/google/status", headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["is_connected"] is True
    assert status_res.json()["email"] == "recruiter.google@example.com"

    # ──────────────────────────────────────────────────────────────────────────
    # Step 2: SYNC — Trigger Gmail CV attachment sync
    # ──────────────────────────────────────────────────────────────────────────
    sync_res = client.post("/api/v1/integrations/google/sync", headers=headers)
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert sync_data["status"] in ("success", "partial")
    assert "messages_found" in sync_data
    assert "messages_processed" in sync_data

    # ──────────────────────────────────────────────────────────────────────────
    # Step 3: CREATE OPENING — Post new job opening
    # ──────────────────────────────────────────────────────────────────────────
    mock_extracted_jd = MagicMock()
    mock_extracted_jd.required_skills = ["FastAPI", "Python", "Kubernetes"]
    mock_extracted_jd.years_of_experience = 5.0
    mock_extracted_jd.nice_to_haves = ["PostgreSQL", "Next.js"]

    with patch(
        "app.services.job_opening_service.extract_job_requirements",
        new_callable=AsyncMock,
        return_value=mock_extracted_jd,
    ):
        opening_res = client.post(
            "/api/v1/job-openings",
            json={
                "title": "Lead Cloud Infrastructure Engineer",
                "description": "Architect scalable backend services and Kubernetes infrastructure.",
                "required_skills": ["FastAPI", "Python", "Kubernetes"],
            },
            headers=headers,
        )
        assert opening_res.status_code == 201
        opening = opening_res.json()
        opening_id = opening["id"]
        assert opening["title"] == "Lead Cloud Infrastructure Engineer"

    # Seed Candidate under opening
    cand_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Alexander Hayes",
            "email": "alex.hayes@example.com",
            "cv_text": "Staff cloud engineer with 8 years building Python, FastAPI, and Kubernetes microservices. GitHub: https://github.com/alexhayes LinkedIn: https://linkedin.com/in/alexhayes Phone: +1-415-555-0199",
        },
        headers=headers,
    )
    assert cand_res.status_code == 201
    candidate_id = cand_res.json()["id"]

    # ──────────────────────────────────────────────────────────────────────────
    # Step 4: MATCH — AI Scoring & Candidate Match
    # ──────────────────────────────────────────────────────────────────────────
    with patch(
        "app.services.matching_service.screen_candidate_cv",
        new_callable=AsyncMock,
        return_value={
            "score": 92.5,
            "matched_skills": ["FastAPI", "Python", "Kubernetes"],
            "missing_skills": [],
            "red_flags": [],
            "summary": "Exceptional fit with deep proficiency in required backend and cloud technologies.",
            "recommendation": "strong_match",
            "interview_focus_areas": ["System scalability", "Cluster orchestration"],
            "model_used": "mocked-openrouter",
            "latency_seconds": 0.45,
        },
    ):
        match_res = client.post(f"/api/v1/job-openings/{opening_id}/match", headers=headers)
        assert match_res.status_code in (200, 202)
        match_data = match_res.json()
        assert match_data["status"] in ["completed", "processing", "in_progress"]

        # Verify candidate fit score was updated
        cand_get = client.get(f"/api/v1/candidates/{candidate_id}", headers=headers)
        assert cand_get.status_code == 200
        assert cand_get.json()["score"] == 92.5
        assert cand_get.json()["stage"] in ("applied", "screening")

    # ──────────────────────────────────────────────────────────────────────────
    # Step 5: EXTRACT — Extract Contact Details and Profile Links
    # ──────────────────────────────────────────────────────────────────────────
    with patch(
        "app.services.extractor_service.httpx.AsyncClient.head",
        new_callable=AsyncMock,
        return_value=MagicMock(status_code=200),
    ), patch(
        "app.services.extractor_service.extract_llm_gaps",
        new_callable=AsyncMock,
        return_value={},
    ):
        extract_res = client.post(
            f"/api/v1/candidates/{candidate_id}/extract-details",
            headers=headers,
        )
        assert extract_res.status_code == 200
        extract_data = extract_res.json()
        assert extract_data["candidate_id"] == candidate_id
        assert extract_data["github_url"] is not None or extract_data["linkedin_url"] is not None

        links_res = client.get(f"/api/v1/candidates/{candidate_id}/links", headers=headers)
        assert links_res.status_code == 200
        assert len(links_res.json()) >= 1

    # ──────────────────────────────────────────────────────────────────────────
    # Step 6: MESSAGE — WhatsApp Candidate Opt-In & Template Message Dispatch
    # ──────────────────────────────────────────────────────────────────────────
    # Add candidate phone number
    client.patch(
        f"/api/v1/candidates/{candidate_id}",
        json={"phone": "+14155550199"},
        headers=headers,
    )

    # Recruiter enables candidate WhatsApp opt-in
    optin_res = client.post(
        f"/api/v1/whatsapp/candidates/{candidate_id}/opt-in",
        json={"whatsapp_opt_in": True},
        headers=headers,
    )
    assert optin_res.status_code == 200

    # Dispatch WhatsApp interview invitation template message
    with patch(
        "app.services.whatsapp_service.whatsapp_service._post_meta_messages",
        new_callable=AsyncMock,
        return_value={"messages": [{"id": f"wamid.{uuid.uuid4()}"}]},
    ):
        msg_res = client.post(
            "/api/v1/whatsapp/send-template",
            json={
                "candidate_id": candidate_id,
                "template_name": "recruitment_availability_check",
                "language_code": "en_US",
                "variables": {
                    "candidate_name": "Alexander Hayes",
                    "job_title": "Lead Cloud Infrastructure Engineer",
                },
            },
            headers=headers,
        )
        assert msg_res.status_code == 200
        msg_data = msg_res.json()
        assert msg_data["candidate_id"] == candidate_id
        assert msg_data["status"] == "sent"

    # ──────────────────────────────────────────────────────────────────────────
    # Step 7: SCHEDULE — Create tokenized booking link & book Google Meet slot
    # ──────────────────────────────────────────────────────────────────────────
    sched_link_res = client.post(
        "/api/v1/scheduling/links",
        json={
            "candidate_id": candidate_id,
            "slot_duration_minutes": 30,
            "validity_days": 7,
        },
        headers=headers,
    )
    assert sched_link_res.status_code in (200, 201)
    sched_link = sched_link_res.json()
    token = sched_link["token"]

    # Candidate accesses public booking page
    public_page_res = client.get(f"/api/v1/scheduling/public/{token}")
    assert public_page_res.status_code == 200
    assert public_page_res.json()["candidate_name"] == "Alexander Hayes"

    # Candidate fetches available slots
    with patch("app.services.scheduling_service.GoogleService") as MockGoogleService:
        mock_inst = MockGoogleService.return_value
        mock_inst.get_freebusy = AsyncMock(return_value=[])  # No conflicts
        slots_res = client.get(f"/api/v1/scheduling/public/{token}/slots")
        assert slots_res.status_code == 200
        slots_data = slots_res.json()
        assert slots_data["total_slots_available"] > 0

        # Candidate selects slot and books interview
        # Pick next Monday at 10:00 UTC
        now_dt = datetime.now(timezone.utc)
        days_ahead = (7 - now_dt.weekday()) % 7 or 7
        target_slot = (now_dt + timedelta(days=days_ahead)).replace(hour=10, minute=0, second=0, microsecond=0)

        mock_inst.create_calendar_event = AsyncMock(
            return_value={
                "id": f"event_{uuid.uuid4().hex[:12]}",
                "hangoutLink": "https://meet.google.com/xyz-mock-abc",
            }
        )

        book_res = client.post(
            f"/api/v1/scheduling/public/{token}/book",
            json={
                "start_time": target_slot.isoformat(),
                "timezone": "Asia/Karachi",
                "notes": "Looking forward to speaking with the team.",
            },
        )
        assert book_res.status_code == 201
        interview = book_res.json()
        assert interview["candidate_name"] == "Alexander Hayes"
        assert interview["meet_link"].startswith("https://meet.google.com/")
        assert interview["status"] == "scheduled"

    # Recruiter views scheduled interview in calendar
    iv_list = client.get("/api/v1/scheduling/interviews", headers=headers)
    assert iv_list.status_code == 200
    interviews = iv_list.json()
    assert len(interviews) >= 1
    assert any(iv["candidate_name"] == "Alexander Hayes" for iv in interviews)
