"""
backend/app/services/template_service.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Service for AI-generated and deterministic recruiting email templates.
Creates short, warm, and human templates across the 11 lifecycle stages:
  1) CV Received
  2) CV Passed
  3) Job Details
  4) Initial Interview
  5) Initial Passed
  6) Behavioral Interview
  7) Behavioral Passed
  8) Final Interview
  9) Offer Letter
  10) Rejection (per stage)
  11) Interview Reminder

Supported dynamic variables:
  {candidate_name}, {role}, {company}, {hr_name}, {interview_date},
  {interview_time}, {meet_link}, {schedule_link}, {job_details}

Sending NEVER calls the AI — it performs pure deterministic variable substitution.
"""
import logging
import time
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

from app.services.ai_router import ai_router

logger = logging.getLogger(__name__)

TEMPLATE_CONFIGS: Dict[str, Dict[str, str]] = {
    "cv_received": {
        "name": "CV Received",
        "description": "Sent when an applicant's CV is first received to confirm intake.",
        "variables": ["candidate_name", "role", "company", "hr_name"],
    },
    "cv_passed": {
        "name": "CV Passed",
        "description": "Sent when candidate's CV is approved / shortlisted.",
        "variables": ["candidate_name", "role", "company", "hr_name", "schedule_link"],
    },
    "job_details": {
        "name": "Job Details",
        "description": "Shares the role responsibilities, tech stack, and team culture.",
        "variables": ["candidate_name", "role", "company", "hr_name", "job_details", "schedule_link"],
    },
    "initial_interview": {
        "name": "Initial Interview",
        "description": "Invites candidate to an initial 30-min screening call.",
        "variables": ["candidate_name", "role", "company", "hr_name", "schedule_link"],
    },
    "initial_passed": {
        "name": "Initial Passed",
        "description": "Congratulates candidate on passing the initial screening round.",
        "variables": ["candidate_name", "role", "company", "hr_name", "schedule_link"],
    },
    "behavioral_interview": {
        "name": "Behavioral Interview",
        "description": "Invites candidate to the behavioral and cultural alignment round.",
        "variables": ["candidate_name", "role", "company", "hr_name", "interview_date", "interview_time", "meet_link", "schedule_link"],
    },
    "behavioral_passed": {
        "name": "Behavioral Passed",
        "description": "Notifies candidate they passed the behavioral evaluation.",
        "variables": ["candidate_name", "role", "company", "hr_name", "schedule_link"],
    },
    "final_interview": {
        "name": "Final Interview",
        "description": "Invites candidate to the final leadership interview.",
        "variables": ["candidate_name", "role", "company", "hr_name", "interview_date", "interview_time", "meet_link", "schedule_link"],
    },
    "offer_letter": {
        "name": "Offer Letter",
        "description": "Celebratory job offer extending employment details.",
        "variables": ["candidate_name", "role", "company", "hr_name"],
    },
    "rejection": {
        "name": "Rejection (per stage)",
        "description": "Short, kind, and appreciative rejection message.",
        "variables": ["candidate_name", "role", "company", "hr_name"],
    },
    "interview_reminder": {
        "name": "Interview Reminder",
        "description": "Friendly reminder 24h or 1h before a scheduled interview.",
        "variables": ["candidate_name", "role", "company", "hr_name", "interview_date", "interview_time", "meet_link"],
    },
}


class TemplateItemSchema(BaseModel):
    name: Optional[str] = None
    subject: str = Field(..., min_length=2)
    body: str = Field(..., min_length=5)


class TemplatesBatchSchema(BaseModel):
    templates: Dict[str, TemplateItemSchema]


