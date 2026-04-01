"""MCP Server for Job Monitor.

Exposes Databricks Job Monitoring API endpoints as MCP tools,
enabling Claude and other LLM clients to query job health,
costs, alerts, and more.

Usage:
    python -m job_monitor.backend.mcp_server
"""

import json
import logging

import httpx
from mcp.server.fastmcp import FastMCP

from job_monitor.backend.app import app as fastapi_app

logger = logging.getLogger(__name__)

mcp = FastMCP(
    "job-monitor",
    instructions=(
        "Databricks Job Monitoring server. Use these tools to check job health, "
        "costs, alerts, and active runs across Databricks workspaces."
    ),
)


def _ensure_app_state():
    """Ensure FastAPI app state is initialized for ASGI transport calls.

    When calling the app via ASGI transport (not through uvicorn), the lifespan
    handler doesn't run, so we need to ensure workspace_client exists.
    """
    if not hasattr(fastapi_app.state, "workspace_client"):
        try:
            from databricks.sdk import WorkspaceClient
            fastapi_app.state.workspace_client = WorkspaceClient()
        except Exception:
            fastapi_app.state.workspace_client = None


async def _call_api(path: str, method: str = "GET", **kwargs) -> dict:
    """Call the FastAPI app in-process via ASGI transport (no network needed).

    Returns the JSON response on success, or an error dict on failure.
    """
    _ensure_app_state()
    transport = httpx.ASGITransport(app=fastapi_app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.request(method, path, **kwargs)
            if resp.is_success:
                return resp.json()
            # Return error details instead of crashing
            try:
                body = resp.json()
            except Exception:
                body = {"detail": resp.text[:500]}
            return {"error": True, "status_code": resp.status_code, **body}
    except Exception as e:
        return {"error": True, "status_code": 500, "detail": str(e)[:500]}


def _json(data: dict) -> str:
    """Serialize response data to JSON string for MCP tool return."""
    return json.dumps(data, indent=2, default=str)


# ---------------------------------------------------------------------------
# Health & Status
# ---------------------------------------------------------------------------


@mcp.tool()
async def get_health_status(deep: bool = False) -> str:
    """Check system health including SQL warehouse, auth, and cache status.

    Args:
        deep: If True, performs actual SQL connectivity tests (slower but thorough).
    """
    params = {"deep": str(deep).lower()}
    result = await _call_api("/api/health", params=params)
    return _json(result)


# ---------------------------------------------------------------------------
# Active Jobs (real-time from Jobs API)
# ---------------------------------------------------------------------------


@mcp.tool()
async def get_active_jobs() -> str:
    """Get currently running/pending/queued Databricks jobs with real-time status."""
    result = await _call_api("/api/jobs-api/active")
    return _json(result)


@mcp.tool()
async def get_active_jobs_summary() -> str:
    """Get a quick count of running, pending, and queued jobs."""
    result = await _call_api("/api/jobs-api/active/summary")
    return _json(result)


# ---------------------------------------------------------------------------
# Health Metrics
# ---------------------------------------------------------------------------


@mcp.tool()
async def get_health_metrics(
    days: int = 30,
    workspace_id: str | None = None,
) -> str:
    """Get job health metrics with success rates and priority flags (P1/P2/P3).

    Args:
        days: Time window in days (7-90, default 30).
        workspace_id: Filter by workspace ID (omit for all workspaces).
    """
    params: dict = {"days": days}
    if workspace_id:
        params["workspace_id"] = workspace_id
    result = await _call_api("/api/health-metrics", params=params)
    return _json(result)


@mcp.tool()
async def get_health_metrics_summary(
    days: int = 30,
    workspace_id: str | None = None,
) -> str:
    """Get aggregated health summary with P1/P2/P3 job counts and overall success rate.

    Args:
        days: Time window in days (7-90, default 30).
        workspace_id: Filter by workspace ID (omit for all workspaces).
    """
    params: dict = {"days": days}
    if workspace_id:
        params["workspace_id"] = workspace_id
    result = await _call_api("/api/health-metrics/summary", params=params)
    return _json(result)


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------


@mcp.tool()
async def get_alerts(
    severity: str | None = None,
    category: str | None = None,
    workspace_id: str | None = None,
) -> str:
    """Get active monitoring alerts for job failures, SLA breaches, cost spikes, and cluster issues.

    Args:
        severity: Filter by severity level (P1, P2, or P3).
        category: Filter by category (failure, sla, cost, cluster).
        workspace_id: Filter by workspace ID (omit for all workspaces).
    """
    params: dict = {}
    if severity:
        params["severity"] = severity
    if category:
        params["category"] = category
    if workspace_id:
        params["workspace_id"] = workspace_id
    result = await _call_api("/api/alerts", params=params)
    return _json(result)


@mcp.tool()
async def acknowledge_alert(alert_id: str) -> str:
    """Acknowledge an alert to suppress it for 24 hours.

    Args:
        alert_id: The alert ID to acknowledge.
    """
    result = await _call_api(f"/api/alerts/{alert_id}/acknowledge", method="POST")
    return _json(result)


# ---------------------------------------------------------------------------
# Cost
# ---------------------------------------------------------------------------


@mcp.tool()
async def get_cost_summary(
    days: int = 30,
    workspace_id: str | None = None,
) -> str:
    """Get job cost breakdown with per-job DBUs, SKU categories, team rollups, and anomalies.

    Args:
        days: Time window in days (7-90, default 30).
        workspace_id: Filter by workspace ID (omit for all workspaces).
    """
    params: dict = {"days": days}
    if workspace_id:
        params["workspace_id"] = workspace_id
    result = await _call_api("/api/costs/summary", params=params)
    return _json(result)


@mcp.tool()
async def get_cost_anomalies(days: int = 30) -> str:
    """Get cost anomalies including cost spikes (>2x p90 baseline) and zombie jobs.

    Args:
        days: Time window in days (7-90, default 30).
    """
    params: dict = {"days": days}
    result = await _call_api("/api/costs/anomalies", params=params)
    return _json(result)


# ---------------------------------------------------------------------------
# Job Details
# ---------------------------------------------------------------------------


@mcp.tool()
async def get_job_duration_stats(job_id: str) -> str:
    """Get duration statistics (median, p90, avg, max) for a specific job.

    Args:
        job_id: The Databricks job ID.
    """
    result = await _call_api(f"/api/health-metrics/{job_id}/duration")
    return _json(result)


@mcp.tool()
async def get_job_details(job_id: str) -> str:
    """Get expanded job details including recent run history for a specific job.

    Args:
        job_id: The Databricks job ID.
    """
    result = await _call_api(f"/api/health-metrics/{job_id}/details")
    return _json(result)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
