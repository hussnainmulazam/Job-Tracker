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
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlmodel import Session

from app.core.security import decode_access_token
from app.db import get_session
from app.models.user import User

# Tells FastAPI (and Swagger UI) where the token endpoint lives.
# tokenUrl is used only by the OpenAPI/Swagger "Authorize" button.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login/form")


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    """
    Dependency: resolve a Bearer JWT → User row.

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

    try:
        payload = decode_access_token(token)
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

