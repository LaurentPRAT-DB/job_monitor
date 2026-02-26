"""Cache query module for pre-aggregated metrics.

Provides functions to read from cache tables populated by the refresh-metrics-cache job.
Falls back to live queries if cache tables don't exist or are stale.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any

from job_monitor.backend.config import settings

logger = logging.getLogger(__name__)

# Cache staleness threshold (data older than this triggers a warning)
CACHE_STALE_THRESHOLD = timedelta(hours=1)


async def check_cache_exists(ws) -> bool:
    """Check if cache tables exist and are accessible."""
    if not ws or not settings.warehouse_id:
        return False

    table = f"{settings.cache_table_prefix}.job_health_cache"
    query = f"SELECT 1 FROM {table} LIMIT 1"

    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=settings.warehouse_id,
            statement=query,
            wait_timeout="10s",
        )
        if result and result.status and not result.status.error:
            logger.info(f"[CACHE] Table {table} exists and is accessible")
            return True
        else:
            logger.info(f"[CACHE] Table {table} not accessible: {result.status.error if result.status else 'unknown'}")
            return False
    except Exception as e:
        logger.info(f"[CACHE] Table check failed: {e}")
        return False


async def get_cache_freshness(ws) -> tuple[bool, datetime | None]:
    """Check cache freshness by reading refreshed_at timestamp.

    Returns:
        Tuple of (is_fresh, refreshed_at timestamp or None)
    """
    if not ws or not settings.warehouse_id:
        return (False, None)

    query = f"SELECT MAX(refreshed_at) as last_refresh FROM {settings.cache_table_prefix}.job_health_cache"

    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=settings.warehouse_id,
            statement=query,
            wait_timeout="10s",
        )

        if result and result.result and result.result.data_array:
            refreshed_at_str = result.result.data_array[0][0]
            if refreshed_at_str:
                # Parse timestamp
                refreshed_at = datetime.fromisoformat(str(refreshed_at_str).replace("Z", "+00:00").replace(" ", "T"))
                is_fresh = datetime.now(refreshed_at.tzinfo) - refreshed_at < CACHE_STALE_THRESHOLD
                return (is_fresh, refreshed_at)

        return (False, None)
    except Exception as e:
        logger.warning(f"Failed to check cache freshness: {e}")
        return (False, None)


async def query_job_health_cache(ws, days: int = 7) -> list[dict[str, Any]] | None:
    """Query job health from cache table.

    Args:
        ws: WorkspaceClient
        days: Time window (7 or 30) - selects appropriate columns

    Returns:
        List of job health records, or None if cache unavailable
    """
    if not settings.use_cache or not ws or not settings.warehouse_id:
        return None

    # Select appropriate columns based on time window
    if days == 7:
        success_cols = "total_runs_7d as total_runs, success_count_7d as success_count, success_rate_7d as success_rate"
    else:
        success_cols = "total_runs_30d as total_runs, success_count_30d as success_count, success_rate_30d as success_rate"

    query = f"""
    SELECT
        job_id,
        job_name,
        {success_cols},
        last_run_time,
        last_duration_seconds,
        priority,
        retry_count,
        median_duration_seconds,
        p90_duration_seconds,
        avg_duration_seconds,
        max_duration_seconds,
        refreshed_at
    FROM {settings.cache_table_prefix}.job_health_cache
    WHERE total_runs_{days}d > 0
    ORDER BY
        CASE
            WHEN priority = 'P1' THEN 1
            WHEN priority = 'P2' THEN 2
            WHEN priority = 'P3' THEN 3
            ELSE 4
        END,
        success_rate_{days}d ASC
    """

    try:
        logger.info(f"[CACHE] Querying job_health_cache for {days} days window")
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=settings.warehouse_id,
            statement=query,
            wait_timeout="30s",
        )

        if result and result.status and result.status.error:
            logger.warning(f"[CACHE_MISS] job_health_cache query error: {result.status.error}")
            return None

        if result and result.result and result.result.data_array:
            jobs = []
            for row in result.result.data_array:
                jobs.append({
                    "job_id": str(row[0]) if row[0] else "",
                    "job_name": str(row[1]) if row[1] else "",
                    "total_runs": int(row[2]) if row[2] else 0,
                    "success_count": int(row[3]) if row[3] else 0,
                    "success_rate": float(row[4]) if row[4] is not None else 0.0,
                    "last_run_time": row[5],
                    "last_duration_seconds": int(row[6]) if row[6] else None,
                    "priority": row[7] if row[7] else None,
                    "retry_count": int(row[8]) if row[8] else 0,
                    "median_duration_seconds": float(row[9]) if row[9] else None,
                    "p90_duration_seconds": float(row[10]) if row[10] else None,
                    "avg_duration_seconds": float(row[11]) if row[11] else None,
                    "max_duration_seconds": float(row[12]) if row[12] else None,
                    "refreshed_at": row[13],
                })
            logger.info(f"[CACHE_HIT] job_health_cache returned {len(jobs)} jobs ({days}d window)")
            return jobs

        logger.info(f"[CACHE_MISS] job_health_cache returned empty result ({days}d window)")
        return None

    except Exception as e:
        logger.warning(f"[CACHE_MISS] job_health_cache query failed: {e}")
        return None


async def query_cost_cache(ws) -> list[dict[str, Any]] | None:
    """Query cost data from cache table.

    Returns:
        List of job cost records, or None if cache unavailable
    """
    if not settings.use_cache or not ws or not settings.warehouse_id:
        return None

    query = f"""
    SELECT
        job_id,
        job_name,
        total_dbus_30d,
        current_7d_dbus,
        prev_7d_dbus,
        trend_7d_percent,
        sku_breakdown,
        baseline_p90_dbus,
        is_anomaly,
        refreshed_at
    FROM {settings.cache_table_prefix}.cost_cache
    ORDER BY total_dbus_30d DESC
    LIMIT 500
    """

    try:
        logger.info("[CACHE] Querying cost_cache")
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=settings.warehouse_id,
            statement=query,
            wait_timeout="30s",
        )

        if result and result.status and result.status.error:
            logger.warning(f"[CACHE_MISS] cost_cache query error: {result.status.error}")
            return None

        if result and result.result and result.result.data_array:
            jobs = []
            for row in result.result.data_array:
                jobs.append({
                    "job_id": str(row[0]) if row[0] else "",
                    "job_name": str(row[1]) if row[1] else "",
                    "total_dbus_30d": float(row[2]) if row[2] else 0.0,
                    "current_7d_dbus": float(row[3]) if row[3] else 0.0,
                    "prev_7d_dbus": float(row[4]) if row[4] else 0.0,
                    "trend_7d_percent": float(row[5]) if row[5] else 0.0,
                    "sku_breakdown": str(row[6]) if row[6] else "",
                    "baseline_p90_dbus": float(row[7]) if row[7] else None,
                    "is_anomaly": bool(row[8]) if row[8] is not None else False,
                    "refreshed_at": row[9],
                })
            logger.info(f"[CACHE_HIT] cost_cache returned {len(jobs)} jobs")
            return jobs

        logger.info("[CACHE_MISS] cost_cache returned empty result")
        return None

    except Exception as e:
        logger.warning(f"[CACHE_MISS] cost_cache query failed: {e}")
        return None


async def query_alerts_cache(ws) -> list[dict[str, Any]] | None:
    """Query alerts from cache table.

    Returns:
        List of alert records, or None if cache unavailable
    """
    if not settings.use_cache or not ws or not settings.warehouse_id:
        return None

    query = f"""
    SELECT
        alert_id,
        job_id,
        job_name,
        category,
        severity,
        title,
        description,
        failure_reasons,
        current_dbus,
        baseline_p90_dbus,
        cost_multiplier,
        refreshed_at
    FROM {settings.cache_table_prefix}.alerts_cache
    ORDER BY
        CASE
            WHEN severity = 'P1' THEN 1
            WHEN severity = 'P2' THEN 2
            WHEN severity = 'P3' THEN 3
            ELSE 4
        END
    """

    try:
        logger.info("[CACHE] Querying alerts_cache")
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=settings.warehouse_id,
            statement=query,
            wait_timeout="30s",
        )

        if result and result.status and result.status.error:
            logger.warning(f"[CACHE_MISS] alerts_cache query error: {result.status.error}")
            return None

        if result and result.result and result.result.data_array:
            alerts = []
            for row in result.result.data_array:
                alerts.append({
                    "alert_id": str(row[0]) if row[0] else "",
                    "job_id": str(row[1]) if row[1] else "",
                    "job_name": str(row[2]) if row[2] else "",
                    "category": str(row[3]) if row[3] else "failure",
                    "severity": str(row[4]) if row[4] else "P3",
                    "title": str(row[5]) if row[5] else "",
                    "description": str(row[6]) if row[6] else "",
                    "failure_reasons": str(row[7]) if row[7] else None,
                    "current_dbus": float(row[8]) if row[8] else None,
                    "baseline_p90_dbus": float(row[9]) if row[9] else None,
                    "cost_multiplier": float(row[10]) if row[10] else None,
                    "refreshed_at": row[11],
                })
            logger.info(f"[CACHE_HIT] alerts_cache returned {len(alerts)} alerts")
            return alerts

        logger.info("[CACHE_MISS] alerts_cache returned empty result")
        return None

    except Exception as e:
        logger.warning(f"[CACHE_MISS] alerts_cache query failed: {e}")
        return None


async def query_job_duration_cache(ws, job_id: str) -> dict[str, Any] | None:
    """Query duration stats for a specific job from cache.

    Returns:
        Duration stats dict, or None if not found in cache
    """
    if not settings.use_cache or not ws or not settings.warehouse_id:
        return None

    query = f"""
    SELECT
        job_id,
        median_duration_seconds,
        p90_duration_seconds,
        avg_duration_seconds,
        max_duration_seconds,
        total_runs_30d as run_count
    FROM {settings.cache_table_prefix}.job_health_cache
    WHERE job_id = '{job_id}'
    """

    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=settings.warehouse_id,
            statement=query,
            wait_timeout="15s",
        )

        if result and result.result and result.result.data_array:
            row = result.result.data_array[0]
            return {
                "job_id": str(row[0]),
                "median_duration_seconds": float(row[1]) if row[1] else None,
                "p90_duration_seconds": float(row[2]) if row[2] else None,
                "avg_duration_seconds": float(row[3]) if row[3] else None,
                "max_duration_seconds": float(row[4]) if row[4] else None,
                "run_count": int(row[5]) if row[5] else 0,
            }

        return None

    except Exception as e:
        logger.warning(f"Duration cache query failed for {job_id}: {e}")
        return None
