"""
app/services/auth_service.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Business logic for user registration, login, and lookup.
Keeps routers thin — all DB queries and security calls live here.
"""
from typing import Optional

from sqlmodel import Session, select

from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserPublic


class AuthService:

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def get_by_email(session: Session, email: str) -> Optional[User]:
        return session.exec(select(User).where(User.email == email)).first()

    @staticmethod
    def get_by_id(session: Session, user_id) -> Optional[User]:
        return session.get(User, user_id)

    # ── Register ─────────────────────────────────────────────────────────────

    @staticmethod
    def register(session: Session, data: RegisterRequest) -> TokenResponse:
        """
        Create a new user, hash their password, and return a token + public profile.
        Raises ValueError if the email is already registered.
        """
        existing = AuthService.get_by_email(session, data.email)
        if existing:
            raise ValueError("A user with that email already exists.")

        user = User(
            email=data.email,
            hashed_password=hash_password(data.password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        token = create_access_token(str(user.id))
        return TokenResponse(
            access_token=token,
            user=UserPublic.model_validate(user),
        )

    # ── Login ─────────────────────────────────────────────────────────────────

    @staticmethod
    def login(session: Session, data: LoginRequest) -> TokenResponse:
        """
        Verify credentials and return a fresh token.
        Always raises the same generic error to prevent user-enumeration.
        """
        INVALID_MSG = "Invalid email or password."

        user = AuthService.get_by_email(session, data.email)
        if not user:
            raise ValueError(INVALID_MSG)

        if not verify_password(data.password, user.hashed_password):
            raise ValueError(INVALID_MSG)

        token = create_access_token(str(user.id))
        return TokenResponse(
            access_token=token,
            user=UserPublic.model_validate(user),
        )


auth_service = AuthService()

