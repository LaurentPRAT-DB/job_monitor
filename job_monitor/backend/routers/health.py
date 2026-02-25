"""Health check endpoint for Job Monitor."""

import os
from typing import Annotated

from fastapi import APIRouter, Header, Request

from job_monitor.backend.config import settings

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health_check(
    request: Request,
    token: Annotated[str | None, Header(alias="X-Forwarded-Access-Token")] = None,
) -> dict:
    """Return health status of the application with diagnostic info."""
    ws_client = getattr(request.app.state, "workspace_client", None)

    # Log all headers for debugging
    all_headers = dict(request.headers)
    # Filter sensitive headers but show which ones exist
    header_names = list(all_headers.keys())
    auth_headers = {k: v[:20] + "..." if len(v) > 20 else v
                    for k, v in all_headers.items()
                    if "auth" in k.lower() or "token" in k.lower() or "forward" in k.lower()}

    return {
        "status": "ok",
        "version": settings.app_version,
        "config": {
            "databricks_host": settings.databricks_host or "(not set)",
            "warehouse_id": settings.warehouse_id or "(not set)",
            "workspace_client_available": ws_client is not None,
        },
        "auth": {
            "user_obo_token_available": token is not None,
            "user_obo_token_length": len(token) if token else 0,
            "service_principal_available": ws_client is not None,
            "auth_related_headers": auth_headers,
        },
        "debug": {
            "all_header_names": header_names,
        },
        "env_check": {
            "DATABRICKS_HOST": os.environ.get("DATABRICKS_HOST", "(not in env)"),
            "WAREHOUSE_ID": os.environ.get("WAREHOUSE_ID", "(not in env)"),
        },
    }
