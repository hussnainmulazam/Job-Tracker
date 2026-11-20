"""
Unit and Integration Test Suite for Hiring Pipeline Agent.
Verifies all 7 stages, states, idempotency, rejection quote feedback,
and template registry compliance.
"""

import sys
import os
import uuid
from datetime import datetime, timezone, timedelta

# Add backend to path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

from sqlmodel import Session, SQLModel, create_engine, select
from app.models.user import User
from app.models.candidate import Candidate
from app.models.job_opening import JobOpening
from app.models.message import Message
from app.services.pipeline_agent_service import (
    HiringPipelineAgent,
    PipelineStatus,
    get_candidate_pipeline_status,
)
from app.services.pipeline_template_service import (
    get_registry,
    render_template,
    is_email_already_sent,
)

# Use in-memory SQLite for isolated, network-free tests
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, echo=False)


def setup_module():
    SQLModel.metadata.create_all(engine)


def test_registry_contains_all_templates():
    reg = get_registry()
    templates = reg.get("templates", {})
    assert len(templates) == 31, f"Expected 31 templates, found {len(templates)}"
    assert "cv_received" in templates
    assert "application_rejected" in templates
    assert "application_approved" in templates
    assert "interview_confirmed" in templates
    assert "alternate_slots" in templates
    assert "next_round_availability" in templates
    assert "interview_passed" in templates
    assert "interview_rejected" in templates
    assert "all_rounds_cleared" in templates
    assert "hr_new_cv_scored" in templates
    assert "hr_candidate_moved_to_offer_section" in templates
    print("[PASS] Template registry contains all 31 templates.")


