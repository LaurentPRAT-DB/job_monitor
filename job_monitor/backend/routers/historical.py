"""Historical data router for trend visualization.

Provides:
- Historical cost data with auto-granularity
- Success rate trends over time
- SLA breach counts with previous period comparison

Performance optimizations:
- Response caching with 5-minute TTL for all historical endpoints
- Cache key includes all query parameters for accurate cache hits
"""

import asyncio
import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from job_monitor.backend.config import get_settings
from job_monitor.backend.core import get_ws_prefer_user
from job_monitor.backend.response_cache import response_cache

logger = logging.getLogger(__name__)

# Cache TTL for historical data (seconds) - 5 minutes
# Historical data doesn't change frequently, so longer cache is fine
HISTORICAL_CACHE_TTL = 300

router = APIRouter(prefix="/api/historical", tags=["historical"])


class HistoricalDataPoint(BaseModel):
    """Single data point with current and previous period values."""

    date: str  # ISO date string
    current: float
    previous: float


class HistoricalResponse(BaseModel):
    """Response with historical data and metadata."""

    data: list[HistoricalDataPoint]
    granularity: Literal["hourly", "daily", "weekly"]
    current_total: float
    previous_total: float
    change_percent: float


def _get_granularity(days: int) -> tuple[str, Literal["hourly", "daily", "weekly"]]:
    """Determine SQL interval and granularity label based on day range."""
    if days <= 7:
        return "HOUR", "hourly"
    elif days <= 30:
        return "DAY", "daily"
    else:
        return "WEEK", "weekly"


async def _execute_query(ws, warehouse_id: str, query: str) -> list[dict]:
    """Execute SQL query and return results as list of dicts."""
    import logging
    from databricks.sdk.service.sql import StatementState

    logger = logging.getLogger(__name__)

    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=query,
            wait_timeout="30s",
        )

        if result.status.state != StatementState.SUCCEEDED:
            logger.warning(
                f"Historical query failed with state {result.status.state}: "
                f"{result.status.error.message if result.status.error else 'Unknown error'}"
            )
            return []

        if not result.manifest or not result.result or not result.result.data_array:
            logger.debug("Historical query returned no data")
            return []

        columns = [col.name for col in result.manifest.schema.columns]
        return [dict(zip(columns, row)) for row in result.result.data_array]
    except Exception as e:
        logger.error(f"Historical query execution error: {e}")
        return []


@router.get("/costs", response_model=HistoricalResponse)
async def get_historical_costs(
    days: Annotated[int, Query(ge=1, le=90)] = 7,
    team: Annotated[str | None, Query()] = None,
    job_id: Annotated[str | None, Query()] = None,
    workspace_id: Annotated[str | None, Query()] = None,
    ws=Depends(get_ws_prefer_user),
) -> HistoricalResponse:
    """Get historical cost data with auto-granularity and previous period comparison.

    Results are cached for 5 minutes to improve response times.
    """
    # Check cache first
    cache_key = f"historical:costs:{days}:{team}:{job_id}:{workspace_id}"
    cached = response_cache.get(cache_key)
    if cached:
        logger.debug(f"[CACHE_HIT] Historical costs ({days}d)")
        return HistoricalResponse(**cached)

    settings = get_settings()

    if not ws or not settings.warehouse_id:
        return HistoricalResponse(
            data=[],
            granularity="daily",
            current_total=0,
            previous_total=0,
            change_percent=0,
        )

    interval, granularity = _get_granularity(days)

    # Build optional filter clauses
    filters = []
    if workspace_id and workspace_id != "all":
        # workspace_id in system tables is BIGINT, not string - don't quote it
        if not workspace_id.isdigit():
            raise HTTPException(status_code=422, detail="workspace_id must be numeric")
        filters.append(f"AND workspace_id = {workspace_id}")
    if team:
        filters.append(
            f"AND usage_metadata.job_id IN (SELECT job_id FROM job_team_map WHERE team = '{team}')"
        )
    if job_id:
        filters.append(f"AND usage_metadata.job_id = '{job_id}'")
    filter_sql = " ".join(filters)

    query = f"""
    WITH current_period AS (
        SELECT
            DATE_TRUNC('{interval}', usage_date) as period,
            SUM(usage_quantity) as total_dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL {days} DAYS
          AND usage_metadata.job_id IS NOT NULL
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', usage_date)
    ),
    previous_period AS (
        SELECT
            DATE_TRUNC('{interval}', usage_date + INTERVAL {days} DAYS) as period,
            SUM(usage_quantity) as total_dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL {days * 2} DAYS
          AND usage_date < current_date() - INTERVAL {days} DAYS
          AND usage_metadata.job_id IS NOT NULL
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', usage_date + INTERVAL {days} DAYS)
    )
    SELECT
        COALESCE(c.period, p.period) as period,
        COALESCE(c.total_dbus, 0) as current_dbus,
        COALESCE(p.total_dbus, 0) as previous_dbus
    FROM current_period c
    FULL OUTER JOIN previous_period p ON c.period = p.period
    ORDER BY period
    """

    rows = await _execute_query(ws, settings.warehouse_id, query)

    data = [
        HistoricalDataPoint(
            date=str(row["period"]),
            current=float(row["current_dbus"] or 0),
            previous=float(row["previous_dbus"] or 0),
        )
        for row in rows
    ]

    current_total = sum(d.current for d in data)
    previous_total = sum(d.previous for d in data)
    change_percent = (
        ((current_total - previous_total) / previous_total * 100)
        if previous_total > 0
        else 0
    )

    result = HistoricalResponse(
        data=data,
        granularity=granularity,
        current_total=current_total,
        previous_total=previous_total,
        change_percent=round(change_percent, 1),
    )

    # Cache the result
    response_cache.set(cache_key, result.model_dump(), HISTORICAL_CACHE_TTL)
    logger.info(f"[CACHE_SET] Historical costs ({days}d, {len(data)} points)")

    return result