def get_default_templates(
    hr_name: str = "Our Team",
    company_name: str = "Our Team",
    email_tone: str = "warm_professional",
) -> Dict[str, Dict[str, str]]:
    """
    Returns authentic, short, and warm human templates for all 11 stages.
    Never robotic; uses clean conversational recruiter language.
    """
    is_casual = "casual" in email_tone.lower()
    is_direct = "direct" in email_tone.lower()
    is_formal = "formal" in email_tone.lower()

    if is_casual:
        salutation = "Hey {candidate_name}!"
        signoff = f"Cheers,\n{hr_name}\n{{company}}"
    elif is_direct:
        salutation = "Hi {candidate_name},"
        signoff = f"Best,\n{hr_name}\n{{company}}"
    elif is_formal:
        salutation = "Dear {candidate_name},"
        signoff = f"Sincerely,\n{hr_name}\n{{company}}"
    else:
        # Warm & Professional
        salutation = "Hi {candidate_name},"
        signoff = f"Warm regards,\n{hr_name}\n{{company}}"

    return {
        "cv_received": {
            "name": "CV Received",
            "subject": "Got your application for {role} at {company}!",
            "body": (
                f"{salutation}\n\n"
                "Thank you for sharing your resume with us for the {role} position. "
                "I've received your CV and our hiring team is reviewing it now.\n\n"
                "We know how much effort goes into applying, so we'll be in touch with next steps as soon as we finish our review.\n\n"
                f"{signoff}"
            ),
        },
        "cv_passed": {
            "name": "CV Passed",
            "subject": "Great news regarding your application for {role} at {company}",
            "body": (
                f"{salutation}\n\n"
                "Your background caught our eye! Your skills and experience align closely with what we're building for {role} at {company}.\n\n"
                "We'd love to chat and get to know you better. Please pick a time that works best for you here:\n"
                "{schedule_link}\n\n"
                "Looking forward to our conversation!\n\n"
                f"{signoff}"
            ),
        },
        "job_details": {
            "name": "Job Details",
            "subject": "More details on the {role} opportunity at {company}",
            "body": (
                f"{salutation}\n\n"
                "Here is an overview of what you'll be driving as {role} at {company}:\n\n"
                "{job_details}\n\n"
                "If this sounds exciting, grab a quick time on my calendar so we can talk through your questions:\n"
                "{schedule_link}\n\n"
                f"{signoff}"
            ),
        },
        "initial_interview": {
            "name": "Initial Interview",
            "subject": "Let's connect: {role} at {company}",
            "body": (
                f"{salutation}\n\n"
                "We would love to invite you to an introductory 30-minute chat for the {role} opening. "
                "It's an informal conversation to learn about your goals and share more about the role.\n\n"
                "Choose a slot that suits your schedule here:\n"
                "{schedule_link}\n\n"
                f"{signoff}"
            ),
        },
        "initial_passed": {
            "name": "Initial Passed",
            "subject": "Great speaking with you! Next steps for {role} at {company}",
            "body": (
                f"{salutation}\n\n"
                "I really enjoyed our introductory conversation. The team was impressed by your experience and we are excited to move you forward to the next round!\n\n"
                "Please use this booking link to schedule your next session:\n"
                "{schedule_link}\n\n"
                f"{signoff}"
            ),
        },
        "behavioral_interview": {
            "name": "Behavioral Interview",
            "subject": "Team & Culture Fit Interview: {role} at {company}",
            "body": (
                f"{salutation}\n\n"
                "We'd love to invite you to our team alignment conversation for the {role} position. "
                "This session is a chance for you to meet the team, discuss how we work together, and ask any questions you have.\n\n"
                "If not already booked, pick a time here:\n"
                "{schedule_link}\n"
                "Meeting link: {meet_link}\n\n"
                f"{signoff}"
            ),
        },
        "behavioral_passed": {
            "name": "Behavioral Passed",
            "subject": "Wonderful feedback on your interview for {role} at {company}",
            "body": (
                f"{salutation}\n\n"
                "The team loved meeting with you! Your approach to collaboration and problem solving made a fantastic impression on everyone.\n\n"
                "We would love to move you to the final interview round. You can book your slot here:\n"
                "{schedule_link}\n\n"
                f"{signoff}"
            ),
        },
        "final_interview": {
            "name": "Final Interview",
            "subject": "Final Interview: {role} at {company}",
            "body": (
                f"{salutation}\n\n"
                "You have reached the final stage of our hiring process! This round will be a focused discussion with our leadership team.\n\n"
                "Interview timing: {interview_date} at {interview_time}\n"
                "Video room: {meet_link}\n\n"
                "We are excited for this conversation. Reach out if you need anything beforehand.\n\n"
                f"{signoff}"
            ),
        },
        "offer_letter": {
            "name": "Offer Letter",
            "subject": "Offer of Employment: Welcome to {company}!",
            "body": (
                f"{salutation}\n\n"
                "On behalf of everyone at {company}, I am thrilled to extend an offer for the {role} position! "
                "We were deeply inspired by your talent and believe you will do phenomenal work here.\n\n"
                "I will follow up shortly with your formal offer summary packet. In the meantime, huge congratulations—we can't wait to work together!\n\n"
                f"{signoff}"
            ),
        },
        "rejection": {
            "name": "Rejection (per stage)",
            "subject": "Update on your application for {role} at {company}",
            "body": (
                f"{salutation}\n\n"
                "Thank you sincerely for taking the time to speak with us about the {role} position at {company}. "
                "While our team was impressed by your background, we have chosen to move forward with another applicant whose experience is slightly closer to our current immediate priorities.\n\n"
                "We genuinely appreciate your time and enthusiasm. We'll keep your profile in our talent pool for future openings, and wish you all the best in your search.\n\n"
                f"{signoff}"
            ),
        },
        "interview_reminder": {
            "name": "Interview Reminder",
            "subject": "Reminder: Your upcoming interview with {company} for {role}",
            "body": (
                f"{salutation}\n\n"
                "Just a friendly reminder about our upcoming interview for the {role} role.\n\n"
                "Date & Time: {interview_date} at {interview_time}\n"
                "Google Meet Link: {meet_link}\n\n"
                "Looking forward to speaking with you soon! Let me know if you need to reschedule.\n\n"
                f"{signoff}"
            ),
        },
    }


