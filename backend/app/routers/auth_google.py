"""Google Workspace OAuth2 integration router (Settings > Google Workspace)."""
import urllib.parse
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.core.config import settings
from app.core.dependencies import CurrentUser
from app.core.security import decode_oauth_state
from app.db import SessionDep
from app.schemas.google import GoogleAuthUrlResponse
from app.services.auth_service import auth_service
from app.services.google_service import GoogleService

router = APIRouter(tags=["Google Workspace OAuth2"])


@router.get(
    "/auth/google/login",
    response_model=GoogleAuthUrlResponse,
    summary="Get Google Workspace OAuth2 authorization URL",
)
@router.get(
    "/integrations/google/url",
    response_model=GoogleAuthUrlResponse,
    summary="Get Google Workspace OAuth2 authorization URL (alias)",
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
    summary="Google OAuth2 callback redirect handler (supports both Workspace and Login flows)",
)
def google_callback(
    session: SessionDep,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    """
    Handles redirect callback from Google OAuth2 consent screen.
    Dispatches based on signed state token:
      - flow="workspace": exchanges code, stores encrypted refresh token, redirects to Settings > Google Workspace.
      - flow="login": exchanges code, authenticates/creates user, issues JWT, sets cookie, redirects to /auth/callback.
    """
    frontend_url = settings.FRONTEND_URL.rstrip("/")

    # Detect flow from signed state
    flow = "workspace"
    if state:
        try:
            state_data = decode_oauth_state(state)
            flow = state_data.get("flow", "workspace")
        except Exception:
            flow = "workspace"

    # 1. Google-level consent error or user denial
    if error:
        error_msg = "Google sign-in was cancelled." if error == "access_denied" else f"Google error: {error}"
        if flow == "login":
            return RedirectResponse(
                url=f"{frontend_url}/login?error={urllib.parse.quote(error_msg)}",
                status_code=status.HTTP_302_FOUND,
            )
        return RedirectResponse(
            url=f"{frontend_url}/settings?google_error={urllib.parse.quote(error_msg)}&tab=google",
            status_code=status.HTTP_302_FOUND,
        )

    # 2. Missing code or state
    if not code:
        if flow == "login":
            return RedirectResponse(
                url=f"{frontend_url}/login?error=Missing+authorization+code+from+Google.",
                status_code=status.HTTP_302_FOUND,
            )
        return RedirectResponse(
            url=f"{frontend_url}/settings?google_error=Missing+authorization+code+from+Google.&tab=google",
            status_code=status.HTTP_302_FOUND,
        )

    if not state:
        if flow == "login":
            return RedirectResponse(
                url=f"{frontend_url}/login?error=Missing+state+parameter+or+CSRF+detected.",
                status_code=status.HTTP_302_FOUND,
            )
        return RedirectResponse(
            url=f"{frontend_url}/settings?google_error=Missing+state+parameter+or+CSRF+detected.&tab=google",
            status_code=status.HTTP_302_FOUND,
        )

    # 3. Handle Flow A: User Login / Signup
    if flow == "login":
        try:
            auth_res = auth_service.authenticate_google(session=session, code=code, state=state)
        except ValueError as exc:
            return RedirectResponse(
                url=f"{frontend_url}/login?error={urllib.parse.quote(str(exc))}",
                status_code=status.HTTP_302_FOUND,
            )

        setup_str = "true" if auth_res.setup_completed else "false"
        token = auth_res.access_token
        redirect_url = f"{frontend_url}/auth/callback?token={urllib.parse.quote(token)}&setup_completed={setup_str}"
        response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
        response.set_cookie(
            key="auth_token",
            value=token,
            max_age=60 * 60 * 24 * 7,
            path="/",
            httponly=True,
            samesite="lax",
            secure=False,
        )
        return response

    # 4. Handle Flow B: Workspace Connection (Settings > Google Workspace)
    service = GoogleService(session)
    try:
        account, user_id = service.handle_callback(code, state)
    except ValueError as exc:
        return RedirectResponse(
            url=f"{frontend_url}/settings?google_error={urllib.parse.quote(str(exc))}&tab=google",
            status_code=status.HTTP_302_FOUND,
        )

    status_param = "google_connected=1&partial=1" if account.last_sync_status == "partial_access" else "google_connected=1"
    redirect_target = f"{frontend_url}/settings?{status_param}&email={urllib.parse.quote(account.email)}&tab=google"
    return RedirectResponse(url=redirect_target, status_code=status.HTTP_302_FOUND)
