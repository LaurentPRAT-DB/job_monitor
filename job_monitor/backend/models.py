"""Pydantic models for Job Monitor API."""

from pydantic import BaseModel


class UserInfo(BaseModel):
    """User information model."""

    email: str
    display_name: str | None = None


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    version: str
    user: str | None = None