@router.get("/success-rate", response_model=HistoricalResponse)
async def get_historical_success_rate(
    days: Annotated[int, Query(ge=1, le=90)] = 7,
    team: Annotated[str | None, Query()] = None,
    job_id: Annotated[str | None, Query()] = None,
    workspace_id: Annotated[str | None, Query()] = None,
    ws=Depends(get_ws_prefer_user),
) -> HistoricalResponse:
    """Get historical success rate with auto-granularity and previous period comparison.

    Results are cached for 5 minutes to improve response times.
    """
    # Check cache first
    cache_key = f"historical:success-rate:{days}:{team}:{job_id}:{workspace_id}"
    cached = response_cache.get(cache_key)
    if cached:
        logger.debug(f"[CACHE_HIT] Historical success-rate ({days}d)")
        return HistoricalResponse(**cached)

    settings = get_settings()

    if not ws or not settings.warehouse_id:
        return HistoricalResponse(
            data=[],
            granularity="daily",
            current_total=0,
            previous_total=0,
            change_percent=0,
        )

    interval, granularity = _get_granularity(days)

    # Build optional filter clauses
    filters = []
    if workspace_id and workspace_id != "all":
        # workspace_id in system tables is BIGINT, not string - don't quote it
        if not workspace_id.isdigit():
            raise HTTPException(status_code=422, detail="workspace_id must be numeric")
        filters.append(f"AND workspace_id = {workspace_id}")
    if job_id:
        filters.append(f"AND job_id = '{job_id}'")
    filter_sql = " ".join(filters)

    # System tables use SUCCEEDED (not SUCCESS) for successful runs
    query = f"""
    WITH current_period AS (
        SELECT
            DATE_TRUNC('{interval}', period_start_time) as period,
            COUNT(CASE WHEN UPPER(result_state) = 'SUCCEEDED' THEN 1 END) * 100.0 / COUNT(*) as success_rate
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
          AND result_state IS NOT NULL
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', period_start_time)
    ),
    previous_period AS (
        SELECT
            DATE_TRUNC('{interval}', period_start_time + INTERVAL {days} DAYS) as period,
            COUNT(CASE WHEN UPPER(result_state) = 'SUCCEEDED' THEN 1 END) * 100.0 / COUNT(*) as success_rate
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days * 2} DAYS
          AND period_start_time < current_date() - INTERVAL {days} DAYS
          AND result_state IS NOT NULL
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', period_start_time + INTERVAL {days} DAYS)
    )
    SELECT
        COALESCE(c.period, p.period) as period,
        COALESCE(c.success_rate, 0) as current_rate,
        COALESCE(p.success_rate, 0) as previous_rate
    FROM current_period c
    FULL OUTER JOIN previous_period p ON c.period = p.period
    ORDER BY period
    """

    rows = await _execute_query(ws, settings.warehouse_id, query)

    data = [
        HistoricalDataPoint(
            date=str(row["period"]),
            current=float(row["current_rate"] or 0),
            previous=float(row["previous_rate"] or 0),
        )
        for row in rows
    ]

    current_avg = sum(d.current for d in data) / len(data) if data else 0
    previous_avg = sum(d.previous for d in data) / len(data) if data else 0
    change_percent = current_avg - previous_avg  # For percentage, show absolute diff

    result = HistoricalResponse(
        data=data,
        granularity=granularity,
        current_total=round(current_avg, 1),
        previous_total=round(previous_avg, 1),
        change_percent=round(change_percent, 1),
    )

    # Cache the result
    response_cache.set(cache_key, result.model_dump(), HISTORICAL_CACHE_TTL)
    logger.info(f"[CACHE_SET] Historical success-rate ({days}d, {len(data)} points)")

    return result


