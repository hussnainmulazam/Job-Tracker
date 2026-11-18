from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel


class JobBase(SQLModel):
    title: str = Field(index=True)
    company: str = Field(index=True)
    location: Optional[str] = None
    salary_range: Optional[str] = None
    status: str = Field(default="Applied", index=True)  # e.g., Applied, Interviewing, Offer, Rejected
    job_url: Optional[str] = None
    notes: Optional[str] = None


class Job(JobBase, table=True):
    __tablename__ = "jobs"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

