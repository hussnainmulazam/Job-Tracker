"""
app/schemas/ai.py
~~~~~~~~~~~~~~~~~
Pydantic schemas for AI-powered Candidate Screening, Scoring,
Recruiter Interview Question Generation, and OpenRouter Health Check.
"""
import uuid
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


# ── Recruiter AI Candidate Screening ──────────────────────────────────────────

class CandidateScreenRequest(BaseModel):
    """Payload to screen a candidate CV against a Job Opening."""
    job_title: str = Field(..., min_length=2, max_length=255, description="Target job title")
    job_description: str = Field(..., min_length=10, description="Target job description")
    required_skills: List[str] = Field(default_factory=list, description="Target skills required")
    candidate_name: Optional[str] = Field(default="Candidate", description="Name of candidate")
    cv_text: str = Field(..., min_length=20, description="Resume / CV content in plain text or markdown")
    opening_id: Optional[uuid.UUID] = Field(default=None, description="Optional opening ID")
    candidate_id: Optional[uuid.UUID] = Field(default=None, description="Optional candidate ID")

    @field_validator("cv_text", "job_description")
    @classmethod
    def validate_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Content cannot be empty or whitespace.")
        return value.strip()


class CandidateScreenResponse(BaseModel):
    """AI evaluation and fit score for recruiter screening."""
    score: float = Field(..., ge=0.0, le=100.0, description="Overall fit score (0 - 100)")
    matched_skills: List[str] = Field(default_factory=list, description="Skills verified in CV")
    missing_skills: List[str] = Field(default_factory=list, description="Key skills or gaps missing from CV")
    red_flags: List[str] = Field(default_factory=list, description="Potential concerns, gaps, or risks identified")
    summary: str = Field(..., description="Recruiter executive summary of candidate fit")
    recommendation: str = Field(..., description="Recruiter recommendation (e.g. Strong Match, Review, Pass)")
    interview_focus_areas: List[str] = Field(default_factory=list, description="Recommended areas to probe in interview")
    model_used: Optional[str] = None
    latency_seconds: Optional[float] = None


class CandidateScreenLLMOutput(BaseModel):
    """Strict Pydantic model validating raw LLM JSON for candidate screening."""
    score: float = Field(..., ge=0.0, le=100.0, description="Fit score from 0 to 100")
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)
    summary: str = Field(..., min_length=10)
    recommendation: str = Field(...)
    interview_focus_areas: List[str] = Field(default_factory=list)


# ── Job Description Requirements Extraction ───────────────────────────────────

class JobRequirementsExtractionOutput(BaseModel):
    """Strict Pydantic model validating extracted job description requirements from OpenRouter."""
    required_skills: List[str] = Field(
        default_factory=list,
        description="Core technical, operational, or domain skills mandatory for the position",
    )
    years_of_experience: Optional[float] = Field(
        default=None,
        description="Minimum or typical years of experience specified or inferred for the role",
    )
    nice_to_haves: List[str] = Field(
        default_factory=list,
        description="Optional, preferred, or bonus skills/qualifications mentioned in the job description",
    )


# ── Recruiter Interview Question Generation ───────────────────────────────────

class RecruiterInterviewQuestionsRequest(BaseModel):
    """Request payload for interview questions tailored to candidate and role."""
    job_title: Optional[str] = Field(default=None, description="Job title")
    job_description: str = Field(..., min_length=10, description="Target job description")
    candidate_cv: Optional[str] = Field(default=None, description="Optional candidate CV to probe gaps")
    red_flags: Optional[List[str]] = Field(default=None, description="Optional red flags to probe")
    count: int = Field(default=5, ge=1, le=15, description="Number of questions (1-15)")

    @field_validator("job_description")
    @classmethod
    def validate_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Job description cannot be empty or whitespace.")
        return value.strip()


class RecruiterInterviewQuestionsResponse(BaseModel):
    """Response payload for generated interview questions."""
    questions: List[str] = Field(..., description="List of targeted interview questions for recruiters")


# ── Legacy Job-Seeker Schemas (backward compatibility) ────────────────────────

class TailorCVRequest(BaseModel):
    base_cv: str = Field(..., min_length=20)
    job_description: str = Field(..., min_length=20)


class TailorCVResponse(BaseModel):
    tailored_cv: str
    matched_keywords: List[str] = Field(default_factory=list)
    changes_summary: Optional[str] = None


class InterviewQuestionsRequest(BaseModel):
    job_description: str = Field(..., min_length=20)
    count: int = Field(default=5, ge=1, le=15)


class InterviewQuestionsResponse(BaseModel):
    questions: List[str]


class CVTailorLLMOutput(BaseModel):
    tailored_cv: str = Field(..., min_length=10)
    matched_keywords: List[str] = Field(default_factory=list)
    changes_summary: Optional[str] = None


class InterviewQuestionsLLMOutput(BaseModel):
    questions: List[str] = Field(..., min_length=1)


# ── Model Health Check Schemas ────────────────────────────────────────────────

class ModelHealthItem(BaseModel):
    task: str = Field(..., description="Task or model chain identifier, e.g. screening, questions")
    model: str = Field(..., description="OpenRouter model ID, e.g. nvidia/nemotron-3-ultra-550b-a55b:free")
    status: str = Field(..., description="'ok' if responsive, 'fail' otherwise")
    latency_ms: Optional[float] = Field(default=None, description="Round-trip request latency in milliseconds")
    error: Optional[str] = Field(default=None, description="Error message if model check failed")
    error_type: Optional[str] = Field(default=None, description="Classification of error: timeout, rate_limit, invalid_json, server_error, etc.")


class AIModelsHealthResponse(BaseModel):
    status: str = Field(..., description="'healthy', 'degraded', 'unhealthy', or 'unconfigured'")
    openrouter_base_url: Optional[str] = Field(default="https://openrouter.ai/api/v1", description="OpenRouter API base URL")
    grok_base_url: Optional[str] = Field(default=None, description="Grok / Groq API base URL")
    active_provider: Optional[str] = Field(default="openrouter", description="Active AI provider: groq, xai, or openrouter")
    models: dict[str, ModelHealthItem] = Field(
        default_factory=dict,
        description="Map of model ID to individual health check result",
    )
