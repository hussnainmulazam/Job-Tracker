"""
tests/test_onboarding.py
~~~~~~~~~~~~~~~~~~~~~~~~
Integration tests for /api/v1/onboarding:
- Step 1: HR and company profile
- Step 2: First job opening with JD
- Step 3: Weekly availability and round lengths
- Step 4: Email templates
- Resuming later & DB persistence
- 'Start Agent' button gated until all 4 steps are complete
"""
import pytest
from fastapi.testclient import TestClient


def test_onboarding_initial_state(client: TestClient, user_a: dict):
    res = client.get("/api/v1/onboarding", headers=user_a["headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["total_steps"] == 4
    assert data["can_start_agent"] is False
    assert data["agent_started"] is False


def test_start_agent_gated_when_incomplete(client: TestClient, user_a: dict):
    res = client.post("/api/v1/onboarding/start-agent", headers=user_a["headers"])
    assert res.status_code == 400
    assert "Start Agent is disabled" in res.json()["detail"]


def test_onboarding_four_steps_flow(client: TestClient, user_a: dict):
    # Step 1: Save HR & Company Profile
    step1_payload = {
        "hr_name": "Sarah Recruiter",
        "company_name": "Nexus Dynamics",
        "hr_role": "Head of Talent Acquisition",
        "email_tone": "warm_professional",
        "signature": "Best regards,\nSarah Recruiter\nNexus Dynamics",
    }
    r1 = client.post("/api/v1/onboarding/step/1", json=step1_payload, headers=user_a["headers"])
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["step_1"]["completed"] is True
    assert d1["step_1"]["hr_name"] == "Sarah Recruiter"
    assert d1["completed_steps_count"] >= 1
    assert d1["can_start_agent"] is False

    # Step 2: Save First Job Opening with JD
    step2_payload = {
        "job_title": "Lead Backend Systems Engineer",
        "job_description": "We are seeking a senior engineer with deep expertise in Python, distributed systems, and PostgreSQL.",
        "required_skills": ["Python", "PostgreSQL", "FastAPI", "Docker"],
        "years_of_experience": 5.0,
    }
    r2 = client.post("/api/v1/onboarding/step/2", json=step2_payload, headers=user_a["headers"])
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["step_2"]["completed"] is True
    assert d2["step_2"]["job_title"] == "Lead Backend Systems Engineer"
    assert d2["step_2"]["job_opening_id"] is not None

    # Step 3: Save Weekly Availability & Round Lengths
    step3_payload = {
        "timezone": "Asia/Karachi",
        "slot_duration_minutes": 30,
        "buffer_minutes": 15,
        "weekly_hours": {
            "mon": [{"start": "10:00", "end": "18:00"}],
            "tue": [{"start": "10:00", "end": "18:00"}],
            "wed": [{"start": "10:00", "end": "18:00"}],
            "thu": [{"start": "10:00", "end": "18:00"}],
            "fri": [{"start": "10:00", "end": "16:00"}],
        },
        "interview_rounds": [
            {"round_name": "Technical Screen", "duration_minutes": 30},
            {"round_name": "System Architecture", "duration_minutes": 45},
            {"round_name": "Culture Fit", "duration_minutes": 30},
        ],
    }
    r3 = client.post("/api/v1/onboarding/step/3", json=step3_payload, headers=user_a["headers"])
    assert r3.status_code == 200
    d3 = r3.json()
    assert d3["step_3"]["completed"] is True
    assert d3["step_3"]["slot_duration_minutes"] == 30

    # Step 4: Save Email Templates
    step4_payload = {
        "templates": {
            "initial_message": {
                "subject": "Application Received: {{job_title}} at {{company_name}}",
                "body": "Hi {{candidate_name}}, thank you for applying. We are reviewing your CV.",
            },
            "interview_invitation": {
                "subject": "Interview Invitation: {{job_title}} at {{company_name}}",
                "body": "Hi {{candidate_name}}, please schedule your interview via {{booking_link}}.",
            },
            "offer_letter": {
                "subject": "Offer of Employment: {{job_title}} at {{company_name}}",
                "body": "Dear {{candidate_name}}, we are thrilled to offer you the position!",
            },
            "rejection": {
                "subject": "Update on your application for {{job_title}} at {{company_name}}",
                "body": "Hi {{candidate_name}}, thank you for interviewing. We decided to proceed with another candidate.",
            },
        }
    }
    r4 = client.post("/api/v1/onboarding/step/4", json=step4_payload, headers=user_a["headers"])
    assert r4.status_code == 200
    d4 = r4.json()
    assert d4["step_4"]["completed"] is True
    assert d4["can_start_agent"] is True
    assert d4["progress_percentage"] == 100

    # Now Start Agent is enabled and succeeds
    r_start = client.post("/api/v1/onboarding/start-agent", headers=user_a["headers"])
    assert r_start.status_code == 200
    start_data = r_start.json()
    assert start_data["agent_started"] is True
    assert start_data["status"] == "active"

    # Status persists and reflects agent_started
    r_final = client.get("/api/v1/onboarding", headers=user_a["headers"])
    assert r_final.status_code == 200
    assert r_final.json()["agent_started"] is True
    assert r_final.json()["is_completed"] is True


def test_generate_and_preview_templates_flow(client: TestClient, user_a: dict):
    # 1. Generate all 11 lifecycle templates
    gen_payload = {
        "hr_name": "Sarah Recruiter",
        "company_name": "Nexus Dynamics",
        "hr_role": "Head of Talent",
        "email_tone": "warm_professional",
    }
    r_gen = client.post("/api/v1/onboarding/generate-templates", json=gen_payload, headers=user_a["headers"])
    assert r_gen.status_code == 200
    gen_data = r_gen.json()

    expected_keys = [
        "cv_received",
        "cv_passed",
        "job_details",
        "initial_interview",
        "initial_passed",
        "behavioral_interview",
        "behavioral_passed",
        "final_interview",
        "offer_letter",
        "rejection",
        "interview_reminder",
    ]
    for key in expected_keys:
        assert key in gen_data["templates"], f"Expected template key {key} in generated templates"
        tmpl = gen_data["templates"][key]
        assert tmpl["subject"] and len(tmpl["subject"]) > 0
        assert tmpl["body"] and len(tmpl["body"]) > 0

    # 2. Regenerate single template
    r_single = client.post(
        "/api/v1/onboarding/generate-templates",
        json={"single_template_key": "interview_reminder"},
        headers=user_a["headers"],
    )
    assert r_single.status_code == 200
    single_data = r_single.json()
    assert "interview_reminder" in single_data["templates"]
    assert "cv_received" in single_data["templates"]

    # 3. Deterministic preview with variable interpolation (never calls AI)
    preview_payload = {
        "subject": "Interview for {role} at {company}",
        "body": "Hi {candidate_name}, your interview is scheduled on {interview_date} at {interview_time}. Join: {meet_link}",
        "candidate_name": "Jordan Smith",
        "role": "Principal Engineer",
        "company": "Nexus Dynamics",
        "interview_date": "Monday, Dec 1",
        "interview_time": "3:00 PM EST",
        "meet_link": "https://meet.google.com/xyz-uvw-rst",
    }
    r_prev = client.post("/api/v1/onboarding/preview-template", json=preview_payload, headers=user_a["headers"])
    assert r_prev.status_code == 200
    prev_data = r_prev.json()
    assert prev_data["resolved_subject"] == "Interview for Principal Engineer at Nexus Dynamics"
    assert "Hi Jordan Smith" in prev_data["resolved_body"]
    assert "Monday, Dec 1 at 3:00 PM EST" in prev_data["resolved_body"]
    assert "https://meet.google.com/xyz-uvw-rst" in prev_data["resolved_body"]

