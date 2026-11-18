"""Search schemas — unified global search results across candidates, openings, and actions."""
from typing import List, Optional
from pydantic import BaseModel, Field


class SearchResultItem(BaseModel):
    id: str
    type: str  # "candidate" | "opening" | "action"
    title: str
    subtitle: str
    link: str
    score: Optional[float] = None
    stage_or_status: Optional[str] = None
    matched_skills: List[str] = Field(default_factory=list)


class SearchResponse(BaseModel):
    query: str
    candidates: List[SearchResultItem]
    openings: List[SearchResultItem]
    quick_actions: List[SearchResultItem]
    total_results: int
