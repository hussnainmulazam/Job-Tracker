"""Dashboard service — real-time aggregated metrics directly from database queries."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlmodel import Session, func, select

from app.models.candidate import Candidate, CandidateStage
from app.models.interview import Interview, InterviewStatus
from app.models.job_opening import JobOpening, JobOpeningStatus
from app.models.message import Message, MessageDirection
from app.models.audit_log import AuditLog
from app.schemas.dashboard import DashboardStatsResponse


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class DashboardService:
    def get_stats(self, session: Session, user_id: uuid.UUID) -> DashboardStatsResponse:
        """
        Compute recruitment KPI metrics from live Supabase Postgres tables.
        Zero mock data. Scoped strictly to the authenticated recruiter.
        """
        now_utc = datetime.now(timezone.utc)
        start_of_today = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=timezone.utc)
        start_of_week = start_of_today - timedelta(days=start_of_today.weekday())
        end_of_week = start_of_week + timedelta(days=7)

        # 1. Openings stats
        total_openings = (
            session.exec(
                select(func.count(JobOpening.id)).where(JobOpening.user_id == user_id)
            ).one()
            or 0
        )

        active_openings = (
            session.exec(
                select(func.count(JobOpening.id)).where(
                    JobOpening.user_id == user_id,
                    JobOpening.status == JobOpeningStatus.active,
                )
            ).one()
            or 0
        )

        # 2. Candidate counts
        total_candidates = (
            session.exec(
                select(func.count(Candidate.id)).where(Candidate.user_id == user_id)
            ).one()
            or 0
        )

        screened_candidates = (
            session.exec(
                select(func.count(Candidate.id)).where(
                    Candidate.user_id == user_id,
                    Candidate.score.isnot(None),
                )
            ).one()
            or 0
        )

        shortlisted_candidates = (
            session.exec(
                select(func.count(Candidate.id)).where(
                    Candidate.user_id == user_id,
                    Candidate.stage.in_([CandidateStage.interview, CandidateStage.offer]),
                )
            ).one()
            or 0
        )

        avg_score_raw = session.exec(
            select(func.avg(Candidate.score)).where(
                Candidate.user_id == user_id,
                Candidate.score.isnot(None),
            )
        ).one()
        average_score = round(float(avg_score_raw), 1) if avg_score_raw is not None else None

        # 3. New CVs today
        new_cvs_today = (
            session.exec(
                select(func.count(Candidate.id)).where(
                    Candidate.user_id == user_id,
                    Candidate.created_at >= start_of_today,
                )
            ).one()
            or 0
        )

        # 4. Pending reviews (candidates in applied or screening stages)
        pending_reviews = (
            session.exec(
                select(func.count(Candidate.id)).where(
                    Candidate.user_id == user_id,
                    Candidate.stage.in_([CandidateStage.applied, CandidateStage.screening]),
                )
            ).one()
            or 0
        )

        # 5. Interviews this week & today
        interviews_this_week = (
            session.exec(
                select(func.count(Interview.id)).where(
                    Interview.user_id == user_id,
                    Interview.status != InterviewStatus.cancelled,
                    Interview.start_time >= start_of_week,
                    Interview.start_time < end_of_week,
                )
            ).one()
            or 0
        )

        end_of_today = start_of_today + timedelta(days=1)
        interviews_today = (
            session.exec(
                select(func.count(Interview.id)).where(
                    Interview.user_id == user_id,
                    Interview.status != InterviewStatus.cancelled,
                    Interview.start_time >= start_of_today,
                    Interview.start_time < end_of_today,
                )
            ).one()
            or 0
        )

        # 5b. Weekly trend calculations (past 7 days vs previous 7 days)
        seven_days_ago = now_utc - timedelta(days=7)
        fourteen_days_ago = now_utc - timedelta(days=14)

        cands_this_week = (
            session.exec(
                select(func.count(Candidate.id)).where(
                    Candidate.user_id == user_id,
                    Candidate.created_at >= seven_days_ago,
                )
            ).one()
            or 0
        )
        cands_last_week = (
            session.exec(
                select(func.count(Candidate.id)).where(
                    Candidate.user_id == user_id,
                    Candidate.created_at >= fourteen_days_ago,
                    Candidate.created_at < seven_days_ago,
                )
            ).one()
            or 0
        )
        candidates_trend_pct = (
            round(((cands_this_week - cands_last_week) / cands_last_week) * 100, 1)
            if cands_last_week > 0
            else (100.0 if cands_this_week > 0 else 0.0)
        )

        openings_this_week = (
            session.exec(
                select(func.count(JobOpening.id)).where(
                    JobOpening.user_id == user_id,
                    JobOpening.created_at >= seven_days_ago,
                )
            ).one()
            or 0
        )
        openings_last_week = (
            session.exec(
                select(func.count(JobOpening.id)).where(
                    JobOpening.user_id == user_id,
                    JobOpening.created_at >= fourteen_days_ago,
                    JobOpening.created_at < seven_days_ago,
                )
            ).one()
            or 0
        )
        openings_trend_pct = (
            round(((openings_this_week - openings_last_week) / openings_last_week) * 100, 1)
            if openings_last_week > 0
            else (100.0 if openings_this_week > 0 else 0.0)
        )

        interviews_this_7d = (
            session.exec(
                select(func.count(Interview.id)).where(
                    Interview.user_id == user_id,
                    Interview.status != InterviewStatus.cancelled,
                    Interview.start_time >= seven_days_ago,
                )
            ).one()
            or 0
        )
        interviews_prior_7d = (
            session.exec(
                select(func.count(Interview.id)).where(
                    Interview.user_id == user_id,
                    Interview.status != InterviewStatus.cancelled,
                    Interview.start_time >= fourteen_days_ago,
                    Interview.start_time < seven_days_ago,
                )
            ).one()
            or 0
        )
        interviews_trend_pct = (
            round(((interviews_this_7d - interviews_prior_7d) / interviews_prior_7d) * 100, 1)
            if interviews_prior_7d > 0
            else (100.0 if interviews_this_7d > 0 else 0.0)
        )

        # 5c. Applications over time timeline (last 14 days)
        applications_timeline: List[Dict[str, Any]] = []
        for day_offset in range(13, -1, -1):
            day_start = start_of_today - timedelta(days=day_offset)
            day_end = day_start + timedelta(days=1)
            cnt = (
                session.exec(
                    select(func.count(Candidate.id)).where(
                        Candidate.user_id == user_id,
                        Candidate.created_at >= day_start,
                        Candidate.created_at < day_end,
                    )
                ).one()
                or 0
            )
            applications_timeline.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "label": day_start.strftime("%b %d"),
                "day": day_start.strftime("%a"),
                "count": cnt,
            })

        # 6. Messages awaiting reply & threads
        user_candidates = session.exec(
            select(Candidate).where(Candidate.user_id == user_id)
        ).all()

        messages_awaiting_reply = 0
        awaiting_reply_threads: List[Dict[str, Any]] = []

        for cand in user_candidates:
            latest_msg = session.exec(
                select(Message)
                .where(Message.candidate_id == cand.id, Message.user_id == user_id)
                .order_by(Message.created_at.desc())
            ).first()

            if latest_msg:
                dir_val = (
                    latest_msg.direction.value
                    if hasattr(latest_msg.direction, "value")
                    else str(latest_msg.direction)
                )
                if dir_val == "inbound":
                    messages_awaiting_reply += 1
                    if len(awaiting_reply_threads) < 5:
                        op = session.exec(
                            select(JobOpening.title).where(JobOpening.id == cand.opening_id)
                        ).first()
                        awaiting_reply_threads.append({
                            "candidate_id": str(cand.id),
                            "candidate_name": cand.name,
                            "candidate_email": cand.email,
                            "opening_title": op,
                            "last_message": latest_msg.body,
                            "received_at": latest_msg.created_at.isoformat(),
                            "hours_ago": round(
                                (now_utc - _ensure_utc(latest_msg.created_at)).total_seconds() / 3600.0,
                                1,
                            ),
                        })

        # 7. Time-to-shortlist (hours from candidate creation to interview/offer)
        advanced_candidates = session.exec(
            select(Candidate).where(
                Candidate.user_id == user_id,
                Candidate.stage.in_([CandidateStage.interview, CandidateStage.offer]),
            )
        ).all()

        time_to_shortlist_hours: Optional[float] = None
        if advanced_candidates:
            durations = [
                (_ensure_utc(c.updated_at) - _ensure_utc(c.created_at)).total_seconds() / 3600.0
                for c in advanced_candidates
                if c.updated_at and c.created_at
            ]
            if durations:
                time_to_shortlist_hours = round(sum(durations) / len(durations), 1)

        # 8. Stage breakdown & Funnel with percentages
        stage_counts = session.exec(
            select(Candidate.stage, func.count(Candidate.id))
            .where(Candidate.user_id == user_id)
            .group_by(Candidate.stage)
        ).all()

        stage_breakdown: Dict[str, int] = {
            CandidateStage.applied.value: 0,
            CandidateStage.screening.value: 0,
            CandidateStage.interview.value: 0,
            CandidateStage.offer.value: 0,
            CandidateStage.rejected.value: 0,
        }
        for stg, count in stage_counts:
            key = stg.value if hasattr(stg, "value") else str(stg)
            stage_breakdown[key] = count

        funnel_order = [
            (CandidateStage.applied.value, "Applied"),
            (CandidateStage.screening.value, "AI Screened"),
            (CandidateStage.interview.value, "Interview"),
            (CandidateStage.offer.value, "Offer"),
            (CandidateStage.rejected.value, "Rejected"),
        ]
        funnel_by_stage: List[Dict[str, Any]] = []
        for stage_key, stage_label in funnel_order:
            cnt = stage_breakdown.get(stage_key, 0)
            pct = round((cnt / total_candidates) * 100, 1) if total_candidates > 0 else 0.0
            funnel_by_stage.append({
                "stage": stage_key,
                "label": stage_label,
                "count": cnt,
                "percentage": pct,
            })

        # 9. Recent candidates
        recent_cands = session.exec(
            select(Candidate)
            .where(Candidate.user_id == user_id)
            .order_by(Candidate.updated_at.desc())
            .limit(5)
        ).all()

        recent_list: List[Dict[str, Any]] = []
        for rc in recent_cands:
            opening = session.exec(
                select(JobOpening).where(JobOpening.id == rc.opening_id)
            ).first()
            recent_list.append({
                "id": str(rc.id),
                "name": rc.name,
                "email": rc.email,
                "score": rc.score,
                "stage": rc.stage.value if hasattr(rc.stage, "value") else str(rc.stage),
                "opening_title": opening.title if opening else None,
                "created_at": rc.created_at.isoformat(),
            })

        # 10. Openings summary
        openings = session.exec(
            select(JobOpening)
            .where(JobOpening.user_id == user_id)
            .order_by(JobOpening.created_at.desc())
            .limit(10)
        ).all()

        openings_summary: List[Dict[str, Any]] = []
        for op in openings:
            cand_count = (
                session.exec(
                    select(func.count(Candidate.id)).where(Candidate.opening_id == op.id)
                ).one()
                or 0
            )
            cand_avg = session.exec(
                select(func.avg(Candidate.score)).where(
                    Candidate.opening_id == op.id,
                    Candidate.score.isnot(None),
                )
            ).one()
            openings_summary.append({
                "id": str(op.id),
                "title": op.title,
                "status": op.status.value if hasattr(op.status, "value") else str(op.status),
                "candidates_count": cand_count,
                "average_score": round(float(cand_avg), 1) if cand_avg is not None else None,
                "created_at": op.created_at.isoformat(),
            })

        # 11. Upcoming interviews
        upcoming_rows = session.exec(
            select(Interview)
            .where(
                Interview.user_id == user_id,
                Interview.status != InterviewStatus.cancelled,
                Interview.start_time >= now_utc,
            )
            .order_by(Interview.start_time.asc())
            .limit(5)
        ).all()

        upcoming_interviews: List[Dict[str, Any]] = []
        for up in upcoming_rows:
            op_title = None
            if up.opening_id:
                op = session.exec(select(JobOpening.title).where(JobOpening.id == up.opening_id)).first()
                op_title = op
            upcoming_interviews.append({
                "id": str(up.id),
                "title": up.title,
                "candidate_name": up.candidate_name,
                "candidate_email": up.candidate_email,
                "opening_title": op_title,
                "start_time": up.start_time.isoformat(),
                "end_time": up.end_time.isoformat(),
                "meet_link": up.meet_link,
                "status": up.status.value if hasattr(up.status, "value") else str(up.status),
            })

        # 12. Recent audit activity feed
        recent_logs = session.exec(
            select(AuditLog)
            .where(AuditLog.user_id == user_id)
            .order_by(AuditLog.created_at.desc())
            .limit(10)
        ).all()

        recent_activity: List[Dict[str, Any]] = []
        for log in recent_logs:
            cand_name = None
            if log.candidate_id:
                cand = session.exec(select(Candidate.name).where(Candidate.id == log.candidate_id)).first()
                cand_name = cand
            op_title = None
            if log.opening_id:
                op = session.exec(select(JobOpening.title).where(JobOpening.id == log.opening_id)).first()
                op_title = op
            recent_activity.append({
                "id": str(log.id),
                "action": log.action,
                "candidate_id": str(log.candidate_id) if log.candidate_id else None,
                "candidate_name": cand_name,
                "opening_title": op_title,
                "from_stage": log.from_stage,
                "to_stage": log.to_stage,
                "details": log.details,
                "created_at": log.created_at.isoformat(),
            })

        return DashboardStatsResponse(
            total_openings=total_openings,
            active_openings=active_openings,
            total_candidates=total_candidates,
            screened_candidates=screened_candidates,
            shortlisted_candidates=shortlisted_candidates,
            average_score=average_score,
            new_cvs_today=new_cvs_today,
            pending_reviews=pending_reviews,
            messages_awaiting_reply=messages_awaiting_reply,
            interviews_this_week=interviews_this_week,
            interviews_today=interviews_today,
            candidates_trend_pct=candidates_trend_pct,
            candidates_this_week=cands_this_week,
            openings_trend_pct=openings_trend_pct,
            interviews_trend_pct=interviews_trend_pct,
            time_to_shortlist_hours=time_to_shortlist_hours,
            stage_breakdown=stage_breakdown,
            funnel_by_stage=funnel_by_stage,
            applications_timeline=applications_timeline,
            recent_candidates=recent_list,
            recent_activity=recent_activity,
            openings_summary=openings_summary,
            upcoming_interviews=upcoming_interviews,
            awaiting_reply_threads=awaiting_reply_threads,
        )


dashboard_service = DashboardService()
