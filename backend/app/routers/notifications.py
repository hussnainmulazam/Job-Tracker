"""FastAPI router for recruiter notifications and system alerts."""
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.schemas.notification import NotificationListResponse, NotificationRead
from app.services.notification_service import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List recruiter notifications and unread count",
)
def list_notifications(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = Query(30, ge=1, le=100),
) -> NotificationListResponse:
    """Retrieve notifications list and unread count for current recruiter."""
    return notification_service.list(
        session=session,
        user_id=current_user.id,
        limit=limit,
    )


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationRead,
    summary="Mark single notification as read",
)
def mark_notification_read(
    notification_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> NotificationRead:
    """Mark a notification as read."""
    try:
        return notification_service.mark_as_read(
            session=session,
            user_id=current_user.id,
            notification_id=notification_id,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )


@router.post(
    "/read-all",
    summary="Mark all recruiter notifications as read",
)
def mark_all_notifications_read(
    session: SessionDep,
    current_user: CurrentUser,
):
    """Mark all unread notifications as read."""
    updated = notification_service.mark_all_read(
        session=session,
        user_id=current_user.id,
    )
    return {"updated": updated, "message": f"Marked {updated} notification(s) as read."}
