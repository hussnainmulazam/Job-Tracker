"""Scorecard schemas — validation and serialization for candidate evaluation scorecards."""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ScorecardBase(BaseModel):
    candidate_id: uuid.UUID
    rating: int = Field(..., ge=1, le=5, description="Evaluation rating from 1 to 5")
    notes: Optional[str] = Field(default=None, description="Interviewer / recruiter notes")


class ScorecardCreate(ScorecardBase):
    pass


class ScorecardUpdate(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = None


class ScorecardRead(ScorecardBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedScorecards(BaseModel):
    items: List[ScorecardRead]
    total: int

