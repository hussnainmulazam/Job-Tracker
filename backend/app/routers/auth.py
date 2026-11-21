"""
app/routers/auth.py
~~~~~~~~~~~~~~~~~~~
Authentication endpoints:

  POST /api/v1/auth/register   — create account, return token + user
  POST /api/v1/auth/login      — verify credentials, return token + user
  POST /api/v1/auth/login/form — OAuth2 form-compatible login (Swagger UI)
  GET  /api/v1/auth/me         — return current authenticated user
"""
import json
import urllib.parse
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm

from app.core.dependencies import CurrentUser
from app.core.rate_limit import rate_limit
from app.db import SessionDep
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserPublic,
    GoogleAuthRequest,
    GoogleAuthResponse,
)
from app.services.auth_service import auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Register ─────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new account",
    dependencies=[Depends(rate_limit(times=10, seconds=60, scope="auth:register"))],
)
def register(body: RegisterRequest, session: SessionDep) -> TokenResponse:
    """
    Register a new user.

    - Hashes the password with **bcrypt** before storage.
    - Returns a signed JWT access token alongside the public user profile.
    - `hashed_password` is **never** included in any response.
    """
    try:
        return auth_service.register(session=session, data=body)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


# ── Login (JSON body) ─────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and receive a JWT",
    dependencies=[Depends(rate_limit(times=10, seconds=60, scope="auth:login"))],
)
def login(body: LoginRequest, session: SessionDep) -> TokenResponse:
    """
    Authenticate with **email + password** (JSON body).

    Returns a Bearer access token. The same error message is used whether the
    email does not exist or the password is wrong, to prevent user enumeration.
    """
    try:
        return auth_service.login(session=session, data=body)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Login (OAuth2 form — Swagger UI "Authorize" button) ──────────────────────

@router.post(
    "/login/form",
    response_model=TokenResponse,
    include_in_schema=True,
    summary="Authenticate via OAuth2 form (Swagger UI)",
)
def login_form(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: SessionDep,
) -> TokenResponse:
    """
    OAuth2-compatible form login consumed by the Swagger UI "Authorize" dialog.
    Uses `username` field as email (standard OAuth2 form field name).
    """
    try:
        return auth_service.login(
            session=session,
            data=LoginRequest(email=form.username, password=form.password),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserPublic,
    summary="Get the currently authenticated user",
)
def me(current_user: CurrentUser) -> UserPublic:
    """
    Return the profile of the **currently authenticated** user.

    Requires a valid `Authorization: Bearer <token>` header.
    Returns HTTP 401 if the token is missing, expired, or invalid.
    """
    return UserPublic.model_validate(current_user)


# ── Google OAuth Login / Signup ──────────────────────────────────────────────

@router.get(
    "/google/url",
    summary="Get Google OAuth2 authorization URL for login / signup",
)
def google_auth_url():
    """
    Returns the Google OAuth2 consent URL for recruiter login/signup.
    Includes a signed state token to prevent CSRF and isolate the login flow.
    """
    try:
        url = auth_service.get_google_auth_url()
        return {"url": url}
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.get(
    "/google/login",
    summary="Direct full-page redirect to Google OAuth2 consent screen for login/signup",
)
def google_login():
    """
    Redirects recruiter browser to Google OAuth2 consent screen.
    """
    try:
        url = auth_service.get_google_auth_url()
        return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.get(
    "/google/callback",
    summary="Google OAuth2 login and signup callback handler",
)
def google_callback(
    session: SessionDep,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    """
    Handles redirect callback from Google OAuth2 consent screen for recruiter login and signup.
    Exchanges code for tokens using GOOGLE_LOGIN_REDIRECT_URI, verifies state token,
    finds or creates user, issues JWT session, sets auth cookie, and redirects to frontend callback page.
    """
    from app.core.config import settings

    frontend_url = settings.FRONTEND_URL.rstrip("/")

    # 1. Google-level consent error or user denial
    if error:
        if error == "access_denied":
            error_msg = "Google sign-in was cancelled."
        else:
            error_msg = f"Google sign-in error: {error}"
        return RedirectResponse(
            url=f"{frontend_url}/login?error={urllib.parse.quote(error_msg)}",
            status_code=status.HTTP_302_FOUND,
        )

    # 2. Missing authorization code
    if not code:
        error_msg = "Missing authorization code from Google."
        return RedirectResponse(
            url=f"{frontend_url}/login?error={urllib.parse.quote(error_msg)}",
            status_code=status.HTTP_302_FOUND,
        )

    # 3. Exchange code for tokens, verify state, create/find user, issue session
    try:
        auth_res = auth_service.authenticate_google(session=session, code=code, state=state)
    except ValueError as exc:
        error_msg = str(exc)
        return RedirectResponse(
            url=f"{frontend_url}/login?error={urllib.parse.quote(error_msg)}",
            status_code=status.HTTP_302_FOUND,
        )

    # 4. Success: redirect to frontend callback page with token and setup status
    setup_str = "true" if auth_res.setup_completed else "false"
    token = auth_res.access_token

    redirect_url = f"{frontend_url}/auth/callback?token={urllib.parse.quote(token)}&setup_completed={setup_str}"
    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)

    # Also set HTTP-only cookie on response for localhost
    response.set_cookie(
        key="auth_token",
        value=token,
        max_age=60 * 60 * 24 * 7,  # 7 days
        path="/",
        httponly=True,
        samesite="lax",
        secure=False,
    )
    return response


@router.post(
    "/google",
    response_model=GoogleAuthResponse,
    summary="Authenticate or register user via Google OAuth2 authorization code",
    dependencies=[Depends(rate_limit(times=15, seconds=60, scope="auth:google"))],
)
def google_authenticate(body: GoogleAuthRequest, session: SessionDep) -> GoogleAuthResponse:
    """
    Exchanges code for tokens, verifies profile, logs in or registers user,
    and returns JWT token + setup_completed status.
    """
    try:
        return auth_service.authenticate_google(
            session=session,
            code=body.code,
            redirect_uri=body.redirect_uri,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


