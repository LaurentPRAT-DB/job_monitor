"""Health check endpoint for Job Monitor."""

from fastapi import APIRouter

from job_monitor.backend.config import settings

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health_check() -> dict:
    """Return health status of the application."""
    return {
        "status": "ok",
        "version": settings.app_version,
    }
