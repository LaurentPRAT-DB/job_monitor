"""Authentication router for Job Monitor."""

from typing import Annotated

from fastapi import APIRouter, Depends

from job_monitor.backend.core import get_current_user
from job_monitor.backend.models import UserInfo

router = APIRouter(tags=["auth"])


@router.get("/api/me", response_model=UserInfo)
async def get_me(
    user_email: Annotated[str, Depends(get_current_user)],
) -> UserInfo:
    """Return current user information.

    In production (Databricks App), returns the authenticated user's email.
    In local development, returns 'local-dev-user'.
    """
    return UserInfo(
        email=user_email,
        display_name=user_email.split("@")[0] if "@" in user_email else user_email,
    )
