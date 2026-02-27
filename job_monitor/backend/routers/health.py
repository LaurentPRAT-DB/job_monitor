"""Health check endpoint for Job Monitor.

Provides comprehensive health checks including:
- SQL warehouse connectivity
- OBO authentication validation
- System tables access
- Cache tables status
"""

import asyncio
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from job_monitor.backend.cache import check_cache_exists, get_cache_freshness
from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws_prefer_user
from job_monitor.backend.mock_data import is_auto_fallback_enabled, is_mock_mode
from job_monitor.backend.response_cache import response_cache

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


def extract_workspace_name(host: str | None) -> str:
    """Extract friendly workspace name from host URL.

    Examples:
        https://e2-demo-field-eng.cloud.databricks.com -> E2 Demo Field Eng
        https://dbc-abc123.cloud.databricks.com -> Dbc Abc123
    """
    if not host:
        return "unknown"
    match = re.search(r"https?://([^.]+)", host)
    if match:
        name = match.group(1).replace("-", " ").title()
        return name
    return host


async def check_sql_warehouse(ws, warehouse_id: str) -> dict:
    """Verify SQL warehouse is accessible and can execute queries."""
    if not ws or not warehouse_id:
        return {"status": "skipped", "reason": "No workspace client or warehouse ID"}

    start_time = time.time()
    try:
        result = ws.statement_execution.execute_statement(
            warehouse_id=warehouse_id,
            statement="SELECT 1 as health_check",
            wait_timeout="10s",
        )
        latency_ms = int((time.time() - start_time) * 1000)

        state = result.status.state.value if result.status else "UNKNOWN"
        if state == "SUCCEEDED":
            return {"status": "healthy", "latency_ms": latency_ms}
        else:
            return {"status": "degraded", "state": state, "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)
        if "WAREHOUSE_NOT_FOUND" in error_msg:
            return {"status": "unhealthy", "error": "Warehouse not found", "latency_ms": latency_ms}
        elif "PERMISSION_DENIED" in error_msg:
            return {"status": "unhealthy", "error": "No warehouse access", "latency_ms": latency_ms}
        elif "does not have any running clusters" in error_msg.lower():
            return {"status": "degraded", "error": "Warehouse stopped", "latency_ms": latency_ms}
        else:
            return {"status": "unhealthy", "error": error_msg[:100], "latency_ms": latency_ms}


async def check_obo_auth(token: str | None, host: str | None) -> dict:
    """Verify OBO user token is valid and can authenticate."""
    if not token:
        return {"status": "not_configured", "note": "OBO not enabled or local dev"}

    try:
        from databricks.sdk import WorkspaceClient

        obo_ws = WorkspaceClient(host=host, token=token)
        user = obo_ws.current_user.me()
        email = user.emails[0].value if user.emails else user.user_name
        return {
            "status": "healthy",
            "user": user.user_name,
            "email": email,
        }
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "Unauthorized" in error_msg:
            return {"status": "unhealthy", "error": "Invalid or expired token"}
        return {"status": "unhealthy", "error": error_msg[:100]}


async def check_system_tables(ws, warehouse_id: str) -> dict:
    """Verify access to system tables (requires OBO for most users)."""
    if not ws or not warehouse_id:
        return {"status": "skipped", "reason": "No workspace client or warehouse ID"}

    start_time = time.time()
    try:
        result = ws.statement_execution.execute_statement(
            warehouse_id=warehouse_id,
            statement="SELECT 1 FROM system.lakeflow.job_run_timeline LIMIT 1",
            wait_timeout="30s",
        )
        latency_ms = int((time.time() - start_time) * 1000)

        state = result.status.state.value if result.status else "UNKNOWN"
        if state == "SUCCEEDED":
            return {"status": "healthy", "latency_ms": latency_ms}
        else:
            return {"status": "degraded", "state": state, "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)
        if "PERMISSION_DENIED" in error_msg or "does not have permission" in error_msg.lower():
            return {
                "status": "unhealthy",
                "error": "No system table access - enable OBO",
                "latency_ms": latency_ms,
            }
        return {"status": "unhealthy", "error": error_msg[:100], "latency_ms": latency_ms}


async def check_cache_tables(ws, warehouse_id: str, catalog: str, schema: str) -> dict:
    """Verify cache tables are accessible."""
    if not ws or not warehouse_id:
        return {"status": "skipped", "reason": "No workspace client or warehouse ID"}

    start_time = time.time()
    try:
        result = ws.statement_execution.execute_statement(
            warehouse_id=warehouse_id,
            statement=f"SELECT 1 FROM {catalog}.{schema}.job_health_cache LIMIT 1",
            wait_timeout="10s",
        )
        latency_ms = int((time.time() - start_time) * 1000)

        state = result.status.state.value if result.status else "UNKNOWN"
        if state == "SUCCEEDED":
            return {"status": "healthy", "latency_ms": latency_ms}
        else:
            return {"status": "not_available", "note": "Cache query did not succeed"}
    except Exception as e:
        error_msg = str(e)
        if "TABLE_OR_VIEW_NOT_FOUND" in error_msg or "does not exist" in error_msg.lower():
            return {"status": "not_available", "note": "Cache tables not set up"}
        return {"status": "not_available", "error": error_msg[:50]}


@router.get("/api/health")
async def health_check(
    request: Request,
    token: Annotated[str | None, Header(alias="X-Forwarded-Access-Token")] = None,
    deep: bool = False,
) -> dict:
    """Comprehensive health check with optional deep connectivity tests.

    Args:
        deep: If True, performs actual SQL connectivity tests (slower but thorough).
              Default is False for quick liveness checks.

    Returns:
        Health status with checks:
        - status: "healthy", "degraded", or "unhealthy"
        - checks: Individual check results
        - version, workspace info, timestamps
    """
    checks = {}
    overall = "healthy"
    sp_client = getattr(request.app.state, "workspace_client", None)

    # Basic configuration checks (always run)
    checks["config"] = {
        "databricks_host": "configured" if settings.databricks_host else "missing",
        "warehouse_id": "configured" if settings.warehouse_id else "missing",
        "service_principal": "available" if sp_client else "not_available",
    }

    if not settings.databricks_host or not settings.warehouse_id:
        overall = "degraded"

    # Auth mode detection
    if token:
        checks["auth_mode"] = "obo"
    elif sp_client:
        checks["auth_mode"] = "service_principal"
    else:
        checks["auth_mode"] = "none"
        overall = "unhealthy"

    # Deep checks - actually test connectivity
    if deep:
        # Determine which client to use for SQL checks
        if token:
            try:
                from databricks.sdk import WorkspaceClient

                ws = WorkspaceClient(host=settings.databricks_host, token=token)
            except Exception:
                ws = sp_client
        else:
            ws = sp_client

        # Run checks in parallel for speed
        warehouse_task = check_sql_warehouse(ws, settings.warehouse_id)
        obo_task = check_obo_auth(token, settings.databricks_host)

        warehouse_result, obo_result = await asyncio.gather(
            warehouse_task, obo_task, return_exceptions=True
        )

        # Process warehouse check
        if isinstance(warehouse_result, Exception):
            checks["sql_warehouse"] = {"status": "error", "error": str(warehouse_result)[:100]}
            overall = "unhealthy"
        else:
            checks["sql_warehouse"] = warehouse_result
            if warehouse_result.get("status") == "unhealthy":
                overall = "unhealthy"
            elif warehouse_result.get("status") == "degraded" and overall == "healthy":
                overall = "degraded"

        # Process OBO check
        if isinstance(obo_result, Exception):
            checks["obo_auth"] = {"status": "error", "error": str(obo_result)[:100]}
        else:
            checks["obo_auth"] = obo_result

        # System tables check (only if warehouse is healthy)
        if checks.get("sql_warehouse", {}).get("status") == "healthy":
            system_result = await check_system_tables(ws, settings.warehouse_id)
            checks["system_tables"] = system_result
            if system_result.get("status") == "unhealthy" and overall == "healthy":
                overall = "degraded"  # System tables are important but not critical

        # Cache tables check (optional feature)
        if checks.get("sql_warehouse", {}).get("status") == "healthy" and settings.use_cache:
            cache_result = await check_cache_tables(
                ws, settings.warehouse_id, settings.cache_catalog, settings.cache_schema
            )
            checks["cache_tables"] = cache_result
            # Cache is optional - don't degrade overall status

    # Mock data status
    checks["mock_data"] = {
        "enabled": is_mock_mode(),
        "auto_fallback": is_auto_fallback_enabled(),
    }

    # Response cache stats
    checks["response_cache"] = response_cache.stats()

    return {
        "status": overall,
        "checks": checks,
        "version": settings.app_version,
        "workspace": settings.databricks_host or "not_configured",
        "workspace_name": extract_workspace_name(settings.databricks_host),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/health/live")
async def liveness_check() -> dict:
    """Simple liveness probe - confirms app is running.

    Use this for Kubernetes liveness probes or basic uptime monitoring.
    For comprehensive checks, use /api/health?deep=true
    """
    return {
        "status": "ok",
        "version": settings.app_version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/health/ready")
async def readiness_check(
    request: Request,
    token: Annotated[str | None, Header(alias="X-Forwarded-Access-Token")] = None,
) -> dict:
    """Readiness probe - confirms app can serve requests.

    Checks basic configuration without executing SQL queries.
    For full connectivity tests, use /api/health?deep=true
    """
    sp_client = getattr(request.app.state, "workspace_client", None)

    ready = bool(
        settings.databricks_host
        and settings.warehouse_id
        and (token or sp_client)
    )

    return {
        "status": "ready" if ready else "not_ready",
        "checks": {
            "databricks_host": bool(settings.databricks_host),
            "warehouse_id": bool(settings.warehouse_id),
            "auth_available": bool(token or sp_client),
        },
        "version": settings.app_version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/cache/status")
async def cache_status(
    ws=Depends(get_ws_prefer_user),
) -> dict:
    """Check cache status including freshness and availability."""
    if not ws:
        return {
            "status": "unavailable",
            "available": False,
            "reason": "WorkspaceClient not available",
            "cache_enabled": settings.use_cache,
        }

    # Check if cache tables exist
    cache_exists = await check_cache_exists(ws)

    if not cache_exists:
        return {
            "status": "not_setup",
            "available": False,
            "reason": "Cache tables not found. Run the refresh-metrics-cache job to create them.",
            "cache_enabled": settings.use_cache,
            "cache_table_prefix": settings.cache_table_prefix,
        }

    # Check freshness
    is_fresh, refreshed_at = await get_cache_freshness(ws)

    return {
        "status": "healthy" if is_fresh else "stale",
        "available": True,
        "fresh": is_fresh,
        "refreshed_at": refreshed_at.isoformat() if refreshed_at else None,
        "cache_enabled": settings.use_cache,
        "cache_table_prefix": settings.cache_table_prefix,
        "message": "Cache is fresh and ready" if is_fresh else "Cache exists but may be stale (>1 hour old)",
        "response_cache": response_cache.stats(),
    }
