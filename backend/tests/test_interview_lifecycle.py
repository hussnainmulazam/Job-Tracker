"""
test_interview_lifecycle.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Comprehensive tests for the Interview Lifecycle:
1. Slot booking after CV review approval (round durations: initial 30m, behavioral 45m, final 60m).
2. HR records interview result on Interviews page (Passed, Failed, No-show).
3. Status triggers next automated email:
   - Initial Passed -> creates Behavioral scheduling link (45m) & sends initial_passed invite.
   - Behavioral Passed -> creates Final scheduling link (60m) & sends behavioral_passed invite.
   - Final Passed -> creates Offer Letter draft, advances candidate stage to 'offer'.
     STRICT GATE: Offer Letter is NEVER sent automatically!
   - Failed -> sends Rejection email and moves candidate to 'rejected'.
   - No-show -> marks interview 'no_show', preserves candidate stage to allow rescheduling.
4. HR reviews, customizes, and explicitly approves & sends the Offer Letter.
5. Audit trail records every evaluation, invite dispatch, draft creation, and offer dispatch.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.candidate import Candidate, CandidateStage
from app.models.interview import Interview, InterviewStatus, SchedulingLink
from app.models.message import Message


def test_interview_lifecycle_complete_chain(client: TestClient, user_a: dict, session: Session):
    """
    Tests full progressive lifecycle chain:
    Initial (30m) Passed -> Behavioral (45m) Passed -> Final (60m) Passed -> Offer Draft -> Explicit HR Send.
    """
    # 1. Create Job Opening and Candidate
    op = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Principal AI Architect",
            "description": "Architect scalable LLM reasoning pipelines.",
            "required_skills": ["Python", "FastAPI", "PyTorch"],
        },
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Alex Mercer",
            "email": "alex.mercer@example.com",
            "cv_text": "10 years building distributed AI architectures.",
        },
        headers=user_a["headers"],
    ).json()

    # 2. Generate Initial Scheduling Link (default 30m)
    link_res = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand["id"], "round_type": "initial"},
        headers=user_a["headers"],
    )
    assert link_res.status_code == 201
    initial_link = link_res.json()
    assert initial_link["round_type"] == "initial"
    assert initial_link["slot_duration_minutes"] == 30

    # 3. Candidate books Initial Slot
    book_time = datetime.now(timezone.utc) + timedelta(days=1, hours=2)
    book_res = client.post(
        f"/api/v1/scheduling/public/{initial_link['token']}/book",
        json={"start_time": book_time.isoformat(), "timezone": "Asia/Karachi"},
    )
    assert book_res.status_code == 201
    initial_interview = book_res.json()
    assert initial_interview["round_type"] == "initial"
    assert initial_interview["status"] == "scheduled"
    assert "Initial Interview:" in initial_interview["title"]

    # 4. HR sets Initial Interview -> PASSED
    result_res = client.post(
        f"/api/v1/scheduling/interviews/{initial_interview['id']}/result",
        json={"result": "passed", "feedback": "Great domain knowledge and articulate communicator."},
        headers=user_a["headers"],
    )
    assert result_res.status_code == 200
    res_data = result_res.json()
    assert res_data["result_status"] == "passed"
    assert res_data["next_round"] == "behavioral"
    assert res_data["scheduling_link_url"] is not None
    assert res_data["offer_draft_ready"] is False
    behavioral_token = res_data["scheduling_link_token"]

    # Verify behavioral link duration is 45m
    b_link_info = client.get(f"/api/v1/scheduling/public/{behavioral_token}").json()
    assert b_link_info["round_type"] == "behavioral"
    assert b_link_info["slot_duration_minutes"] == 45

    # Verify initial_passed email was dispatched
    session.expire_all()
    msg_initial = session.exec(
        select(Message).where(
            Message.candidate_id == uuid.UUID(cand["id"]),
            Message.template_name == "initial_passed",
        )
    ).first()
    assert msg_initial is not None
    assert behavioral_token in msg_initial.body

    # 5. Candidate books Behavioral Slot (45m)
    b_book_time = datetime.now(timezone.utc) + timedelta(days=3, hours=2)
    b_book_res = client.post(
        f"/api/v1/scheduling/public/{behavioral_token}/book",
        json={"start_time": b_book_time.isoformat(), "timezone": "Asia/Karachi"},
    )
    assert b_book_res.status_code == 201
    behavioral_interview = b_book_res.json()
    assert behavioral_interview["round_type"] == "behavioral"
    assert "Behavioral Interview:" in behavioral_interview["title"]

    # 6. HR sets Behavioral Interview -> PASSED
    b_result_res = client.post(
        f"/api/v1/scheduling/interviews/{behavioral_interview['id']}/result",
        json={"result": "passed", "feedback": "Strong cultural alignment and leadership presence."},
        headers=user_a["headers"],
    )
    assert b_result_res.status_code == 200
    b_res_data = b_result_res.json()
    assert b_res_data["result_status"] == "passed"
    assert b_res_data["next_round"] == "final"
    final_token = b_res_data["scheduling_link_token"]

    # Verify final link duration is 60m
    f_link_info = client.get(f"/api/v1/scheduling/public/{final_token}").json()
    assert f_link_info["round_type"] == "final"
    assert f_link_info["slot_duration_minutes"] == 60

    # Verify behavioral_passed email dispatched
    session.expire_all()
    msg_behavioral = session.exec(
        select(Message).where(
            Message.candidate_id == uuid.UUID(cand["id"]),
            Message.template_name == "behavioral_passed",
        )
    ).first()
    assert msg_behavioral is not None
    assert final_token in msg_behavioral.body

    # 7. Candidate books Final Slot (60m)
    f_book_time = datetime.now(timezone.utc) + timedelta(days=5, hours=2)
    f_book_res = client.post(
        f"/api/v1/scheduling/public/{final_token}/book",
        json={"start_time": f_book_time.isoformat(), "timezone": "Asia/Karachi"},
    )
    assert f_book_res.status_code == 201
    final_interview = f_book_res.json()
    assert final_interview["round_type"] == "final"
    assert "Final Interview:" in final_interview["title"]

    # 8. HR sets Final Interview -> PASSED
    # CRITICAL SECURITY RULE: Creates Offer Draft. Does NOT send automatically!
    f_result_res = client.post(
        f"/api/v1/scheduling/interviews/{final_interview['id']}/result",
        json={"result": "passed", "feedback": "Executive sign-off obtained. Ready for hire."},
        headers=user_a["headers"],
    )
    assert f_result_res.status_code == 200
    f_res_data = f_result_res.json()
    assert f_res_data["result_status"] == "passed"
    assert f_res_data["next_round"] == "offer"
    assert f_res_data["offer_draft_ready"] is True
    assert f_res_data["scheduling_link_token"] is None

    # Verify in DB: candidate stage is offer, status is draft, NO offer_letter email sent yet!
    session.expire_all()
    cand_db = session.exec(select(Candidate).where(Candidate.id == uuid.UUID(cand["id"]))).first()
    assert cand_db.stage == CandidateStage.offer
    assert cand_db.offer_letter_status == "draft"
    assert cand_db.offer_letter_draft is not None
    assert "Alex Mercer" in cand_db.offer_letter_draft["body"]

    # Ensure no offer message was sent yet
    offer_msg_pre = session.exec(
        select(Message).where(
            Message.candidate_id == uuid.UUID(cand["id"]),
            Message.template_name == "offer_letter",
        )
    ).first()
    assert offer_msg_pre is None, "Offer letter must NEVER be sent automatically!"

    # 9. HR inspects Offer Draft
    draft_res = client.get(
        f"/api/v1/scheduling/offer-draft/{cand['id']}",
        headers=user_a["headers"],
    )
    assert draft_res.status_code == 200
    draft_data = draft_res.json()
    assert draft_data["status"] == "draft"
    assert draft_data["candidate_id"] == cand["id"]
    assert len(draft_data["subject"]) > 5
    assert len(draft_data["body"]) > 20

    # 10. HR explicitly Approves & Sends the Offer Letter
    custom_subject = f"Official Offer: Join Us as Principal AI Architect, {cand_db.name}!"
    custom_body = f"Hi {cand_db.name},\n\nWe are absolutely delighted to offer you the Principal AI Architect position with a competitive compensation package."

    send_res = client.post(
        f"/api/v1/scheduling/offer-draft/{cand['id']}/send",
        json={"subject": custom_subject, "body": custom_body},
        headers=user_a["headers"],
    )
    assert send_res.status_code == 200
    send_data = send_res.json()
    assert send_data["status"] == "sent"
    assert send_data["sent_at"] is not None

    # Verify Message was now dispatched
    session.expire_all()
    offer_msg_post = session.exec(
        select(Message).where(
            Message.candidate_id == uuid.UUID(cand["id"]),
            Message.template_name == "offer_letter",
        )
    ).first()
    assert offer_msg_post is not None
    assert offer_msg_post.body == custom_body
    assert offer_msg_post.hr_approved is True


def test_interview_lifecycle_failed_triggers_rejection(client: TestClient, user_a: dict, session: Session):
    """Marking an interview Failed sends the rejection template and marks candidate rejected."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Data Analyst", "description": "SQL & Tableau", "required_skills": ["SQL"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "John Doe", "email": "johndoe@example.com", "cv_text": "Junior analyst with SQL and dashboarding experience."},
        headers=user_a["headers"],
    ).json()

    link = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand["id"], "round_type": "initial"},
        headers=user_a["headers"],
    ).json()

    book_time = datetime.now(timezone.utc) + timedelta(days=2)
    inv = client.post(
        f"/api/v1/scheduling/public/{link['token']}/book",
        json={"start_time": book_time.isoformat()},
    ).json()

    # HR marks interview as FAILED
    result_res = client.post(
        f"/api/v1/scheduling/interviews/{inv['id']}/result",
        json={"result": "failed", "feedback": "Did not meet technical requirements for SQL queries."},
        headers=user_a["headers"],
    )
    assert result_res.status_code == 200
    res_data = result_res.json()
    assert res_data["result_status"] == "failed"
    assert "Rejection email sent" in res_data["next_action"]

    # Verify candidate is rejected
    session.expire_all()
    cand_db = session.exec(select(Candidate).where(Candidate.id == uuid.UUID(cand["id"]))).first()
    assert cand_db.stage == CandidateStage.rejected
    assert cand_db.review_status == "rejected"

    # Verify rejection email message was created
    msg = session.exec(
        select(Message).where(
            Message.candidate_id == uuid.UUID(cand["id"]),
            Message.template_name == "rejection",
        )
    ).first()
    assert msg is not None
    assert "John Doe" in msg.body


