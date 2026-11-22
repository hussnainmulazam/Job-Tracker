"""
backend/app/schemas/onboarding.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Pydantic schemas for the Recruiter Setup Wizard (4 steps),
progress tracking, and 'Start Agent' activation.
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── Step 1: HR & Company Profile ──────────────────────────────────────────────

class HRProfileStepPayload(BaseModel):
    hr_name: str = Field(..., min_length=2, max_length=150, description="HR / Recruiter Full Name")
    company_name: str = Field(..., min_length=2, max_length=150, description="Company or Organization Name")
    hr_role: str = Field(..., min_length=2, max_length=100, description="Recruiter Job Title / Role")
    email_tone: str = Field(
        default="warm_professional",
        description="Recruiting communication tone: warm_professional, casual_friendly, direct_concise, or formal",
    )
    signature: Optional[str] = Field(default=None, description="Email signature block")


class HRProfileStep(BaseModel):
    hr_name: Optional[str] = None
    company_name: Optional[str] = None
    hr_role: Optional[str] = None
    email_tone: str = "warm_professional"
    signature: Optional[str] = None
    completed: bool = False


# ── Step 2: First Job Opening with JD ─────────────────────────────────────────

class JobOpeningStepPayload(BaseModel):
    job_title: str = Field(..., min_length=2, max_length=255, description="Position Title")
    job_description: str = Field(..., min_length=20, description="Comprehensive Job Description")
    required_skills: List[str] = Field(default_factory=list, description="Core required competencies")
    years_of_experience: Optional[float] = Field(default=None, ge=0, le=50, description="Minimum years of experience")
    job_opening_id: Optional[uuid.UUID] = Field(default=None, description="Existing job opening ID if editing")


class JobOpeningStep(BaseModel):
    job_opening_id: Optional[uuid.UUID] = None
    job_title: Optional[str] = None
    job_description: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list)
    years_of_experience: Optional[float] = None
    completed: bool = False


# ── Step 3: Weekly Availability & Interview Lengths per Round ─────────────────

class InterviewRoundConfig(BaseModel):
    round_name: str = Field(..., min_length=2, max_length=100)
    duration_minutes: int = Field(default=30, ge=10, le=180)


class AvailabilityStepPayload(BaseModel):
    timezone: str = Field(default="Asia/Karachi", max_length=64)
    slot_duration_minutes: int = Field(default=30, ge=10, le=120)
    buffer_minutes: int = Field(default=10, ge=0, le=60)
    weekly_hours: Dict[str, Any] = Field(default_factory=dict)
    interview_rounds: List[InterviewRoundConfig] = Field(default_factory=list)


class AvailabilityStep(BaseModel):
    timezone: str = "Asia/Karachi"
    slot_duration_minutes: int = 30
    buffer_minutes: int = 10
    weekly_hours: Dict[str, Any] = Field(default_factory=dict)
    interview_rounds: List[Dict[str, Any]] = Field(default_factory=list)
    completed: bool = False


# ── Step 4: Email Templates ───────────────────────────────────────────────────

class EmailTemplateItem(BaseModel):
    name: Optional[str] = None
    subject: str = Field(..., min_length=2)
    body: str = Field(..., min_length=5)


class TemplatesStepPayload(BaseModel):
    templates: Dict[str, EmailTemplateItem] = Field(
        ...,
        description="Map of template key (e.g. cv_received, initial_interview, offer_letter, rejection) to subject and body",
    )


class TemplatesStep(BaseModel):
    templates: Dict[str, Any] = Field(default_factory=dict)
    completed: bool = False


class GenerateTemplatesRequest(BaseModel):
    hr_name: Optional[str] = Field(default=None, description="HR / Recruiter name")
    company_name: Optional[str] = Field(default=None, description="Company name")
    hr_role: Optional[str] = Field(default=None, description="HR role")
    email_tone: Optional[str] = Field(default="warm_professional", description="Desired tone")
    single_template_key: Optional[str] = Field(
        default=None,
        description="If set, only regenerates this single template (e.g. cv_received, initial_interview)",
    )


class GeneratedTemplatesResponse(BaseModel):
    templates: Dict[str, EmailTemplateItem]
    generated_with_ai: bool
    model_used: Optional[str] = None
    latency_seconds: Optional[float] = None


class TemplatePreviewRequest(BaseModel):
    subject: str = Field(..., description="Raw template subject")
    body: str = Field(..., description="Raw template body")
    candidate_name: Optional[str] = Field(default="Alex Morgan")
    role: Optional[str] = Field(default="Senior Software Engineer")
    company: Optional[str] = Field(default=None)
    hr_name: Optional[str] = Field(default=None)
    interview_date: Optional[str] = Field(default="Thursday, Nov 26")
    interview_time: Optional[str] = Field(default="2:30 PM PKT")
    meet_link: Optional[str] = Field(default="https://meet.google.com/abc-defg-hij")
    schedule_link: Optional[str] = Field(default="https://app.hiringloop.ai/schedule/invite-demo")
    job_details: Optional[str] = Field(
        default="Architecting microservices in Python, designing schemas in PostgreSQL, and deploying cloud containers."
    )


class TemplatePreviewResponse(BaseModel):
    resolved_subject: str
    resolved_body: str


# ── Onboarding Status Response ────────────────────────────────────────────────

class OnboardingStatusResponse(BaseModel):
    id: uuid.UUID
    current_step: int = Field(..., ge=1, le=5, description="Current active wizard step (1 to 4, 5=done)")
    is_completed: bool = Field(..., description="True if all 4 steps have been finished")
    agent_started: bool = Field(..., description="True if HR activated the Recruiter AI Copilot")
    can_start_agent: bool = Field(..., description="True only when steps 1, 2, 3, and 4 are all completed")
    completed_steps_count: int = Field(..., description="Number of steps completed (0-4)")
    total_steps: int = 4
    progress_percentage: int = Field(..., ge=0, le=100, description="Overall completion percent (0%, 25%, 50%, 75%, 100%)")
    step_1: HRProfileStep
    step_2: JobOpeningStep
    step_3: AvailabilityStep
    step_4: TemplatesStep
    created_at: datetime
    updated_at: datetime


class StartAgentResponse(BaseModel):
    status: str
    agent_started: bool
    message: str
