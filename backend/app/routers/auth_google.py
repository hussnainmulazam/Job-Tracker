"""Google OAuth2 authentication router."""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.core.config import settings
from app.core.dependencies import CurrentUser
from app.db import SessionDep
from app.schemas.google import GoogleAuthUrlResponse
from app.services.google_service import GoogleService

router = APIRouter(tags=["Google OAuth2"])


@router.get(
    "/auth/google/login",
    response_model=GoogleAuthUrlResponse,
    summary="Get Google OAuth2 authorization URL",
)
def google_login(
    current_user: CurrentUser,
    session: SessionDep,
) -> GoogleAuthUrlResponse:
    """
    Initiates Google OAuth2 authorization code flow with offline access (refresh token).
    Encodes the current authenticated recruiter's user_id in the state parameter.
    """
    service = GoogleService(session)
    return service.generate_auth_url(current_user.id)


@router.get(
    "/auth/google/callback",
    summary="Google OAuth2 callback redirect handler",
)
def google_callback(
    session: SessionDep,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    """
    Handles redirect callback from Google OAuth2 consent screen.
    Exchanges code for tokens, encrypts the refresh token using Fernet,
    stores the account in the database, and redirects the recruiter to frontend settings.
    """
    if error:
        redirect_target = f"{settings.FRONTEND_URL}/settings?google_error={error}"
        return RedirectResponse(url=redirect_target, status_code=status.HTTP_302_FOUND)

    if not code or not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing code or state in OAuth callback.",
        )

    service = GoogleService(session)
    try:
        account, user_id = service.handle_callback(code, state)
    except ValueError as exc:
        redirect_target = f"{settings.FRONTEND_URL}/settings?google_error={str(exc)}"
        return RedirectResponse(url=redirect_target, status_code=status.HTTP_302_FOUND)

    redirect_target = f"{settings.FRONTEND_URL}/settings?google_connected=true&email={account.email}"
    return RedirectResponse(url=redirect_target, status_code=status.HTTP_302_FOUND)