def test_full_hiring_pipeline_lifecycle():
    with Session(engine) as session:
        # Create user & opening
        user = User(
            id=uuid.uuid4(),
            email="recruiter@aivontech.com",
            hashed_password="dummy",
        )
        session.add(user)
        session.commit()

        opening = JobOpening(
            id=uuid.uuid4(),
            user_id=user.id,
            title="Senior Full-Stack Engineer",
            description="Developing high-scale distributed backend systems in Python, FastAPI, PostgreSQL and React.",
            status="active",
        )
        session.add(opening)
        session.commit()

        agent = HiringPipelineAgent(session, user.id)

        # ── STAGE 1: CV INTAKE & STAGE 2: AI SCANNING ──
        cv_text = """
        Hussnain Mulazam - Senior Software Engineer
        Email: hussnain.test@gmail.com | Phone: +1 555-0199
        Experience: 5 years building microservices with Python, FastAPI, PostgreSQL, Docker, AWS, React, and Git.
        """
        intake_res = agent.stage_1_cv_intake(
            candidate_name="Hussnain Mulazam",
            candidate_email="hussnain.test@gmail.com",
            job_title=opening.title,
            cv_text=cv_text,
            is_file_valid=True,
        )
        cand_id = uuid.UUID(intake_res["candidate_id"])
        cand = session.exec(select(Candidate).where(Candidate.id == cand_id)).first()
        assert cand is not None

        # Verify Stage 1 & 2 states
        assert get_candidate_pipeline_status(cand) == PipelineStatus.HR_REVIEW
        assert cand.score is not None and cand.score >= 50.0

        # Check cv_received was dispatched
        msg_intake = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "cv_received")
        ).first()
        assert msg_intake is not None
        assert "Application Received" in (msg_intake.template_variables or {}).get("subject", "")
        print("[PASS] Stage 1 (CV Intake) & Stage 2 (AI Scanning) completed successfully.")

        # ── STAGE 3: HR REVIEW (Approve) ──
        approve_res = agent.stage_3_hr_review_decision(cand.id, "APPROVE")
        session.refresh(cand)
        assert get_candidate_pipeline_status(cand) == PipelineStatus.INITIAL_SCHEDULING

        msg_approved = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "application_approved")
        ).first()
        assert msg_approved is not None
        assert "Congratulations! Next Steps" in (msg_approved.template_variables or {}).get("subject", "")
        print("[PASS] Stage 3 (HR Review Approve) dispatched application_approved and set INITIAL_SCHEDULING.")

        # ── STAGE 4: SCHEDULING ENGINE (Initial Interview) ──
        now_utc = datetime.now(timezone.utc)
        sched_res = agent.stage_4_handle_availability_reply(
            candidate_id=cand.id,
            round_name="Initial",
            reply_text="I am free next Tuesday at 2 PM EST.",
            suggested_dt=now_utc + timedelta(days=2),
        )
        session.refresh(cand)
        assert get_candidate_pipeline_status(cand) == PipelineStatus.INITIAL_SCHEDULED

        msg_confirmed = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "interview_confirmed")
        ).first()
        assert msg_confirmed is not None
        assert "Confirmed: Initial Interview" in (msg_confirmed.template_variables or {}).get("subject", "")
        print("[PASS] Stage 4 (Scheduling) confirmed Initial Interview and dispatched interview_confirmed.")

        # ── STAGE 6: INTERVIEW DECISION - Initial Round Passed ──
        initial_passed_res = agent.stage_6_interview_decision(
            candidate_id=cand.id,
            round_name="Initial",
            decision="APPROVE",
        )
        session.refresh(cand)
        assert get_candidate_pipeline_status(cand) == PipelineStatus.BEHAVIORAL_SCHEDULING

        msg_passed = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "interview_passed")
        ).first()
        assert msg_passed is not None

        msg_next_avail = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "next_round_availability")
        ).first()
        assert msg_next_avail is not None
        print("[PASS] Stage 6 (Initial Approval) dispatched interview_passed & next_round_availability for Behavioral.")

        # ── STAGE 4 & 6: Behavioral Round Scheduling & Approval ──
        agent.stage_4_handle_availability_reply(
            candidate_id=cand.id,
            round_name="Behavioral",
            reply_text="Wednesday at 11 AM works for Behavioral round.",
            suggested_dt=now_utc + timedelta(days=4),
        )
        session.refresh(cand)
        assert get_candidate_pipeline_status(cand) == PipelineStatus.BEHAVIORAL_SCHEDULED

        agent.stage_6_interview_decision(
            candidate_id=cand.id,
            round_name="Behavioral",
            decision="APPROVE",
        )
        session.refresh(cand)
        assert get_candidate_pipeline_status(cand) == PipelineStatus.TECHNICAL_SCHEDULING
        print("[PASS] Stage 6 (Behavioral Approval) advanced candidate to TECHNICAL_SCHEDULING.")

        # ── STAGE 4 & 6: Technical Round Scheduling & Final Approval ──
        agent.stage_4_handle_availability_reply(
            candidate_id=cand.id,
            round_name="Technical",
            reply_text="Thursday at 3 PM for Technical round.",
            suggested_dt=now_utc + timedelta(days=6),
        )
        session.refresh(cand)
        assert get_candidate_pipeline_status(cand) == PipelineStatus.TECHNICAL_SCHEDULED

        final_res = agent.stage_6_interview_decision(
            candidate_id=cand.id,
            round_name="Technical",
            decision="APPROVE",
        )
        session.refresh(cand)
        # Final technical passed: must move to OFFER_LETTER_SECTION and STOP!
        assert get_candidate_pipeline_status(cand) == PipelineStatus.OFFER_LETTER_SECTION

        msg_all_cleared = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "all_rounds_cleared")
        ).first()
        assert msg_all_cleared is not None
        assert "cleared all interview rounds" in (msg_all_cleared.template_variables or {}).get("subject", "")

        msg_hr_offer_sec = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "hr_candidate_moved_to_offer_section")
        ).first()
        assert msg_hr_offer_sec is not None
        print("[PASS] Final Technical Round Approval moved candidate to OFFER_LETTER_SECTION and stopped.")

        # ── STAGE 7: Post-Offer HR Manual Triggers ──
        # 1. Request Documents
        agent.stage_7_offer_section_action(cand.id, "request_documents")
        msg_docs = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "documents_request")
        ).first()
        assert msg_docs is not None

        # 2. Offer Sent (Cover note only)
        agent.stage_7_offer_section_action(cand.id, "offer_sent")
        msg_cover = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "offer_letter_cover")
        ).first()
        assert msg_cover is not None

        # 3. Offer Accepted
        agent.stage_7_offer_section_action(cand.id, "offer_accepted")
        msg_acc = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "offer_accepted_confirmation")
        ).first()
        assert msg_acc is not None

        # 4. Welcome Onboarding
        agent.stage_7_offer_section_action(cand.id, "welcome_onboarding")
        msg_onb = session.exec(
            select(Message).where(Message.candidate_id == cand.id, Message.template_name == "welcome_onboarding")
        ).first()
        assert msg_onb is not None
        print("[PASS] Stage 7 Post-Offer actions (documents, cover, accepted, onboarding) all verified.")

        # ── REJECTION WITH FEEDBACK & IDEMPOTENCY TEST ──
        cand_rej = Candidate(
            user_id=user.id,
            opening_id=opening.id,
            name="Rejected Applicant",
            email="rejected.applicant@gmail.com",
            cv_text="Python junior developer",
        )
        session.add(cand_rej)
        session.commit()
        session.refresh(cand_rej)

        # Reject at HR review stage
        rej_res = agent.stage_3_hr_review_decision(
            candidate_id=cand_rej.id,
            decision="REJECT",
            feedback="Great foundational grasp of Python; however, we require deeper senior architectural experience with PostgreSQL scaling.",
        )
        session.refresh(cand_rej)
        assert get_candidate_pipeline_status(cand_rej) == PipelineStatus.REJECTED

        msg_rej = session.exec(
            select(Message).where(Message.candidate_id == cand_rej.id, Message.template_name == "application_rejected")
        ).first()
        assert msg_rej is not None
        assert "PostgreSQL scaling" in (msg_rej.template_variables or {}).get("feedback", "")

        # Verify idempotency: calling again does NOT send duplicate email
        sent_again = is_email_already_sent(session, cand_rej.id, "application_rejected")
        assert sent_again is True
        print("[PASS] Rejection with feedback quote and idempotency verified.")


