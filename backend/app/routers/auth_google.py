"""Google Workspace OAuth2 integration router (Settings > Google Workspace)."""
import urllib.parse
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

router = APIRouter(tags=["Google Workspace OAuth2"])


@router.get(
    "/auth/google/login",
    response_model=GoogleAuthUrlResponse,
    summary="Get Google Workspace OAuth2 authorization URL",
)
def google_login(
    current_user: CurrentUser,
    session: SessionDep,
) -> GoogleAuthUrlResponse:
    """
    Initiates Google Workspace OAuth2 authorization code flow with offline access (refresh token).
    Encodes current authenticated recruiter user_id in signed state parameter with flow="workspace".
    """
    service = GoogleService(session)
    return service.generate_auth_url(current_user.id)


@router.get(
    "/auth/google/callback",
    summary="Google Workspace OAuth2 callback redirect handler",
)
def google_callback(
    session: SessionDep,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    """
    Handles redirect callback from Google OAuth2 consent screen for Workspace connection.
    Exchanges code for tokens using GOOGLE_WORKSPACE_REDIRECT_URI, verifies state token,
    encrypts the refresh token using Fernet, stores account in database,
    and redirects the recruiter to Settings > Google Workspace.
    """
    frontend_url = settings.FRONTEND_URL.rstrip("/")

    # 1. Google-level consent error or user denial
    if error:
        if error == "access_denied":
            error_msg = "Google sign-in was cancelled."
        else:
            error_msg = f"Google connection error: {error}"
        return RedirectResponse(
            url=f"{frontend_url}/settings?google_error={urllib.parse.quote(error_msg)}",
            status_code=status.HTTP_302_FOUND,
        )

    # 2. Missing code or state
    if not code:
        return RedirectResponse(
            url=f"{frontend_url}/settings?google_error=Missing+authorization+code+from+Google.",
            status_code=status.HTTP_302_FOUND,
        )

    if not state:
        return RedirectResponse(
            url=f"{frontend_url}/settings?google_error=Missing+state+parameter+or+CSRF+detected.",
            status_code=status.HTTP_302_FOUND,
        )

    # 3. Handle code exchange and account linking
    service = GoogleService(session)
    try:
        account, user_id = service.handle_callback(code, state)
    except ValueError as exc:
        return RedirectResponse(
            url=f"{frontend_url}/settings?google_error={urllib.parse.quote(str(exc))}",
            status_code=status.HTTP_302_FOUND,
        )

    # 4. Redirect back to Settings > Google Workspace
    status_param = "partial=1" if account.last_sync_status == "partial_access" else "google_connected=1"
    redirect_target = f"{frontend_url}/settings?{status_param}&email={urllib.parse.quote(account.email)}"
    return RedirectResponse(url=redirect_target, status_code=status.HTTP_302_FOUND)

