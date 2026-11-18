"""
app/routers/auth.py
~~~~~~~~~~~~~~~~~~~
Authentication endpoints:

  POST /api/v1/auth/register   — create account, return token + user
  POST /api/v1/auth/login      — verify credentials, return token + user
  POST /api/v1/auth/login/form — OAuth2 form-compatible login (Swagger UI)
  GET  /api/v1/auth/me         — return current authenticated user
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.dependencies import CurrentUser
from app.core.rate_limit import rate_limit
from app.db import SessionDep
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserPublic
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