@router.get("/sla-breaches", response_model=HistoricalResponse)
async def get_historical_sla_breaches(
    days: Annotated[int, Query(ge=1, le=90)] = 7,
    team: Annotated[str | None, Query()] = None,
    job_id: Annotated[str | None, Query()] = None,
    workspace_id: Annotated[str | None, Query()] = None,
    ws=Depends(get_ws_prefer_user),
) -> HistoricalResponse:
    """Get historical SLA breach count with auto-granularity and previous period comparison.

    Results are cached for 5 minutes to improve response times.
    """
    # Check cache first
    cache_key = f"historical:sla-breaches:{days}:{team}:{job_id}:{workspace_id}"
    cached = response_cache.get(cache_key)
    if cached:
        logger.debug(f"[CACHE_HIT] Historical sla-breaches ({days}d)")
        return HistoricalResponse(**cached)

    settings = get_settings()

    if not ws or not settings.warehouse_id:
        return HistoricalResponse(
            data=[],
            granularity="daily",
            current_total=0,
            previous_total=0,
            change_percent=0,
        )

    interval, granularity = _get_granularity(days)

    filters = []
    if workspace_id and workspace_id != "all":
        # workspace_id in system tables is BIGINT, not string - don't quote it
        if not workspace_id.isdigit():
            raise HTTPException(status_code=422, detail="workspace_id must be numeric")
        filters.append(f"AND workspace_id = {workspace_id}")
    if job_id:
        filters.append(f"AND job_id = '{job_id}'")
    filter_sql = " ".join(filters)

    # This query counts failures as proxy for SLA breaches
    # In production, would join with SLA targets from job tags
    query = f"""
    WITH current_period AS (
        SELECT
            DATE_TRUNC('{interval}', period_start_time) as period,
            COUNT(*) as breach_count
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
          AND result_state = 'FAILED'
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', period_start_time)
    ),
    previous_period AS (
        SELECT
            DATE_TRUNC('{interval}', period_start_time + INTERVAL {days} DAYS) as period,
            COUNT(*) as breach_count
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days * 2} DAYS
          AND period_start_time < current_date() - INTERVAL {days} DAYS
          AND result_state = 'FAILED'
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', period_start_time + INTERVAL {days} DAYS)
    )
    SELECT
        COALESCE(c.period, p.period) as period,
        COALESCE(c.breach_count, 0) as current_count,
        COALESCE(p.breach_count, 0) as previous_count
    FROM current_period c
    FULL OUTER JOIN previous_period p ON c.period = p.period
    ORDER BY period
    """

    rows = await _execute_query(ws, settings.warehouse_id, query)

    data = [
        HistoricalDataPoint(
            date=str(row["period"]),
            current=float(row["current_count"] or 0),
            previous=float(row["previous_count"] or 0),
        )
        for row in rows
    ]

    current_total = sum(d.current for d in data)
    previous_total = sum(d.previous for d in data)
    change_percent = (
        ((current_total - previous_total) / previous_total * 100)
        if previous_total > 0
        else 0
    )

    result = HistoricalResponse(
        data=data,
        granularity=granularity,
        current_total=current_total,
        previous_total=previous_total,
        change_percent=round(change_percent, 1),
    )

    # Cache the result
    response_cache.set(cache_key, result.model_dump(), HISTORICAL_CACHE_TTL)
    logger.info(f"[CACHE_SET] Historical sla-breaches ({days}d, {len(data)} points)")

    return result


# --- Sparkline data endpoint (batch recent runs from system tables) ---


class RecentRunOut(BaseModel):
    """Single run for sparkline display with tooltip details."""
    run_id: int
    result_state: str | None
    start_time: str | None  # ISO timestamp
    end_time: str | None    # ISO timestamp
    duration_seconds: int | None  # Duration in seconds for easy display


class BatchRunsRequest(BaseModel):
    """Request for batch recent runs."""
    job_ids: list[int]
    limit: int = 5  # Runs per job for sparkline