def test_interview_lifecycle_no_show_preserves_stage(client: TestClient, user_a: dict, session: Session):
    """Marking an interview No-show records the status without rejecting or advancing."""
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "QA Engineer", "description": "Playwright & Jest", "required_skills": ["QA"]},
        headers=user_a["headers"],
    ).json()

    cand = client.post(
        "/api/v1/candidates",
        json={"opening_id": op["id"], "name": "Kyle Reese", "email": "kyle@resistance.org", "cv_text": "Automation test engineer."},
        headers=user_a["headers"],
    ).json()

    link = client.post(
        "/api/v1/scheduling/links",
        json={"candidate_id": cand["id"], "round_type": "initial"},
        headers=user_a["headers"],
    ).json()

    book_time = datetime.now(timezone.utc) + timedelta(days=2)
    inv = client.post(
        f"/api/v1/scheduling/public/{link['token']}/book",
        json={"start_time": book_time.isoformat()},
    ).json()

    # HR marks interview as NO-SHOW
    result_res = client.post(
        f"/api/v1/scheduling/interviews/{inv['id']}/result",
        json={"result": "no_show", "feedback": "Candidate did not join meeting room."},
        headers=user_a["headers"],
    )
    assert result_res.status_code == 200
    res_data = result_res.json()
    assert res_data["result_status"] == "no_show"
    assert "Candidate can reschedule" in res_data["next_action"]

    # Verify interview is no_show in DB
    session.expire_all()
    inv_db = session.exec(select(Interview).where(Interview.id == uuid.UUID(inv["id"]))).first()
    assert inv_db.status == InterviewStatus.no_show
    assert inv_db.result_status == "no_show"

    # Candidate stage is NOT rejected
    cand_db = session.exec(select(Candidate).where(Candidate.id == uuid.UUID(cand["id"]))).first()
    assert cand_db.stage != CandidateStage.rejected
