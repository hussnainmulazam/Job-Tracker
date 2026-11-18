"""Notification service — dispatching and querying recruiter notifications."""
import uuid
from typing import List, Optional

from sqlmodel import Session, func, select

from app.models.notification import Notification
from app.schemas.notification import NotificationListResponse, NotificationRead


class NotificationService:
    def create(
        self,
        session: Session,
        user_id: uuid.UUID,
        title: str,
        message: str,
        type: str = "system",
        link: Optional[str] = None,
    ) -> Notification:
        """Create a new recruiter notification."""
        notif = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            link=link,
            is_read=False,
        )
        session.add(notif)
        session.commit()
        session.refresh(notif)
        return notif

    def list(
        self,
        session: Session,
        user_id: uuid.UUID,
        limit: int = 30,
    ) -> NotificationListResponse:
        """Retrieve recent notifications and unread count."""
        unread_count = (
            session.exec(
                select(func.count(Notification.id)).where(
                    Notification.user_id == user_id,
                    Notification.is_read == False,
                )
            ).one()
            or 0
        )

        notifications = session.exec(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        ).all()

        items = [NotificationRead.model_validate(n, from_attributes=True) for n in notifications]
        return NotificationListResponse(items=items, unread_count=unread_count)

    def mark_as_read(
        self,
        session: Session,
        user_id: uuid.UUID,
        notification_id: uuid.UUID,
    ) -> NotificationRead:
        """Mark a single notification as read."""
        notif = session.exec(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        ).first()

        if notif:
            notif.is_read = True
            session.add(notif)
            session.commit()
            session.refresh(notif)
            return NotificationRead.model_validate(notif, from_attributes=True)

        raise ValueError("Notification not found")

    def mark_all_read(self, session: Session, user_id: uuid.UUID) -> int:
        """Mark all notifications as read for current user."""
        unread = session.exec(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.is_read == False,
            )
        ).all()

        count = len(unread)
        for n in unread:
            n.is_read = True
            session.add(n)
        session.commit()
        return count


notification_service = NotificationService()
