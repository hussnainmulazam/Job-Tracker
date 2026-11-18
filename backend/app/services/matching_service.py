"""
Matching Service — handles candidate-to-opening CV matching with OpenRouter scoring,
result caching, re-run capability, and background progress tracking.
"""
import asyncio
import logging
import uuid
from collections.abc import Generator
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlmodel import Session, select

from app.models.candidate import Candidate
from app.models.job_opening import JobOpening
from app.schemas.job_opening import MatchProgressStatus
from app.services.ai import screen_candidate_cv

logger = logging.getLogger(__name__)

# In-memory progress tracking keyed by opening_id
MATCH_JOBS: Dict[uuid.UUID, Dict[str, Any]] = {}


def get_scoped_session() -> Generator[Session, None, None]:
    """Acquire a database session honoring FastAPI dependency overrides (e.g. during pytest)."""
    from app.db import engine, get_session
    try:
        from app.main import app
        override_fn = app.dependency_overrides.get(get_session)
        if override_fn:
            gen = override_fn()
            return gen
    except Exception:
        pass

    def _default_gen():
        with Session(engine) as s:
            yield s

    return _default_gen()


def get_match_status(opening_id: uuid.UUID) -> MatchProgressStatus:
    """Return the current background matching job status for a given opening."""
    job = MATCH_JOBS.get(opening_id)
    if not job:
        return MatchProgressStatus(
            opening_id=opening_id,
            status="idle",
            total_candidates=0,
            processed_candidates=0,
            matched_candidates=0,
            progress_percent=0.0,
            errors=[],
        )
    return MatchProgressStatus(**job)


async def run_matching_job(
    opening_id: uuid.UUID,
    user_id: uuid.UUID,
    rerun: bool = False,
    session: Optional[Session] = None,
) -> None:
    """
    Background worker that scores every unmatched CV against the target opening:
      - Fetches candidates linked to this opening (or all candidates if rerun=True)
      - Computes 0-100 score, matched_skills, missing_skills, red_flags, one-paragraph reason
      - Caches in candidates table
      - Updates progress status in real-time
    """
    logger.info("Starting matching job for opening=%s (rerun=%s)", opening_id, rerun)
    started_at = datetime.now(timezone.utc)

    # Acquire session generator if not explicitly passed
    session_gen = None
    if session is None:
        session_gen = get_scoped_session()
        db_session = next(session_gen)
    else:
        db_session = session

    try:
        opening = db_session.exec(
            select(JobOpening).where(
                JobOpening.id == opening_id,
                JobOpening.user_id == user_id,
            )
        ).first()

        if not opening:
            MATCH_JOBS[opening_id] = {
                "opening_id": opening_id,
                "status": "failed",
                "total_candidates": 0,
                "processed_candidates": 0,
                "matched_candidates": 0,
                "progress_percent": 0.0,
                "errors": [f"Job opening '{opening_id}' not found."],
                "started_at": started_at,
                "completed_at": datetime.now(timezone.utc),
            }
            return

        # Query candidates for this opening
        query = select(Candidate).where(
            Candidate.opening_id == opening_id,
            Candidate.user_id == user_id,
        )
        if not rerun:
            # Score only unmatched candidates
            query = query.where(Candidate.score.is_(None))

        candidates = db_session.exec(query).all()
        candidate_ids = [c.id for c in candidates]

        total = len(candidate_ids)
        logger.info("Matching job: found %d candidate(s) for opening=%s (ids=%s)", total, opening_id, candidate_ids)
        MATCH_JOBS[opening_id] = {
            "opening_id": opening_id,
            "status": "in_progress" if total > 0 else "completed",
            "total_candidates": total,
            "processed_candidates": 0,
            "matched_candidates": 0,
            "progress_percent": 0.0 if total > 0 else 100.0,
            "errors": [],
            "started_at": started_at,
            "completed_at": datetime.now(timezone.utc) if total == 0 else None,
        }

        if total == 0:
            logger.info("No candidates to score for opening=%s", opening_id)
            return

        processed = 0
        matched = 0
        errors: List[str] = []

        for cid in candidate_ids:
            try:
                cand = db_session.get(Candidate, cid)
                op = db_session.get(JobOpening, opening_id)
                if not cand or not op:
                    logger.warning("Candidate %s or Opening %s not found in DB", cid, opening_id)
                    continue

                # Run AI screening
                eval_res = await screen_candidate_cv(
                    job_title=op.title,
                    job_description=op.description,
                    required_skills=op.required_skills,
                    candidate_name=cand.name,
                    cv_text=cand.cv_text,
                )

                # Cache results in candidate record
                cand.score = eval_res["score"]
                cand.matched_skills = eval_res["matched_skills"]
                cand.missing_skills = eval_res["missing_skills"]
                cand.red_flags = eval_res["red_flags"]
                cand.summary = eval_res["summary"]
                cand.updated_at = datetime.now(timezone.utc)

                db_session.add(cand)
                db_session.commit()
                db_session.refresh(cand)
                matched += 1
                logger.info("Candidate %s successfully scored: %.1f", cid, cand.score)
            except Exception as exc:
                err_msg = f"Failed scoring candidate {cid}: {exc}"
                logger.exception(err_msg)
                errors.append(err_msg)

            processed += 1
            pct = round((processed / total) * 100.0, 1)
            MATCH_JOBS[opening_id].update({
                "processed_candidates": processed,
                "matched_candidates": matched,
                "progress_percent": pct,
                "errors": errors,
            })

        MATCH_JOBS[opening_id].update({
            "status": "completed" if not errors else ("completed" if matched > 0 else "failed"),
            "completed_at": datetime.now(timezone.utc),
        })
        logger.info("Finished matching job for opening=%s: matched %d/%d", opening_id, matched, total)
    except Exception as exc:
        logger.exception("Fatal error in run_matching_job for opening=%s: %s", opening_id, exc)
        MATCH_JOBS[opening_id] = {
            "opening_id": opening_id,
            "status": "failed",
            "total_candidates": 0,
            "processed_candidates": 0,
            "matched_candidates": 0,
            "progress_percent": 0.0,
            "errors": [str(exc)],
            "started_at": started_at,
            "completed_at": datetime.now(timezone.utc),
        }
    finally:
        if session_gen:
            try:
                next(session_gen)
            except StopIteration:
                pass
