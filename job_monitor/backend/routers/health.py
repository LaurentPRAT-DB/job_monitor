"""Health check endpoint for Job Monitor."""

import os
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from job_monitor.backend.cache import check_cache_exists, get_cache_freshness
from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws_prefer_user
from job_monitor.backend.mock_data import is_auto_fallback_enabled, is_mock_mode

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
        "cache": {
            "enabled": settings.use_cache,
            "catalog": settings.cache_catalog,
            "schema": settings.cache_schema,
        },
        "mock_data": {
            "enabled": is_mock_mode(),
            "auto_fallback": is_auto_fallback_enabled(),
            "source": "env" if os.environ.get("USE_MOCK_DATA") else "config",
        },
    }


@router.get("/api/cache/status")
async def cache_status(
    ws=Depends(get_ws_prefer_user),
) -> dict:
    """Check cache status including freshness and availability."""
    if not ws:
        return {
            "available": False,
            "reason": "WorkspaceClient not available",
            "cache_enabled": settings.use_cache,
        }

    # Check if cache tables exist
    cache_exists = await check_cache_exists(ws)

    if not cache_exists:
        return {
            "available": False,
            "reason": "Cache tables not found. Run the refresh-metrics-cache job to create them.",
            "cache_enabled": settings.use_cache,
            "cache_table_prefix": settings.cache_table_prefix,
        }

    # Check freshness
    is_fresh, refreshed_at = await get_cache_freshness(ws)

    return {
        "available": True,
        "fresh": is_fresh,
        "refreshed_at": refreshed_at.isoformat() if refreshed_at else None,
        "cache_enabled": settings.use_cache,
        "cache_table_prefix": settings.cache_table_prefix,
        "message": "Cache is fresh and ready" if is_fresh else "Cache exists but may be stale (>1 hour old)",
    }
