"""
app/routers/scorecards.py
~~~~~~~~~~~~~~~~~~~~~~~~~
CRUD for Candidate Evaluation Scorecards.

All routes require authentication (CurrentUser) and are strictly scoped
to the authenticated recruiter.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Query, status

from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.schemas.scorecard import (
    PaginatedScorecards,
    ScorecardCreate,
    ScorecardRead,
    ScorecardUpdate,
)
from app.services.scorecard_service import scorecard_service

router = APIRouter(prefix="/scorecards", tags=["Scorecards"])


@router.post(
    "",
    response_model=ScorecardRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a candidate scorecard",
)
def create_scorecard(
    body: ScorecardCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> ScorecardRead:
    """Create a new evaluation scorecard for a candidate."""
    return scorecard_service.create(
        session=session,
        user_id=current_user.id,
        data=body,
    )


@router.get(
    "",
    response_model=PaginatedScorecards,
    status_code=status.HTTP_200_OK,
    summary="List candidate scorecards",
)
def list_scorecards(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> PaginatedScorecards:
    """List all scorecards submitted for a candidate."""
    return scorecard_service.list_by_candidate(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
    )


@router.get(
    "/{scorecard_id}",
    response_model=ScorecardRead,
    status_code=status.HTTP_200_OK,
    summary="Get scorecard by ID",
)
def get_scorecard(
    scorecard_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> ScorecardRead:
    """Get single scorecard details."""
    scorecard = scorecard_service.get_by_id(
        session=session,
        user_id=current_user.id,
        scorecard_id=scorecard_id,
    )
    return ScorecardRead.model_validate(scorecard)


@router.patch(
    "/{scorecard_id}",
    response_model=ScorecardRead,
    status_code=status.HTTP_200_OK,
    summary="Update scorecard",
)
def update_scorecard(
    scorecard_id: uuid.UUID,
    body: ScorecardUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> ScorecardRead:
    """Update rating or notes on a scorecard."""
    return scorecard_service.update(
        session=session,
        user_id=current_user.id,
        scorecard_id=scorecard_id,
        data=body,
    )


@router.delete(
    "/{scorecard_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete scorecard",
)
def delete_scorecard(
    scorecard_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    """Delete a scorecard."""
    scorecard_service.delete(
        session=session,
        user_id=current_user.id,
        scorecard_id=scorecard_id,
    )

