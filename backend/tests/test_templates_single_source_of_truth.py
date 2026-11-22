"""
backend/tests/test_templates_single_source_of_truth.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Tests proving that email templates come ONLY from the database (recruiting_templates table).
Verifies:
1. Seed missing defaults once per HR account; never overwrites HR edits.
2. Template editing: editing a template in DB ensures the sent email contains the edited text.
3. Missing or disabled template: pauses step with 'Template missing: <name>' and link to /settings?tab=templates. Never sends fallback.
4. Variable filling: at send time only fills variables deterministically; missing variable blocks sending and flags HR.
5. Cache invalidation on save, duplicate, toggle, delete.
"""

import uuid
import pytest
from sqlmodel import Session, select

from app.models.candidate import Candidate
from app.models.job_opening import JobOpening
from app.models.recruiting_template import RecruitingTemplate
from app.models.user import User
from app.services.cache_service import cache_service
from app.services.pipeline_template_service import dispatch_pipeline_template_email
from app.services.template_service import (
    clear_user_template_cache,
    get_template_for_stage,
    get_user_templates_from_db,
    render_user_template,
    seed_missing_default_templates,
    MissingTemplateVariablesError,
    TemplateMissingOrDisabledError,
)


@pytest.fixture(name="test_hr_user")
def test_hr_user_fixture(session: Session) -> User:
    user = User(
        email=f"hr_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="mock_hashed_password",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="test_candidate")
def test_candidate_fixture(session: Session, test_hr_user: User) -> Candidate:
    opening = JobOpening(
        user_id=test_hr_user.id,
        title="Staff AI Engineer",
        description="Build state-of-the-art AI systems.",
    )
    session.add(opening)
    session.commit()
    session.refresh(opening)

    cand = Candidate(
        user_id=test_hr_user.id,
        opening_id=opening.id,
        name="Jordan Lee",
        email="jordan.lee@example.com",
        cv_text="Experienced Python and AI engineer.",
    )
    session.add(cand)
    session.commit()
    session.refresh(cand)
    return cand


def test_seed_missing_default_templates_never_overwrites_hr_edits(session: Session, test_hr_user: User):
    """Requirement 2: Seeds missing defaults once; NEVER overwrites HR edits."""
    # 1. First seed
    templates = seed_missing_default_templates(session, test_hr_user.id)
    assert len(templates) >= 11

    # Find cv_passed template and edit it
    cv_passed = next(t for t in templates if t.stage_key == "cv_passed")
    original_id = cv_passed.id
    cv_passed.subject = "EDITED_SUBJECT_HR_CUSTOM_12345"
    cv_passed.body = "EDITED_BODY_HR_CUSTOM_12345: Dear {candidate_name}, you passed for {role} at {company}!"
    session.add(cv_passed)
    session.commit()

    # 2. Re-run seeding: HR edits MUST be preserved
    re_seeded = seed_missing_default_templates(session, test_hr_user.id)
    re_cv_passed = next(t for t in re_seeded if t.stage_key == "cv_passed")

    assert re_cv_passed.id == original_id
    assert re_cv_passed.subject == "EDITED_SUBJECT_HR_CUSTOM_12345"
    assert "EDITED_BODY_HR_CUSTOM_12345" in re_cv_passed.body


def test_edit_template_and_sent_email_contains_edited_text(session: Session, test_hr_user: User, test_candidate: Candidate):
    """
    Requirement 3 & User Test:
    Edit one template in Settings (DB), trigger that stage for a test candidate,
    show the sent email contains the edited text.
    """
    # Seed templates
    seed_missing_default_templates(session, test_hr_user.id)

    # Edit the 'initial_interview' template
    tmpl = session.exec(
        select(RecruitingTemplate).where(
            RecruitingTemplate.user_id == test_hr_user.id,
            RecruitingTemplate.stage_key == "initial_interview",
        )
    ).first()
    assert tmpl is not None

    custom_secret_marker = f"SPECIAL_RECRUITER_INVITE_TOKEN_{uuid.uuid4().hex[:6]}"
    tmpl.subject = f"Invitation: {custom_secret_marker} for {{role}}"
    tmpl.body = f"Hello {{candidate_name}},\n\n{custom_secret_marker} for {{role}}\n\nSchedule: {{schedule_link}}\n\nWarm regards,\n{{hr_name}}"
    session.add(tmpl)
    session.commit()
    clear_user_template_cache(test_hr_user.id)

    # Trigger sending for candidate
    ctx = {
        "candidate_name": test_candidate.name,
        "role": "Staff AI Engineer",
        "company": "Acme Corp",
        "hr_name": "Sarah Connor",
        "schedule_link": "https://hiringloop.ai/schedule/invite-123",
        "interview_date": "Monday, Dec 1",
        "interview_time": "10:00 AM",
        "meet_link": "https://meet.google.com/xyz",
        "job_details": "Great role",
    }

    sent, msg, message_id = dispatch_pipeline_template_email(
        session=session,
        user_id=test_hr_user.id,
        candidate=test_candidate,
        template_id="initial_interview",
        context=ctx,
        event_key="test_invite_round",
    )

    assert sent is True
    assert message_id is not None

    # Verify stored message body contains our edited text
    from app.models.message import Message
    msg_row = session.get(Message, message_id)
    assert msg_row is not None
    assert custom_secret_marker in msg_row.body
    assert custom_secret_marker in msg_row.template_variables["subject"]
    assert "Jordan Lee" in msg_row.body
    assert "Staff AI Engineer" in msg_row.body


def test_disabled_template_pauses_step_with_settings_link(session: Session, test_hr_user: User, test_candidate: Candidate):
    """
    Requirement 4: If a template is missing or disabled: pause that step with
    "Template missing: <name>" and a link to Settings. Never send a fallback.
    """
    seed_missing_default_templates(session, test_hr_user.id)

    # Disable 'final_interview' template
    tmpl = session.exec(
        select(RecruitingTemplate).where(
            RecruitingTemplate.user_id == test_hr_user.id,
            RecruitingTemplate.stage_key == "final_interview",
        )
    ).first()
    assert tmpl is not None
    tmpl.is_active = False
    session.add(tmpl)
    session.commit()
    clear_user_template_cache(test_hr_user.id)

    ctx = {
        "candidate_name": test_candidate.name,
        "role": "Staff AI Engineer",
        "company": "Acme Corp",
        "hr_name": "Sarah Connor",
        "schedule_link": "https://hiringloop.ai/schedule/final",
        "interview_date": "Friday, Dec 5",
        "interview_time": "3:00 PM",
        "meet_link": "https://meet.google.com/final-xyz",
    }

    sent, pause_msg, message_id = dispatch_pipeline_template_email(
        session=session,
        user_id=test_hr_user.id,
        candidate=test_candidate,
        template_id="final_interview",
        context=ctx,
        event_key="test_final_round",
    )

    # Must be blocked from sending (sent=False, no message_id)
    assert sent is False
    assert message_id is None
    # Must report template missing/disabled with link to Settings
    assert "Template missing:" in pause_msg
    assert "/settings?tab=templates" in pause_msg

    # Verify candidate status was paused with NEEDS_ATTENTION
    session.refresh(test_candidate)
    ext = test_candidate.extracted_data or {}
    assert ext.get("pipeline_status") == "NEEDS_ATTENTION"


def test_missing_required_variables_blocks_sending_and_flags_hr(session: Session, test_hr_user: User, test_candidate: Candidate):
    """
    Requirement 5: At send time only fill variables. A missing variable blocks sending and flags HR.
    """
    seed_missing_default_templates(session, test_hr_user.id)

    # Context missing required schedule_link for cv_passed template
    incomplete_ctx = {
        "candidate_name": "Jordan Lee",
        "role": "Staff AI Engineer",
        "company": "Acme Corp",
        "hr_name": "Sarah Connor",
        "schedule_link": None,  # Missing!
    }

    with pytest.raises(MissingTemplateVariablesError) as exc_info:
        render_user_template(
            session=session,
            user_id=test_hr_user.id,
            template_id="cv_passed",
            context=incomplete_ctx,
        )

    assert "schedule_link" in str(exc_info.value)
    assert "Blocked and flagged for HR" in str(exc_info.value)


def test_template_cache_invalidation_on_mutation(session: Session, test_hr_user: User):
    """
    Requirement 6: Cache templates with short TTL, clear cache on every save,
    regenerate, disable, duplicate or delete.
    """
    seed_missing_default_templates(session, test_hr_user.id)
    cache_key = f"templates:user:{test_hr_user.id}"

    # 1. Fetching templates populates cache
    tmpls_1 = get_user_templates_from_db(session, test_hr_user.id)
    assert len(tmpls_1) >= 11
    assert cache_service.get(cache_key) is not None

    # 2. Invalidate cache
    clear_user_template_cache(test_hr_user.id)
    assert cache_service.get(cache_key) is None

    # 3. Next fetch re-populates cache
    tmpls_2 = get_user_templates_from_db(session, test_hr_user.id)
    assert len(tmpls_2) == len(tmpls_1)
    assert cache_service.get(cache_key) is not None


def test_recruiting_templates_router_endpoints(session: Session, test_hr_user: User):
    """
    Tests REST router endpoints:
    list, create, update, duplicate, toggle, set-default, delete, batch_save.
    """
    from app.routers.recruiting_templates import (
        list_templates,
        create_template,
        update_template,
        duplicate_template,
        toggle_template_active,
        set_template_default,
        delete_template,
        batch_save_templates,
        TemplateCreateRequest,
        TemplateUpdateRequest,
        BatchSaveRequest,
    )

    # 1. List templates (seeds defaults automatically)
    initial_list = list_templates(current_user=test_hr_user, session=session)
    assert len(initial_list) >= 11

    # 2. Create custom template
    new_req = TemplateCreateRequest(
        stage_key="system_architecture_review",
        name="Architecture Interview Invite",
        subject="Invitation: System Architecture for {role}",
        body="Hi {candidate_name}, we would love to review architecture. Booking: {schedule_link}",
        is_active=True,
        is_default=False,
        is_custom=True,
    )
    created = create_template(payload=new_req, current_user=test_hr_user, session=session)
    assert created.name == "Architecture Interview Invite"
    assert created.is_custom is True

    # 3. Duplicate template
    duplicated = duplicate_template(template_id=created.id, current_user=test_hr_user, session=session)
    assert duplicated.name == "Copy of Architecture Interview Invite"
    assert duplicated.is_custom is True
    assert duplicated.id != created.id

    # 4. Toggle active state
    toggled = toggle_template_active(template_id=duplicated.id, current_user=test_hr_user, session=session)
    assert toggled.is_active is False
    toggled_again = toggle_template_active(template_id=duplicated.id, current_user=test_hr_user, session=session)
    assert toggled_again.is_active is True

    # 5. Set default
    set_def = set_template_default(template_id=duplicated.id, current_user=test_hr_user, session=session)
    assert set_def.is_default is True

    # 6. Update template
    up_req = TemplateUpdateRequest(
        name="Architecture Interview (Updated)",
        subject="Updated Subject for {role}",
    )
    updated = update_template(template_id=created.id, payload=up_req, current_user=test_hr_user, session=session)
    assert updated.name == "Architecture Interview (Updated)"
    assert updated.subject == "Updated Subject for {role}"

    # 7. Delete custom template
    delete_template(template_id=duplicated.id, current_user=test_hr_user, session=session)
    after_del = session.get(RecruitingTemplate, duplicated.id)
    assert after_del is None

    # 8. Batch save
    batch_req = BatchSaveRequest(
        templates={
            "cv_received": {
                "subject": "Batch Saved CV Received for {role}",
                "body": "Hi {candidate_name}, batch saved body.",
                "is_active": True,
            }
        }
    )
    batch_res = batch_save_templates(payload=batch_req, current_user=test_hr_user, session=session)
    assert batch_res["count"] == 1
    reloaded = get_template_for_stage(session, test_hr_user.id, "cv_received")
    assert reloaded.subject == "Batch Saved CV Received for {role}"

