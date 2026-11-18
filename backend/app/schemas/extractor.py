"""Schemas for candidate contact and link extraction."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ExtractedFieldMeta(BaseModel):
    value: Optional[str] = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    source: str = Field(default="regex", description="regex, heuristic, llm, cv, email, manual")


class CandidateExtractionLLMOutput(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    current_title: Optional[str] = None
    years_of_experience: Optional[float] = None
    top_skills: List[str] = Field(default_factory=list)
    education: Optional[str] = None
    github: Optional[str] = None
    kaggle: Optional[str] = None
    linkedin: Optional[str] = None
    portfolio: Optional[str] = None
    other_links: List[str] = Field(default_factory=list)


class ExtractedCandidateData(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    secondary_emails: List[str] = Field(default_factory=list)
    phone: Optional[str] = None
    secondary_phones: List[str] = Field(default_factory=list)
    address: Optional[str] = None
    current_title: Optional[str] = None
    years_of_experience: Optional[float] = None
    top_skills: List[str] = Field(default_factory=list)
    education: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    kaggle_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    other_links: List[str] = Field(default_factory=list)


class CandidateDuplicateInfo(BaseModel):
    is_duplicate: bool = False
    matched_by: Optional[str] = None  # "email" or "phone"
    existing_candidate_id: Optional[str] = None
    existing_candidate_name: Optional[str] = None
    existing_candidate_email: Optional[str] = None
    existing_opening_id: Optional[str] = None
    existing_opening_title: Optional[str] = None
    existing_stage: Optional[str] = None
    existing_score: Optional[float] = None


class CandidateExtractionPreviewResponse(BaseModel):
    file_name: Optional[str] = None
    file_url: Optional[str] = None
    cv_text: str
    opening_id: str
    extracted_data: ExtractedCandidateData
    field_metadata: Dict[str, ExtractedFieldMeta] = Field(default_factory=dict)
    duplicate_info: CandidateDuplicateInfo = Field(default_factory=CandidateDuplicateInfo)
    low_confidence_fields: List[str] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)


class CandidateExtractTextRequest(BaseModel):
    opening_id: str
    cv_text: str


class CandidateConfirmPayload(BaseModel):
    opening_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    current_title: Optional[str] = None
    years_of_experience: Optional[float] = None
    top_skills: List[str] = Field(default_factory=list)
    education: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    kaggle_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    other_links: List[str] = Field(default_factory=list)
    cv_text: str
    cv_file_url: Optional[str] = None
    field_metadata: Dict[str, ExtractedFieldMeta] = Field(default_factory=dict)
    extracted_data: Dict[str, Any] = Field(default_factory=dict)
    auto_screen: bool = False
    action: str = Field(default="create", description="create, merge, or skip")
    merge_candidate_id: Optional[str] = None


class CandidateExtractedDetails(BaseModel):
    candidate_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    kaggle_url: Optional[str] = None
    other_links: List[str] = Field(default_factory=list)
    field_metadata: Dict[str, ExtractedFieldMeta] = Field(default_factory=dict)
    links_verified: Dict[str, Optional[bool]] = Field(default_factory=dict)


class CandidateDetailsUpdate(BaseModel):
    """Payload for HR recruiter manual edits and corrections."""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    kaggle_url: Optional[str] = None


class CandidateLinkRead(BaseModel):
    id: str
    candidate_id: str
    link_type: str
    url: str
    is_verified: Optional[bool] = None
    confidence: float
    source: str


class GoogleSheetSyncResponse(BaseModel):
    spreadsheet_id: str
    spreadsheet_url: str
    total_candidates_synced: int
    rows_updated: int
    rows_appended: int
    synced_at: str
