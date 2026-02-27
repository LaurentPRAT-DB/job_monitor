"""Historical data router for trend visualization.

Provides:
- Historical cost data with auto-granularity
- Success rate trends over time
- SLA breach counts with previous period comparison
"""

import asyncio
import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from job_monitor.backend.config import get_settings
from job_monitor.backend.core import get_ws_prefer_user

logger = logging.getLogger(__name__)

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
    """Get historical cost data with auto-granularity and previous period comparison."""
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
        GROUP BY DATE_TRUNC('{interval}', usage_date)
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

    return HistoricalResponse(
        data=data,
        granularity=granularity,
        current_total=current_total,
        previous_total=previous_total,
        change_percent=round(change_percent, 1),
    )


@router.get("/success-rate", response_model=HistoricalResponse)
async def get_historical_success_rate(
    days: Annotated[int, Query(ge=1, le=90)] = 7,
    team: Annotated[str | None, Query()] = None,
    job_id: Annotated[str | None, Query()] = None,
    workspace_id: Annotated[str | None, Query()] = None,
    ws=Depends(get_ws_prefer_user),
) -> HistoricalResponse:
    """Get historical success rate with auto-granularity and previous period comparison."""
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

    query = f"""
    WITH current_period AS (
        SELECT
            DATE_TRUNC('{interval}', period_start_time) as period,
            COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) * 100.0 / COUNT(*) as success_rate
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
          AND result_state IS NOT NULL
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', period_start_time)
    ),
    previous_period AS (
        SELECT
            DATE_TRUNC('{interval}', period_start_time + INTERVAL {days} DAYS) as period,
            COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) * 100.0 / COUNT(*) as success_rate
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days * 2} DAYS
          AND period_start_time < current_date() - INTERVAL {days} DAYS
          AND result_state IS NOT NULL
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', period_start_time)
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

    return HistoricalResponse(
        data=data,
        granularity=granularity,
        current_total=round(current_avg, 1),
        previous_total=round(previous_avg, 1),
        change_percent=round(change_percent, 1),
    )


@router.get("/sla-breaches", response_model=HistoricalResponse)
async def get_historical_sla_breaches(
    days: Annotated[int, Query(ge=1, le=90)] = 7,
    team: Annotated[str | None, Query()] = None,
    job_id: Annotated[str | None, Query()] = None,
    workspace_id: Annotated[str | None, Query()] = None,
    ws=Depends(get_ws_prefer_user),
) -> HistoricalResponse:
    """Get historical SLA breach count with auto-granularity and previous period comparison."""
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
        GROUP BY DATE_TRUNC('{interval}', period_start_time)
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

    return HistoricalResponse(
        data=data,
        granularity=granularity,
        current_total=current_total,
        previous_total=previous_total,
        change_percent=round(change_percent, 1),
    )