def fill_template_variables(template_str: str, variables: Dict[str, Any]) -> str:
    """
    Pure deterministic variable substitution. Never calls AI.
    Handles both {variable} and {{variable}} patterns.
    """
    if not template_str:
        return ""
    result = template_str
    for k, v in variables.items():
        val = str(v) if v is not None else ""
        result = result.replace(f"{{{k}}}", val)
        result = result.replace(f"{{{{{k}}}}}", val)
    return result


async def generate_recruiting_templates_ai(
    hr_name: Optional[str] = "Talent Team",
    company_name: Optional[str] = "Our Company",
    hr_role: Optional[str] = "Recruiter",
    email_tone: str = "warm_professional",
    single_template_key: Optional[str] = None,
) -> tuple[Dict[str, Dict[str, str]], bool, Optional[str], float]:
    """
    Calls the AI model chain to generate authentic, non-robotic templates using HR profile & tone.
    If single_template_key is provided, regenerates only that specific template.
    Falls back gracefully to deterministic templates if AI call encounters any failure.
    """
    t0 = time.perf_counter()
    target_keys = (
        [single_template_key]
        if single_template_key and single_template_key in TEMPLATE_CONFIGS
        else list(TEMPLATE_CONFIGS.keys())
    )

    system_prompt = (
        "You are an elite corporate talent acquisition partner and master copywriter.\n"
        "Your task is to write authentic, short, warm, and human candidate email templates.\n\n"
        "STRICT TONE GUIDELINES:\n"
        f"- Target Tone: {email_tone.replace('_', ' ').title()}\n"
        "- MUST BE SHORT, WARM AND HUMAN. NEVER ROBOTIC.\n"
        "- NEVER use cliché robotic phrases like 'I hope this email finds you well', 'Please find attached', "
        "'Per our discussion', or 'We regret to inform you'. Sound like a real recruiter having a thoughtful conversation.\n"
        "- Paragraphs must be short (1-3 sentences maximum).\n\n"
        "ALLOWED VARIABLES (only use tokens from this list in curly braces):\n"
        "  {candidate_name}, {role}, {company}, {hr_name}, {interview_date}, {interview_time}, "
        "{meet_link}, {schedule_link}, {job_details}\n\n"
        "REQUIRED KEYS TO GENERATE:\n"
        f"{', '.join(target_keys)}\n\n"
        "STRICT JSON OUTPUT FORMAT:\n"
        '{"templates": {"<key>": {"name": "<Friendly Name>", "subject": "<Subject line>", "body": "<Full body content>"}}}'
    )

    user_prompt = (
        f"Recruiter: {hr_name or 'Talent Lead'}\n"
        f"Company: {company_name or 'Our Company'}\n"
        f"Role: {hr_role or 'Recruiter'}\n"
        f"Tone: {email_tone}\n"
        f"Generate {len(target_keys)} template(s): {', '.join(target_keys)}."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        validated, model_used, latency = await ai_router.complete_with_chain(
            task_name="drafts",
            messages=messages,
            validation_schema=TemplatesBatchSchema,
            temperature=0.3,
        )

        result_templates: Dict[str, Dict[str, str]] = {}
        for k, v in validated.templates.items():
            cfg = TEMPLATE_CONFIGS.get(k, {})
            result_templates[k] = {
                "name": cfg.get("name", v.name or k.replace("_", " ").title()),
                "subject": v.subject.strip(),
                "body": v.body.strip(),
            }

        # If partial response, backfill missing keys from defaults
        defaults = get_default_templates(
            hr_name=hr_name or "Talent Team",
            company_name=company_name or "Our Company",
            email_tone=email_tone,
        )
        for k in target_keys:
            if k not in result_templates:
                result_templates[k] = defaults[k]

        total_latency = time.perf_counter() - t0
        return result_templates, True, model_used, round(total_latency, 2)

    except Exception as exc:
        logger.warning("AI template generation encountered an error (%s). Falling back to human-crafted templates.", exc)
        defaults = get_default_templates(
            hr_name=hr_name or "Talent Team",
            company_name=company_name or "Our Company",
            email_tone=email_tone,
        )
        filtered = {k: defaults[k] for k in target_keys if k in defaults}
        total_latency = time.perf_counter() - t0
        return filtered, False, "human_crafted_fallback", round(total_latency, 2)