class BatchRunsResponse(BaseModel):
    """Response with recent runs keyed by job_id."""
    runs_by_job: dict[str, list[RecentRunOut]]


@router.post("/batch-runs", response_model=BatchRunsResponse)
async def get_batch_recent_runs(
    request: BatchRunsRequest,
    workspace_id: Annotated[str | None, Query()] = None,
    ws=Depends(get_ws_prefer_user),
) -> BatchRunsResponse:
    """Batch fetch recent completed runs for multiple jobs from system tables.

    This endpoint provides sparkline data for the Running Jobs page.
    Uses system tables (5-15 min latency) which works with user's OBO permissions.

    Only returns completed runs (with result_state) for sparkline display.

    Args:
        request: BatchRunsRequest with job_ids list and optional limit
        workspace_id: Optional workspace filter
        ws: User OBO WorkspaceClient

    Returns:
        BatchRunsResponse with recent runs keyed by job_id
    """
    settings = get_settings()

    if not ws or not settings.warehouse_id:
        return BatchRunsResponse(runs_by_job={})

    # Limit batch size
    job_ids = request.job_ids[:100]
    if not job_ids:
        return BatchRunsResponse(runs_by_job={})

    # Check cache first
    cache_key = f"batch_runs:{','.join(str(j) for j in sorted(job_ids))}:{request.limit}:{workspace_id or 'all'}"
    cached = response_cache.get(cache_key)
    if cached:
        logger.info(f"[CACHE_HIT] Batch runs for {len(job_ids)} jobs")
        return BatchRunsResponse(**cached)

    logger.info(f"[BATCH_RUNS] Fetching runs for {len(job_ids)} jobs from system tables")

    # Build SQL query
    job_ids_str = ",".join(str(jid) for jid in job_ids)

    # Workspace filter
    ws_filter = ""
    if workspace_id:
        ws_filter = f"AND workspace_id = {workspace_id}"

    query = f"""
    WITH run_times AS (
        -- Get start/end times per run (min start, max end across all periods)
        SELECT
            job_id,
            run_id,
            result_state,
            MIN(period_start_time) as start_time,
            MAX(period_end_time) as end_time
        FROM system.lakeflow.job_run_timeline
        WHERE job_id IN ({job_ids_str})
          AND result_state IS NOT NULL
          AND period_start_time >= CURRENT_TIMESTAMP() - INTERVAL 30 DAY
          {ws_filter}
        GROUP BY job_id, run_id, result_state
    ),
    ranked_runs AS (
        SELECT
            job_id,
            run_id,
            result_state,
            start_time,
            end_time,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY start_time DESC) as rn
        FROM run_times
    )
    SELECT job_id, run_id, result_state, start_time, end_time
    FROM ranked_runs
    WHERE rn <= {request.limit}
    ORDER BY job_id, rn
    """

    rows = await _execute_query(ws, settings.warehouse_id, query)

    # Build response dict
    runs_by_job: dict[str, list[RecentRunOut]] = {}

    for row in rows:
        job_id = str(row["job_id"])
        start_time = row.get("start_time")
        end_time = row.get("end_time")

        # Calculate duration if both times are available
        duration_seconds = None
        if start_time and end_time:
            try:
                from datetime import datetime
                # Parse timestamps (system tables return datetime objects or strings)
                if isinstance(start_time, str):
                    start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                    end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
                else:
                    start_dt = start_time
                    end_dt = end_time
                duration_seconds = int((end_dt - start_dt).total_seconds())
            except Exception:
                pass

        run = RecentRunOut(
            run_id=int(row["run_id"]),
            result_state=row["result_state"],
            start_time=str(start_time) if start_time else None,
            end_time=str(end_time) if end_time else None,
            duration_seconds=duration_seconds,
        )
        if job_id not in runs_by_job:
            runs_by_job[job_id] = []
        runs_by_job[job_id].append(run)

    # Ensure all requested jobs have an entry
    for job_id in job_ids:
        job_id_str = str(job_id)
        if job_id_str not in runs_by_job:
            runs_by_job[job_id_str] = []

    # Cache for 60 seconds (sparkline data doesn't need to be super fresh)
    response_cache.set(cache_key, {"runs_by_job": runs_by_job}, 60)

    jobs_with_data = sum(1 for runs in runs_by_job.values() if len(runs) > 0)
    logger.info(f"[BATCH_RUNS] Got runs for {jobs_with_data}/{len(job_ids)} jobs")

    return BatchRunsResponse(runs_by_job=runs_by_job)
