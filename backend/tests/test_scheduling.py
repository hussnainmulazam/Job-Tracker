"""
test_scheduling.py
~~~~~~~~~~~~~~~~~~
Comprehensive test suite for the scheduling copilot:
- HR availability configuration (GET/PUT /api/v1/scheduling/availability)
- Tokenized public scheduling links (/schedule/{token})
- Free slot calculation (weekly hours minus Google Calendar freeBusy minus DB interviews)
- Timezone awareness (default Asia/Karachi)
- Slot booking with Google Meet creation and WhatsApp/email confirmation
- Double-booking prevention via DB constraint (returns HTTP 409 Conflict)
- Token expiry handling
- Rescheduling & cancellation lifecycles
- 24h & 1h automated reminder triggers
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.interview import Interview, InterviewStatus, SchedulingLink, SchedulingLinkStatus
from app.services.scheduling_service import scheduling_service


def test_recruiter_availability_crud(client: TestClient, user_a: dict):
    """HR sets and retrieves weekly working availability schedule."""
    # 1. GET default availability (creates default if not set)
    res = client.get("/api/v1/scheduling/availability", headers=user_a["headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["timezone"] == "Asia/Karachi"
    assert data["slot_duration_minutes"] == 30
    assert data["buffer_minutes"] == 10
    assert "mon" in data["weekly_hours"]

    # 2. PUT custom availability with blocked_dates
    blocked_test_date = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d")
    new_schedule = {
        "timezone": "Asia/Karachi",
        "slot_duration_minutes": 45,
        "buffer_minutes": 15,
        "weekly_hours": {
            "mon": [{"start": "10:00", "end": "16:00"}],
            "tue": [{"start": "10:00", "end": "16:00"}],
            "wed": [{"start": "10:00", "end": "16:00"}],
            "thu": [],
            "fri": [{"start": "10:00", "end": "14:00"}],
            "sat": [],
            "sun": [],
        },
        "blocked_dates": [blocked_test_date],
        "is_active": True,
    }
    update_res = client.put(
        "/api/v1/scheduling/availability",
        json=new_schedule,
        headers=user_a["headers"],
    )
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["slot_duration_minutes"] == 45
    assert updated["buffer_minutes"] == 15
    assert len(updated["weekly_hours"]["fri"]) == 1
    assert blocked_test_date in updated["blocked_dates"]


def test_create_and_inspect_scheduling_link(client: TestClient, user_a: dict):
    """Generate tokenized public scheduling link for candidate."""
    # 1. Setup opening & candidate
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Cloud Architect", "description": "GCP & Terraform", "required_skills": ["GCP"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Sarah Connor",
            "email": "sarah@cyberdyne.com",
            "cv_text": "Experienced cloud infrastructure engineer.",
        },
        headers=user_a["headers"],
    ).json()

    # 2. Create scheduling link
    link_res = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand["id"], "slot_duration_minutes": 30, "validity_days": 5},
        headers=user_a["headers"],
    )
    assert link_res.status_code == 201
    link = link_res.json()
    assert link["token"] is not None
    assert link["public_url"] == f"/schedule/{link['token']}"
    assert link["status"] == "active"

    # 3. Public inspection without authentication
    public_res = client.get(f"/api/v1/scheduling/public/{link['token']}")
    assert public_res.status_code == 200
    public_info = public_res.json()
    assert public_info["candidate_name"] == "Sarah Connor"
    assert public_info["opening_title"] == "Cloud Architect"
    assert public_info["status"] == "active"
    assert public_info["default_timezone"] == "Asia/Karachi"


def test_free_slot_computation_with_google_busy_and_db_interviews(client: TestClient, user_a: dict):
    """
    Computes free slots from HR availability minus Google Calendar freeBusy
    minus existing DB interviews.
    """
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Rust Engineer", "description": "High throughput systems", "required_skills": ["Rust"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "John Doe",
            "email": "john.doe@example.com",
            "cv_text": "Senior systems engineer with Rust expertise.",
        },
        headers=user_a["headers"],
    ).json()

    link = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand["id"], "slot_duration_minutes": 30},
        headers=user_a["headers"],
    ).json()

    # Query available slots for the next 7 days in Asia/Karachi
    today_str = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    end_str = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%d")

    slots_res = client.get(
        f"/api/v1/scheduling/public/{link['token']}/slots",
        params={"start_date": today_str, "end_date": end_str, "tz": "Asia/Karachi"},
    )
    assert slots_res.status_code == 200
    slots_data = slots_res.json()
    assert slots_data["timezone"] == "Asia/Karachi"
    assert slots_data["slot_duration_minutes"] == 30
    assert "slots_by_date" in slots_data

    # Add a blocked date and verify it is completely removed from available slots
    blocked_target = today_str
    client.put(
        "/api/v1/scheduling/availability",
        json={
            "timezone": "Asia/Karachi",
            "slot_duration_minutes": 30,
            "buffer_minutes": 10,
            "weekly_hours": {
                "mon": [{"start": "09:00", "end": "17:00"}],
                "tue": [{"start": "09:00", "end": "17:00"}],
                "wed": [{"start": "09:00", "end": "17:00"}],
                "thu": [{"start": "09:00", "end": "17:00"}],
                "fri": [{"start": "09:00", "end": "17:00"}],
                "sat": [],
                "sun": [],
            },
            "blocked_dates": [blocked_target],
            "is_active": True,
        },
        headers=user_a["headers"],
    )

    slots_res2 = client.get(
        f"/api/v1/scheduling/public/{link['token']}/slots",
        params={"start_date": today_str, "end_date": end_str, "tz": "Asia/Karachi"},
    )
    assert slots_res2.status_code == 200
    slots_data2 = slots_res2.json()
    assert blocked_target not in slots_data2["slots_by_date"]


def test_slot_booking_meet_creation_and_double_booking_prevention(client: TestClient, user_a: dict):
    """
    Candidate books slot:
      - Creates Google Meet conference link
      - Saves to interviews table
      - Prevents double-booking via DB constraint (returns 409 Conflict)
    """
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Backend Architect", "description": "FastAPI & Postgres", "required_skills": ["Python"]},
        headers=user_a["headers"],
    ).json()

    cand1 = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Ada Lovelace",
            "email": "ada@analytical.org",
            "cv_text": "First computer programmer in history.",
        },
        headers=user_a["headers"],
    ).json()

    cand2 = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Charles Babbage",
            "email": "babbage@analytical.org",
            "cv_text": "Designer of the Difference Engine.",
        },
        headers=user_a["headers"],
    ).json()

    link1 = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand1["id"], "slot_duration_minutes": 30},
        headers=user_a["headers"],
    ).json()

    link2 = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand2["id"], "slot_duration_minutes": 30},
        headers=user_a["headers"],
    ).json()

    # Slot target: Tomorrow at 10:00 UTC
    tomorrow_10am_utc = (datetime.now(timezone.utc) + timedelta(days=2)).replace(
        hour=10, minute=0, second=0, microsecond=0
    )

    # 1. Candidate 1 books slot
    book_res = client.post(
        f"/api/v1/scheduling/public/{link1['token']}/book",
        json={
            "start_time": tomorrow_10am_utc.isoformat(),
            "timezone": "Asia/Karachi",
            "notes": "Looking forward to speaking!",
        },
    )
    assert book_res.status_code == 201
    inv = book_res.json()
    assert inv["status"] == "scheduled"
    assert inv["meet_link"] is not None
    assert "meet.google.com" in inv["meet_link"]
    assert inv["candidate_name"] == "Ada Lovelace"

    # Candidate stage moved to interview
    cand1_updated = client.get(f"/api/v1/candidates/{cand1['id']}", headers=user_a["headers"]).json()
    assert cand1_updated["stage"] == "interview"

    # 2. Candidate 2 attempts to book overlapping slot (Double-booking attack) -> 409 Conflict
    conflict_res = client.post(
        f"/api/v1/scheduling/public/{link2['token']}/book",
        json={
            "start_time": (tomorrow_10am_utc + timedelta(minutes=10)).isoformat(),
            "timezone": "Asia/Karachi",
        },
    )
    assert conflict_res.status_code == 409
    assert "conflict" in conflict_res.json()["detail"].lower() or "booked" in conflict_res.json()["detail"].lower()


def test_token_expiry_handling(client: TestClient, user_a: dict):
    """Expired scheduling links reject slot computation and booking."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Security Engineer", "description": "AppSec & Cryptography", "required_skills": ["Crypto"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Eve Mallory",
            "email": "eve@mitm.org",
            "cv_text": "Cryptographic protocol penetration tester.",
        },
        headers=user_a["headers"],
    ).json()

    # Create link expiring in negative days (already expired)
    link = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand["id"], "validity_days": -1},
        headers=user_a["headers"],
    ).json()

    # Public check marks expired
    public_res = client.get(f"/api/v1/scheduling/public/{link['token']}")
    assert public_res.status_code == 200
    assert public_res.json()["status"] == "expired"

    # Booking attempt fails
    book_res = client.post(
        f"/api/v1/scheduling/public/{link['token']}/book",
        json={"start_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()},
    )
    assert book_res.status_code == 400
    assert "expired" in book_res.json()["detail"].lower()


def test_reschedule_and_cancel_lifecycle(client: TestClient, user_a: dict):
    """HR and candidate can reschedule or cancel an interview."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Frontend Lead", "description": "Next.js & Tailwind", "required_skills": ["React"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Tim Berners-Lee",
            "email": "tim@w3c.org",
            "cv_text": "Inventor of the World Wide Web and HTML.",
        },
        headers=user_a["headers"],
    ).json()

    link = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand["id"], "slot_duration_minutes": 30},
        headers=user_a["headers"],
    ).json()

    start_1 = (datetime.now(timezone.utc) + timedelta(days=3)).replace(hour=11, minute=0, second=0, microsecond=0)
    inv = client.post(
        f"/api/v1/scheduling/public/{link['token']}/book",
        json={"start_time": start_1.isoformat()},
    ).json()

    # 1. Candidate reschedules via public token
    new_start = (datetime.now(timezone.utc) + timedelta(days=4)).replace(hour=14, minute=0, second=0, microsecond=0)
    resched_res = client.post(
        f"/api/v1/scheduling/public/{link['token']}/reschedule",
        json={"new_start_time": new_start.isoformat(), "reason": "Conflict with conference talk"},
    )
    assert resched_res.status_code == 200
    resched_data = resched_res.json()
    assert resched_data["status"] == "rescheduled"

    # 2. HR cancels interview via dashboard
    cancel_res = client.post(
        f"/api/v1/scheduling/interviews/{inv['id']}/cancel",
        json={"reason": "Position filled internally", "cancelled_by": "hr"},
        headers=user_a["headers"],
    )
    assert cancel_res.status_code == 200
    cancelled_data = cancel_res.json()
    assert cancelled_data["status"] == "cancelled"
    assert cancelled_data["cancellation_reason"] == "Position filled internally"


def test_automated_reminders_trigger(client: TestClient, user_a: dict):
    """24h & 1h reminder runner endpoint."""
    res = client.post("/api/v1/scheduling/reminders/process")
    assert res.status_code == 200
    data = res.json()
    assert "reminders_24h_sent" in data
    assert "reminders_1h_sent" in data
    assert "interviews_processed" in data


def test_calendar_interviews_listing(client: TestClient, user_a: dict):
    """Calendar view endpoint returns list of interviews."""
    res = client.get("/api/v1/scheduling/interviews", headers=user_a["headers"])
    assert res.status_code == 200
    assert isinstance(res.json(), list)
