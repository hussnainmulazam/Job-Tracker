"""
app/core/dependencies.py
~~~~~~~~~~~~~~~~~~~~~~~~
FastAPI dependencies shared across routers.

get_current_user
    Extracts and validates the Bearer JWT from the Authorization header,
    looks up the matching User row, and injects it into the route handler.
    Returns HTTP 401 on any auth failure — expiry, bad signature, missing
    user — with a consistent WWW-Authenticate header so clients know to
    re-authenticate.
"""
import uuid
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlmodel import Session

from app.core.security import decode_access_token
from app.db import get_session
from app.models.user import User

# Tells FastAPI (and Swagger UI) where the token endpoint lives.
# tokenUrl is used only by the OpenAPI/Swagger "Authorize" button.
# auto_error=False allows falling back to cookies or custom Authorization headers
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login/form", auto_error=False)


def get_current_user(
    request: Request,
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    """
    Dependency: resolve a Bearer JWT or auth_token cookie → User row.

    Inject into any route that requires authentication:

        @router.get("/me")
        def me(user: Annotated[User, Depends(get_current_user)]):
            ...
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    raw_token = token
    if not raw_token:
        # Check cookie (persisted during Google OAuth login)
        raw_token = request.cookies.get("auth_token")
    if not raw_token:
        # Check Authorization header manually as fallback
        auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            raw_token = auth_header[7:].strip()
    if not raw_token:
        # Check query parameter token fallback
        raw_token = request.query_params.get("token")

    if not raw_token:
        raise credentials_exc

    try:
        payload = decode_access_token(raw_token)
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise credentials_exc

    user = session.get(User, user_id)
    if user is None:
        raise credentials_exc

    return user


# Convenience type alias — use in route signatures for brevity
CurrentUser = Annotated[User, Depends(get_current_user)]

