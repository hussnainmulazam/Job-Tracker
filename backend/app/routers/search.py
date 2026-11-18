"""Global search router — searches candidates, job openings, and quick navigation."""
from typing import List
from fastapi import APIRouter, Query
from sqlmodel import or_, select

from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.models.candidate import Candidate
from app.models.job_opening import JobOpening
from app.schemas.search import SearchResponse, SearchResultItem

router = APIRouter(prefix="/search", tags=["Global Search"])

SYSTEM_ACTIONS = [
    {
        "id": "action-dashboard",
        "title": "Recruiting Dashboard",
        "subtitle": "View recruiting KPIs, pipeline funnel, and upcoming interviews",
        "link": "/dashboard",
        "keywords": ["dashboard", "home", "analytics", "kpi", "stats"],
    },
    {
        "id": "action-pipeline",
        "title": "Candidate Pipeline",
        "subtitle": "Interactive Kanban board across all stages with audit logs",
        "link": "/pipeline",
        "keywords": ["pipeline", "kanban", "stages", "candidates", "board"],
    },
    {
        "id": "action-inbox",
        "title": "Unified Inbox",
        "subtitle": "WhatsApp candidate chat threads and 24h care window messaging",
        "link": "/inbox",
        "keywords": ["inbox", "whatsapp", "messages", "chat", "threads", "reply"],
    },
    {
        "id": "action-interviews",
        "title": "Interviews Calendar",
        "subtitle": "Agenda and calendar schedule with Google Meet links",
        "link": "/interviews",
        "keywords": ["interviews", "calendar", "schedule", "google meet", "events"],
    },
    {
        "id": "action-openings",
        "title": "Job Openings",
        "subtitle": "Manage active requisitions and bulk scoring",
        "link": "/openings",
        "keywords": ["openings", "jobs", "requisitions", "roles", "vacancies"],
    },
    {
        "id": "action-compare",
        "title": "Candidate Comparison",
        "subtitle": "Side-by-side candidate comparison and skill match rings",
        "link": "/compare",
        "keywords": ["compare", "comparison", "side by side", "diff"],
    },
    {
        "id": "action-settings",
        "title": "Integrations & Settings",
        "subtitle": "Configure Google Calendar, Gmail sync, WhatsApp API, and availability",
        "link": "/settings",
        "keywords": ["settings", "google", "gmail", "whatsapp", "calendar", "integrations"],
    },
]


@router.get("", response_model=SearchResponse, summary="Global search across candidates, openings, and actions")
def global_search(
    session: SessionDep,
    current_user: CurrentUser,
    q: str = Query(..., min_length=1, max_length=100, description="Search keyword"),
) -> SearchResponse:
    """Multi-entity search scoped to recruiter's candidates, openings, and quick navigation actions."""
    clean_q = q.strip().lower()
    pattern = f"%{clean_q}%"

    # 1. Search Candidates
    candidates_raw = session.exec(
        select(Candidate)
        .where(
            Candidate.user_id == current_user.id,
            or_(
                Candidate.name.ilike(pattern),
                Candidate.email.ilike(pattern),
                Candidate.summary.ilike(pattern),
                Candidate.phone.ilike(pattern),
            ),
        )
        .order_by(Candidate.updated_at.desc())
        .limit(10)
    ).all()

    candidates: List[SearchResultItem] = []
    for c in candidates_raw:
        op = session.exec(select(JobOpening.title).where(JobOpening.id == c.opening_id)).first()
        candidates.append(
            SearchResultItem(
                id=str(c.id),
                type="candidate",
                title=c.name,
                subtitle=f"{op or 'Unassigned'} • {c.email}",
                link=f"/pipeline?candidate_id={c.id}",
                score=c.score,
                stage_or_status=c.stage.value if hasattr(c.stage, "value") else str(c.stage),
                matched_skills=c.matched_skills[:4] if c.matched_skills else [],
            )
        )

    # 2. Search Job Openings
    openings_raw = session.exec(
        select(JobOpening)
        .where(
            JobOpening.user_id == current_user.id,
            or_(
                JobOpening.title.ilike(pattern),
                JobOpening.description.ilike(pattern),
            ),
        )
        .order_by(JobOpening.created_at.desc())
        .limit(6)
    ).all()

    openings: List[SearchResultItem] = []
    for o in openings_raw:
        openings.append(
            SearchResultItem(
                id=str(o.id),
                type="opening",
                title=o.title,
                subtitle=f"Status: {o.status.value if hasattr(o.status, 'value') else str(o.status)}",
                link=f"/openings/{o.id}",
                stage_or_status=o.status.value if hasattr(o.status, "value") else str(o.status),
                matched_skills=o.required_skills[:3] if o.required_skills else [],
            )
        )

    # 3. Match Quick Actions
    matched_actions: List[SearchResultItem] = []
    for act in SYSTEM_ACTIONS:
        if (
            clean_q in act["title"].lower()
            or clean_q in act["subtitle"].lower()
            or any(clean_q in kw for kw in act["keywords"])
        ):
            matched_actions.append(
                SearchResultItem(
                    id=act["id"],
                    type="action",
                    title=act["title"],
                    subtitle=act["subtitle"],
                    link=act["link"],
                )
            )

    total = len(candidates) + len(openings) + len(matched_actions)
    return SearchResponse(
        query=q,
        candidates=candidates,
        openings=openings,
        quick_actions=matched_actions,
        total_results=total,
    )
