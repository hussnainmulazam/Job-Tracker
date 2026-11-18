"""Scorecard service — business logic and DB operations for recruiter candidate scorecards."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, func, select

from app.models.candidate import Candidate
from app.models.scorecard import Scorecard
from app.schemas.scorecard import (
    PaginatedScorecards,
    ScorecardCreate,
    ScorecardRead,
    ScorecardUpdate,
)


class ScorecardService:
    def create(
        self,
        session: Session,
        user_id: uuid.UUID,
        data: ScorecardCreate,
    ) -> ScorecardRead:
        # Verify candidate exists and belongs to the user
        candidate = session.exec(
            select(Candidate).where(
                Candidate.id == data.candidate_id,
                Candidate.user_id == user_id,
            )
        ).first()
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Candidate '{data.candidate_id}' not found.",
            )

        scorecard = Scorecard(
            user_id=user_id,
            candidate_id=data.candidate_id,
            rating=data.rating,
            notes=data.notes.strip() if data.notes else None,
        )
        session.add(scorecard)
        session.commit()
        session.refresh(scorecard)
        return ScorecardRead.model_validate(scorecard)

    def get_by_id(
        self,
        session: Session,
        user_id: uuid.UUID,
        scorecard_id: uuid.UUID,
    ) -> Scorecard:
        statement = select(Scorecard).where(
            Scorecard.id == scorecard_id,
            Scorecard.user_id == user_id,
        )
        scorecard = session.exec(statement).first()
        if not scorecard:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scorecard '{scorecard_id}' not found.",
            )
        return scorecard

    def list_by_candidate(
        self,
        session: Session,
        user_id: uuid.UUID,
        candidate_id: uuid.UUID,
    ) -> PaginatedScorecards:
        # Verify candidate exists and belongs to user
        candidate = session.exec(
            select(Candidate).where(
                Candidate.id == candidate_id,
                Candidate.user_id == user_id,
            )
        ).first()
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Candidate '{candidate_id}' not found.",
            )

        query = (
            select(Scorecard)
            .where(
                Scorecard.candidate_id == candidate_id,
                Scorecard.user_id == user_id,
            )
            .order_by(Scorecard.created_at.desc())
        )
        items = session.exec(query).all()
        return PaginatedScorecards(
            items=[ScorecardRead.model_validate(s) for s in items],
            total=len(items),
        )

    def update(
        self,
        session: Session,
        user_id: uuid.UUID,
        scorecard_id: uuid.UUID,
        data: ScorecardUpdate,
    ) -> ScorecardRead:
        scorecard = self.get_by_id(session, user_id, scorecard_id)

        update_dict = data.model_dump(exclude_unset=True)
        if "notes" in update_dict and update_dict["notes"] is not None:
            update_dict["notes"] = update_dict["notes"].strip()

        for key, value in update_dict.items():
            setattr(scorecard, key, value)

        scorecard.updated_at = datetime.now(timezone.utc)
        session.add(scorecard)
        session.commit()
        session.refresh(scorecard)
        return ScorecardRead.model_validate(scorecard)

    def delete(
        self,
        session: Session,
        user_id: uuid.UUID,
        scorecard_id: uuid.UUID,
    ) -> None:
        scorecard = self.get_by_id(session, user_id, scorecard_id)
        session.delete(scorecard)
        session.commit()


scorecard_service = ScorecardService()

