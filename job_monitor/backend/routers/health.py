"""Health check endpoint for Job Monitor."""

import os

from fastapi import APIRouter, Request

from job_monitor.backend.config import settings

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health_check(request: Request) -> dict:
    """Return health status of the application with diagnostic info."""
    ws_client = getattr(request.app.state, "workspace_client", None)

    return {
        "status": "ok",
        "version": settings.app_version,
        "config": {
            "databricks_host": settings.databricks_host or "(not set)",
            "warehouse_id": settings.warehouse_id or "(not set)",
            "workspace_client_available": ws_client is not None,
        },
        "env_check": {
            "DATABRICKS_HOST": os.environ.get("DATABRICKS_HOST", "(not in env)"),
            "WAREHOUSE_ID": os.environ.get("WAREHOUSE_ID", "(not in env)"),
        },
    }
