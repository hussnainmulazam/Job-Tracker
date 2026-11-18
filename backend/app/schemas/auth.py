"""
app/schemas/auth.py
~~~~~~~~~~~~~~~~~~~
Request / response Pydantic schemas for the /auth endpoints.
hashed_password is NEVER present in any response schema.
"""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


# ── Request schemas ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    """Body expected by POST /auth/register."""
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v


class LoginRequest(BaseModel):
    """Body expected by POST /auth/login."""
    email: EmailStr
    password: str


# ── Response schemas ─────────────────────────────────────────────────────────

class UserPublic(BaseModel):
    """
    Safe user representation — hashed_password is intentionally absent.
    Returned by both /register and /me.
    """
    id: uuid.UUID
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    """Returned by /login and /register."""
    access_token: str
    token_type: str = "bearer"
    user: UserPublic