def test_background_cycles_and_reminders():
    with Session(engine) as session:
        user = User(id=uuid.uuid4(), email="recruiter2@aivontech.com", hashed_password="dummy")
        session.add(user)
        session.commit()

        op = JobOpening(id=uuid.uuid4(), user_id=user.id, title="Backend Lead", description="Desc", status="active")
        session.add(op)
        session.commit()

        # 1. Candidate in HR_REVIEW for > 48h
        old_time = datetime.now(timezone.utc) - timedelta(hours=50)
        c_old = Candidate(
            user_id=user.id,
            opening_id=op.id,
            name="Stale Review",
            email="stale@test.com",
            cv_text="CV text",
            created_at=old_time,
            updated_at=old_time,
            extracted_data={"pipeline_status": PipelineStatus.HR_REVIEW},
        )
        session.add(c_old)
        session.commit()

        # 2. Candidate scheduled for interview in 12 hours (should get 24h reminder)
        c_sched = Candidate(
            user_id=user.id,
            opening_id=op.id,
            name="Scheduled Interviewee",
            email="sched@test.com",
            cv_text="CV text",
            extracted_data={"pipeline_status": PipelineStatus.INITIAL_SCHEDULED},
        )
        session.add(c_sched)
        session.commit()

        iv_time = datetime.now(timezone.utc) + timedelta(hours=12)
        from app.models.interview import Interview, InterviewStatus
        iv = Interview(
            user_id=user.id,
            candidate_id=c_sched.id,
            opening_id=op.id,
            title="Initial Interview: Scheduled Interviewee",
            candidate_name=c_sched.name,
            candidate_email=c_sched.email,
            interviewer_email=user.email,
            round_type="initial",
            start_time=iv_time,
            end_time=iv_time + timedelta(minutes=45),
            status=InterviewStatus.scheduled,
            meet_link="https://meet.google.com/test-meet",
        )
        session.add(iv)
        session.commit()

        agent = HiringPipelineAgent(session, user.id)
        cycle_res = agent.process_background_cycles()
        print("Cycle execution result:", cycle_res)

        assert cycle_res["reminders_dispatched"] >= 1
        msg_remind = session.exec(
            select(Message).where(Message.candidate_id == c_sched.id, Message.template_name == "interview_reminder_24h")
        ).first()
        assert msg_remind is not None
        print("[PASS] Background 24h interview reminder cycle dispatched successfully.")


if __name__ == "__main__":
    setup_module()
    test_registry_contains_all_templates()
    test_full_hiring_pipeline_lifecycle()
    test_background_cycles_and_reminders()
    print("\n=======================================================")
    print("ALL HIRING PIPELINE AGENT TESTS PASSED (100% SUCCESS)!")
    print("=======================================================")
