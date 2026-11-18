"""Audit log service — recording and querying candidate and pipeline audit trails."""
import uuid
from typing import Any, List, Optional

from sqlmodel import Session, func, select

from app.models.audit_log import AuditLog
from app.models.candidate import Candidate
from app.models.job_opening import JobOpening
from app.schemas.audit_log import AuditLogRead, PaginatedAuditLogs


class AuditLogService:
    def record(
        self,
        session: Session,
        user_id: uuid.UUID,
        action: str,
        candidate_id: Optional[uuid.UUID] = None,
        opening_id: Optional[uuid.UUID] = None,
        from_stage: Optional[str] = None,
        to_stage: Optional[str] = None,
        details: Optional[str] = None,
    ) -> AuditLog:
        """Record an immutable audit log entry."""
        log = AuditLog(
            user_id=user_id,
            action=action,
            candidate_id=candidate_id,
            opening_id=opening_id,
            from_stage=from_stage,
            to_stage=to_stage,
            details=details,
        )
        session.add(log)
        session.commit()
        session.refresh(log)
        return log

    def log_action(
        self,
        session: Session,
        user_id: uuid.UUID,
        action: str,
        entity_type: Optional[str] = None,
        entity_id: Optional[uuid.UUID] = None,
        details: Optional[Any] = None,
        candidate_id: Optional[uuid.UUID] = None,
        opening_id: Optional[uuid.UUID] = None,
    ) -> AuditLog:
        """Convenience helper for structured action logging."""
        import json
        cid = candidate_id or (entity_id if entity_type == "candidate" else None)
        oid = opening_id or (entity_id if entity_type == "opening" else None)
        details_str = (
            json.dumps(details)
            if isinstance(details, (dict, list))
            else (str(details) if details is not None else None)
        )
        return self.record(
            session=session,
            user_id=user_id,
            action=action,
            candidate_id=cid,
            opening_id=oid,
            details=details_str,
        )

    def list_recent(
        self,
        session: Session,
        user_id: uuid.UUID,
        opening_id: Optional[uuid.UUID] = None,
        limit: int = 50,
        skip: int = 0,
    ) -> PaginatedAuditLogs:
        """List recent audit log entries scoped to the user."""
        query = select(AuditLog).where(AuditLog.user_id == user_id)
        count_query = select(func.count(AuditLog.id)).where(AuditLog.user_id == user_id)

        if opening_id:
            query = query.where(AuditLog.opening_id == opening_id)
            count_query = count_query.where(AuditLog.opening_id == opening_id)

        total = session.exec(count_query).one() or 0
        logs = session.exec(
            query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
        ).all()

        items: List[AuditLogRead] = []
        for l in logs:
            cand_name = None
            if l.candidate_id:
                cand = session.exec(
                    select(Candidate.name).where(Candidate.id == l.candidate_id)
                ).first()
                cand_name = cand

            op_title = None
            if l.opening_id:
                op = session.exec(
                    select(JobOpening.title).where(JobOpening.id == l.opening_id)
                ).first()
                op_title = op

            items.append(
                AuditLogRead(
                    id=l.id,
                    user_id=l.user_id,
                    candidate_id=l.candidate_id,
                    candidate_name=cand_name,
                    opening_id=l.opening_id,
                    opening_title=op_title,
                    action=l.action,
                    from_stage=l.from_stage,
                    to_stage=l.to_stage,
                    details=l.details,
                    created_at=l.created_at,
                )
            )

        return PaginatedAuditLogs(items=items, total=total)

    def list_for_candidate(
        self,
        session: Session,
        user_id: uuid.UUID,
        candidate_id: uuid.UUID,
        limit: int = 50,
    ) -> List[AuditLogRead]:
        """List audit events specifically for a given candidate."""
        logs = session.exec(
            select(AuditLog)
            .where(
                AuditLog.user_id == user_id,
                AuditLog.candidate_id == candidate_id,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        ).all()

        cand = session.exec(
            select(Candidate.name).where(Candidate.id == candidate_id)
        ).first()

        items: List[AuditLogRead] = []
        for l in logs:
            op_title = None
            if l.opening_id:
                op = session.exec(
                    select(JobOpening.title).where(JobOpening.id == l.opening_id)
                ).first()
                op_title = op

            items.append(
                AuditLogRead(
                    id=l.id,
                    user_id=l.user_id,
                    candidate_id=l.candidate_id,
                    candidate_name=cand,
                    opening_id=l.opening_id,
                    opening_title=op_title,
                    action=l.action,
                    from_stage=l.from_stage,
                    to_stage=l.to_stage,
                    details=l.details,
                    created_at=l.created_at,
                )
            )

        return items


audit_log_service = AuditLogService()
