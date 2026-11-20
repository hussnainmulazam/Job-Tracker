"""
backend/app/routers/onboarding.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
API endpoints for Recruiter Setup Wizard (4 steps) & Progress Checklist.
Allows saving each step to PostgreSQL and resuming later.
Gates 'Start Agent' until all 4 steps are complete.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.models.audit_log import AuditLog
from app.models.interview import AvailabilitySchedule
from app.models.job_opening import JobOpening, JobOpeningStatus
from app.models.notification import Notification
from app.models.onboarding import OnboardingSetup
from app.schemas.onboarding import (
    AvailabilityStep,
    AvailabilityStepPayload,
    EmailTemplateItem,
    GenerateTemplatesRequest,
    GeneratedTemplatesResponse,
    HRProfileStep,
    HRProfileStepPayload,
    JobOpeningStep,
    JobOpeningStepPayload,
    OnboardingStatusResponse,
    StartAgentResponse,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
    TemplatesStep,
    TemplatesStepPayload,
)
from app.services.template_service import (
    TEMPLATE_CONFIGS,
    fill_template_variables,
    generate_recruiting_templates_ai,
    get_default_templates,
)

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


def _get_default_templates(
    company_name: str = "Company",
    hr_name: str = "Recruiting Team",
    email_tone: str = "warm_professional",
) -> Dict[str, Dict[str, str]]:
    """Generates authentic human recruiting email templates for all 11 lifecycle stages."""
    return get_default_templates(
        hr_name=hr_name,
        company_name=company_name,
        email_tone=email_tone,
    )


def _get_or_create_onboarding(session: SessionDep, user_id: uuid.UUID) -> OnboardingSetup:
    """Retrieve existing onboarding setup record or initialize a new one with sensible defaults."""
    record = session.exec(
        select(OnboardingSetup).where(OnboardingSetup.user_id == user_id)
    ).first()

    if record:
        return record

    # Check if user already created an opening previously
    existing_opening = session.exec(
        select(JobOpening).where(JobOpening.user_id == user_id).order_by(JobOpening.created_at.desc())
    ).first()

    # Check if user already configured an availability schedule
    existing_sched = session.exec(
        select(AvailabilitySchedule).where(AvailabilitySchedule.user_id == user_id)
    ).first()

    defaults_templates = _get_default_templates()

    new_onboarding = OnboardingSetup(
        user_id=user_id,
        current_step=1,
        is_completed=False,
        agent_started=False,
        templates=defaults_templates,
    )

    if existing_opening:
        new_onboarding.job_opening_id = existing_opening.id
        new_onboarding.job_title = existing_opening.title
        new_onboarding.job_description = existing_opening.description
        new_onboarding.required_skills = existing_opening.required_skills or []
        new_onboarding.years_of_experience = existing_opening.years_of_experience
        new_onboarding.step_2_completed = True

    if existing_sched:
        new_onboarding.timezone = existing_sched.timezone
        new_onboarding.slot_duration_minutes = existing_sched.slot_duration_minutes
        new_onboarding.buffer_minutes = existing_sched.buffer_minutes
        new_onboarding.weekly_hours = existing_sched.weekly_hours
        new_onboarding.step_3_completed = True

    session.add(new_onboarding)
    session.commit()
    session.refresh(new_onboarding)
    return new_onboarding


def _build_status_response(onboarding: OnboardingSetup) -> OnboardingStatusResponse:
    """Constructs the comprehensive onboarding status response with progress metrics."""
    completed_steps_count = sum([
        1 if onboarding.step_1_completed else 0,
        1 if onboarding.step_2_completed else 0,
        1 if onboarding.step_3_completed else 0,
        1 if onboarding.step_4_completed else 0,
    ])
    can_start = completed_steps_count == 4
    progress_percentage = int((completed_steps_count / 4.0) * 100)

    step_1 = HRProfileStep(
        hr_name=onboarding.hr_name,
        company_name=onboarding.company_name,
        hr_role=onboarding.hr_role,
        email_tone=onboarding.email_tone or "warm_professional",
        signature=onboarding.signature,
        completed=onboarding.step_1_completed,
    )

    step_2 = JobOpeningStep(
        job_opening_id=onboarding.job_opening_id,
        job_title=onboarding.job_title,
        job_description=onboarding.job_description,
        required_skills=onboarding.required_skills or [],
        years_of_experience=onboarding.years_of_experience,
        completed=onboarding.step_2_completed,
    )

    step_3 = AvailabilityStep(
        timezone=onboarding.timezone or "Asia/Karachi",
        slot_duration_minutes=onboarding.slot_duration_minutes or 30,
        buffer_minutes=onboarding.buffer_minutes or 10,
        weekly_hours=onboarding.weekly_hours or {},
        interview_rounds=onboarding.interview_rounds or [],
        completed=onboarding.step_3_completed,
    )

    templates_dict = onboarding.templates or _get_default_templates(
        company_name=onboarding.company_name or "Company",
        hr_name=onboarding.hr_name or "Recruiting Team",
        email_tone=onboarding.email_tone or "warm_professional",
    )
    step_4 = TemplatesStep(
        templates=templates_dict,
        completed=onboarding.step_4_completed,
    )

    return OnboardingStatusResponse(
        id=onboarding.id,
        current_step=onboarding.current_step,
        is_completed=onboarding.is_completed,
        agent_started=onboarding.agent_started,
        can_start_agent=can_start,
        completed_steps_count=completed_steps_count,
        total_steps=4,
        progress_percentage=progress_percentage,
        step_1=step_1,
        step_2=step_2,
        step_3=step_3,
        step_4=step_4,
        created_at=onboarding.created_at,
        updated_at=onboarding.updated_at,
    )


# ── GET /onboarding ───────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=OnboardingStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current recruiter onboarding wizard status & progress",
)
def get_onboarding_status(
    session: SessionDep,
    current_user: CurrentUser,
) -> OnboardingStatusResponse:
    """Returns the authenticated recruiter's current onboarding setup checklist state."""
    onboarding = _get_or_create_onboarding(session, current_user.id)
    return _build_status_response(onboarding)


