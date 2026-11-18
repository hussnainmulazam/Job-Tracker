"""Dashboard schemas — aggregated recruiter analytics and live KPI metrics."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DashboardStatsResponse(BaseModel):
    # Core KPIs
    total_openings: int = Field(..., description="Total job openings created by recruiter")
    active_openings: int = Field(..., description="Active job openings")
    total_candidates: int = Field(..., description="Total candidates tracked")
    screened_candidates: int = Field(..., description="Candidates that have been AI scored")
    shortlisted_candidates: int = Field(..., description="Candidates in interview or offer stage")
    average_score: Optional[float] = Field(default=None, description="Average fit score across all screened candidates")
    
    # Real data metrics requested
    new_cvs_today: int = Field(default=0, description="New CVs/candidates uploaded or synced today")
    pending_reviews: int = Field(default=0, description="Candidates awaiting screening, score, or recruiter evaluation")
    messages_awaiting_reply: int = Field(default=0, description="Candidate conversations where latest message is inbound")
    interviews_this_week: int = Field(default=0, description="Active interviews scheduled in the current week")
    time_to_shortlist_hours: Optional[float] = Field(default=None, description="Average hours from candidate creation to shortlist/interview")
    
    # Detailed breakdowns
    stage_breakdown: Dict[str, int] = Field(
        ...,
        description="Candidate distribution across stages (applied, screening, interview, offer, rejected)",
    )
    funnel_by_stage: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Stage-by-stage recruitment funnel with candidate counts and drop-off/conversion percentages",
    )
    recent_candidates: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Most recently added or evaluated candidates",
    )
    openings_summary: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Summary of active job openings with candidate counts and avg score",
    )
    upcoming_interviews: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Upcoming scheduled interviews for the current recruiter",
    )
    awaiting_reply_threads: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Candidate threads requiring recruiter reply",
    )