# ── POST /onboarding/step/1 ───────────────────────────────────────────────────

@router.post(
    "/step/1",
    response_model=OnboardingStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Save Step 1: HR & Company Profile",
)
def save_step_1(
    payload: HRProfileStepPayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> OnboardingStatusResponse:
    """Saves recruiter name, company, role, email tone, and email signature."""
    onboarding = _get_or_create_onboarding(session, current_user.id)

    onboarding.hr_name = payload.hr_name.strip()
    onboarding.company_name = payload.company_name.strip()
    onboarding.hr_role = payload.hr_role.strip()
    onboarding.email_tone = payload.email_tone.strip()
    onboarding.signature = payload.signature.strip() if payload.signature else None
    onboarding.step_1_completed = True

    if onboarding.current_step <= 1:
        onboarding.current_step = 2

    # Update template placeholders with recruiter name and company if step 4 not completed yet
    if not onboarding.step_4_completed:
        onboarding.templates = _get_default_templates(
            company_name=onboarding.company_name,
            hr_name=onboarding.hr_name,
            email_tone=onboarding.email_tone,
        )

    onboarding.updated_at = datetime.now(timezone.utc)
    session.add(onboarding)
    session.commit()
    session.refresh(onboarding)

    return _build_status_response(onboarding)


# ── POST /onboarding/step/2 ───────────────────────────────────────────────────

@router.post(
    "/step/2",
    response_model=OnboardingStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Save Step 2: First Job Opening with JD",
)
def save_step_2(
    payload: JobOpeningStepPayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> OnboardingStatusResponse:
    """Creates or updates the recruiter's first Job Opening requisition."""
    onboarding = _get_or_create_onboarding(session, current_user.id)

    target_opening: JobOpening | None = None

    if payload.job_opening_id:
        target_opening = session.exec(
            select(JobOpening).where(
                JobOpening.id == payload.job_opening_id,
                JobOpening.user_id == current_user.id,
            )
        ).first()

    if not target_opening and onboarding.job_opening_id:
        target_opening = session.exec(
            select(JobOpening).where(
                JobOpening.id == onboarding.job_opening_id,
                JobOpening.user_id == current_user.id,
            )
        ).first()

    if target_opening:
        target_opening.title = payload.job_title.strip()
        target_opening.description = payload.job_description.strip()
        target_opening.required_skills = [s.strip() for s in payload.required_skills if s.strip()]
        target_opening.years_of_experience = payload.years_of_experience
        target_opening.status = JobOpeningStatus.active
        session.add(target_opening)
        session.commit()
        session.refresh(target_opening)
    else:
        new_opening = JobOpening(
            user_id=current_user.id,
            title=payload.job_title.strip(),
            description=payload.job_description.strip(),
            required_skills=[s.strip() for s in payload.required_skills if s.strip()],
            years_of_experience=payload.years_of_experience,
            status=JobOpeningStatus.active,
        )
        session.add(new_opening)
        session.commit()
        session.refresh(new_opening)
        target_opening = new_opening

    onboarding.job_opening_id = target_opening.id
    onboarding.job_title = target_opening.title
    onboarding.job_description = target_opening.description
    onboarding.required_skills = target_opening.required_skills
    onboarding.years_of_experience = target_opening.years_of_experience
    onboarding.step_2_completed = True

    if onboarding.current_step <= 2:
        onboarding.current_step = 3

    onboarding.updated_at = datetime.now(timezone.utc)
    session.add(onboarding)
    session.commit()
    session.refresh(onboarding)

    return _build_status_response(onboarding)


# ── POST /onboarding/step/3 ───────────────────────────────────────────────────

@router.post(
    "/step/3",
    response_model=OnboardingStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Save Step 3: Weekly Availability & Interview Lengths per Round",
)
def save_step_3(
    payload: AvailabilityStepPayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> OnboardingStatusResponse:
    """Configures recruiter working hours, buffer times, and interview round durations."""
    onboarding = _get_or_create_onboarding(session, current_user.id)

    # 1. Update or create live AvailabilitySchedule
    sched = session.exec(
        select(AvailabilitySchedule).where(AvailabilitySchedule.user_id == current_user.id)
    ).first()

    if not sched:
        sched = AvailabilitySchedule(
            user_id=current_user.id,
            timezone=payload.timezone,
            slot_duration_minutes=payload.slot_duration_minutes,
            buffer_minutes=payload.buffer_minutes,
            weekly_hours=payload.weekly_hours,
        )
        session.add(sched)
    else:
        sched.timezone = payload.timezone
        sched.slot_duration_minutes = payload.slot_duration_minutes
        sched.buffer_minutes = payload.buffer_minutes
        sched.weekly_hours = payload.weekly_hours
        session.add(sched)

    session.commit()

    # 2. Persist to OnboardingSetup
    onboarding.timezone = payload.timezone
    onboarding.slot_duration_minutes = payload.slot_duration_minutes
    onboarding.buffer_minutes = payload.buffer_minutes
    onboarding.weekly_hours = payload.weekly_hours
    onboarding.interview_rounds = [r.model_dump() for r in payload.interview_rounds]
    onboarding.step_3_completed = True

    if onboarding.current_step <= 3:
        onboarding.current_step = 4

    onboarding.updated_at = datetime.now(timezone.utc)
    session.add(onboarding)
    session.commit()
    session.refresh(onboarding)

    return _build_status_response(onboarding)


# ── POST /onboarding/step/4 ───────────────────────────────────────────────────

@router.post(
    "/step/4",
    response_model=OnboardingStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Save Step 4: Email Templates",
)
def save_step_4(
    payload: TemplatesStepPayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> OnboardingStatusResponse:
    """Saves candidate lifecycle email templates (Application Ack, Interview Invite, Offer, Rejection)."""
    onboarding = _get_or_create_onboarding(session, current_user.id)

    raw_templates = {k: v.model_dump() for k, v in payload.templates.items()}
    onboarding.templates = raw_templates
    onboarding.step_4_completed = True

    # Check if all 4 steps are complete
    all_done = (
        onboarding.step_1_completed
        and onboarding.step_2_completed
        and onboarding.step_3_completed
        and onboarding.step_4_completed
    )
    if all_done:
        onboarding.is_completed = True
        onboarding.current_step = 5

    onboarding.updated_at = datetime.now(timezone.utc)
    session.add(onboarding)
    session.commit()
    session.refresh(onboarding)

    return _build_status_response(onboarding)


# ── POST /onboarding/start-agent ─────────────────────────────────────────────

@router.post(
    "/start-agent",
    response_model=StartAgentResponse,
    status_code=status.HTTP_200_OK,
    summary="Activate Recruiter AI Copilot Agent (enabled only after all 4 steps complete)",
)
def start_recruiter_agent(
    session: SessionDep,
    current_user: CurrentUser,
) -> StartAgentResponse:
    """
    Activates the AI Recruiter Copilot Agent.
    Strictly gates execution: raises HTTP 400 Bad Request if any of the 4 steps are incomplete.
    """
    onboarding = _get_or_create_onboarding(session, current_user.id)

    missing_steps = []
    if not onboarding.step_1_completed:
        missing_steps.append("1. HR & Company Profile")
    if not onboarding.step_2_completed:
        missing_steps.append("2. First Job Opening")
    if not onboarding.step_3_completed:
        missing_steps.append("3. Weekly Availability & Round Lengths")
    if not onboarding.step_4_completed:
        missing_steps.append("4. Email Templates")

    if missing_steps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Start Agent is disabled. All four onboarding steps must be completed before launching: "
                f"{', '.join(missing_steps)}."
            ),
        )

    onboarding.agent_started = True
    onboarding.is_completed = True
    onboarding.updated_at = datetime.now(timezone.utc)
    session.add(onboarding)

    # 1. Create celebratory in-app Notification
    notif = Notification(
        user_id=current_user.id,
        title="Recruiter AI Copilot Activated!",
        message=(
            f"Autonomous recruiting agent initialized for {onboarding.company_name or 'your company'}. "
            "You can now screen candidate CVs, review AI fit rankings, and dispatch personalized outreach."
        ),
        type="agent_activated",
        link="/pipeline",
    )
    session.add(notif)

    # 2. Record Recruiter Audit Log
    audit = AuditLog(
        user_id=current_user.id,
        action="recruiter_agent_started",
        details=(
            f"Recruiter {current_user.email} completed all 4 onboarding steps and activated "
            f"the AI Copilot for {onboarding.company_name}."
        ),
    )
    session.add(audit)

    session.commit()

    return StartAgentResponse(
        status="active",
        agent_started=True,
        message="Recruiter AI Copilot is now active and ready to screen candidates!",
    )


# ── POST /onboarding/generate-templates ────────────────────────────────────────

@router.post(
    "/generate-templates",
    response_model=GeneratedTemplatesResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate candidate lifecycle email templates with AI (11 stages)",
)
async def generate_templates_endpoint(
    payload: GenerateTemplatesRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> GeneratedTemplatesResponse:
    """
    One-click AI template generator:
    Runs once using HR profile and tone to produce authentic, human, non-robotic templates.
    Supports regenerating either all 11 templates or a single selected template.
    Saves generated templates into OnboardingSetup in PostgreSQL.
    """
    onboarding = _get_or_create_onboarding(session, current_user.id)

    hr_name = payload.hr_name or onboarding.hr_name or "Talent Team"
    company_name = payload.company_name or onboarding.company_name or "Our Company"
    hr_role = payload.hr_role or onboarding.hr_role or "Recruiter"
    email_tone = payload.email_tone or onboarding.email_tone or "warm_professional"

    generated_dict, is_ai, model_used, latency = await generate_recruiting_templates_ai(
        hr_name=hr_name,
        company_name=company_name,
        hr_role=hr_role,
        email_tone=email_tone,
        single_template_key=payload.single_template_key,
    )

    # Merge or replace in onboarding record
    current_templates = dict(
        onboarding.templates or _get_default_templates(company_name, hr_name, email_tone)
    )
    if payload.single_template_key:
        current_templates.update(generated_dict)
    else:
        current_templates = generated_dict

    onboarding.templates = current_templates
    onboarding.updated_at = datetime.now(timezone.utc)
    session.add(onboarding)
    session.commit()
    session.refresh(onboarding)

    # Format response
    templates_response: Dict[str, EmailTemplateItem] = {}
    for k, v in current_templates.items():
        templates_response[k] = EmailTemplateItem(
            name=v.get("name") or TEMPLATE_CONFIGS.get(k, {}).get("name", k.replace("_", " ").title()),
            subject=v.get("subject", ""),
            body=v.get("body", ""),
        )

    return GeneratedTemplatesResponse(
        templates=templates_response,
        generated_with_ai=is_ai,
        model_used=model_used,
        latency_seconds=latency,
    )


# ── POST /onboarding/preview-template ──────────────────────────────────────────

@router.post(
    "/preview-template",
    response_model=TemplatePreviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Preview template interpolation with sample candidate data",
)
def preview_template_endpoint(
    payload: TemplatePreviewRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> TemplatePreviewResponse:
    """
    Deterministic template variable interpolation.
    Replaces {candidate_name}, {role}, {company}, {hr_name}, {interview_date},
    {interview_time}, {meet_link}, {schedule_link}, {job_details}.
    Sending NEVER calls AI.
    """
    onboarding = _get_or_create_onboarding(session, current_user.id)

    variables = {
        "candidate_name": payload.candidate_name or "Alex Morgan",
        "role": payload.role or onboarding.job_title or "Senior Software Engineer",
        "company": payload.company or onboarding.company_name or "Acme Corp",
        "hr_name": payload.hr_name or onboarding.hr_name or "Sarah Jenkins",
        "interview_date": payload.interview_date or "Thursday, Nov 26",
        "interview_time": payload.interview_time or "2:30 PM PKT",
        "meet_link": payload.meet_link or "https://meet.google.com/abc-defg-hij",
        "schedule_link": payload.schedule_link or "https://app.talentflow.ai/schedule/invite-demo",
        "job_details": payload.job_details or "Architecting backend microservices and designing schemas.",
    }

    resolved_sub = fill_template_variables(payload.subject, variables)
    resolved_bod = fill_template_variables(payload.body, variables)

    return TemplatePreviewResponse(
        resolved_subject=resolved_sub,
        resolved_body=resolved_bod,
    )

