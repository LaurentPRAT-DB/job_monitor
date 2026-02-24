"""Health metrics router for job health dashboard.

Provides:
- Job health summary with priority flags (P1/P2/P3)
- Duration statistics (median, p90, avg, max) for specific jobs
- Expanded job details for dashboard row expansion
"""

import asyncio
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws
from job_monitor.backend.models import (
    DurationStatsOut,
    JobExpandedOut,
    JobHealthListOut,
    JobHealthOut,
    JobRunDetailOut,
)

router = APIRouter(prefix="/api", tags=["health-metrics"])


def _parse_job_health(result) -> list[JobHealthOut]:
    """Parse statement execution result into JobHealthOut models.

    Expected columns from query:
    0: job_id
    1: job_name
    2: total_runs
    3: success_count
    4: success_rate
    5: last_run_time
    6: last_duration_seconds
    7: priority
    8: retry_count
    """
    if not result or not result.result or not result.result.data_array:
        return []

    jobs = []
    for row in result.result.data_array:
        # Handle NULL values and type conversions
        job_id = str(row[0]) if row[0] else ""
        job_name = str(row[1]) if row[1] else f"job-{job_id}"
        total_runs = int(row[2]) if row[2] else 0
        success_count = int(row[3]) if row[3] else 0
        success_rate = float(row[4]) if row[4] is not None else 0.0
        last_run_time = row[5]  # datetime from SQL
        last_duration = int(row[6]) if row[6] else None
        priority = row[7] if row[7] else None
        retry_count = int(row[8]) if row[8] else 0

        jobs.append(
            JobHealthOut(
                job_id=job_id,
                job_name=job_name,
                total_runs=total_runs,
                success_count=success_count,
                success_rate=success_rate,
                last_run_time=last_run_time,
                last_duration_seconds=last_duration,
                priority=priority,
                retry_count=retry_count,
            )
        )
    return jobs


def _sort_by_priority(jobs: list[JobHealthOut]) -> list[JobHealthOut]:
    """Sort jobs by priority: P1 > P2 > P3 > healthy, then by success rate ASC.

    This ensures problem-first view where most urgent issues appear at top.
    """
    priority_order = {"P1": 0, "P2": 1, "P3": 2, None: 3}
    return sorted(
        jobs, key=lambda j: (priority_order.get(j.priority, 3), j.success_rate)
    )


@router.get("/health-metrics", response_model=JobHealthListOut)
async def get_health_metrics(
    days: Annotated[
        Literal[7, 30],
        Query(description="Time window: 7 or 30 days"),
    ] = 7,
    ws=Depends(get_ws),
) -> JobHealthListOut:
    """Get job health metrics with priority flags and retry counts.

    Returns job health summaries sorted by urgency (P1 first, then P2, P3, healthy).

    Priority levels:
    - P1: 2+ consecutive failures (most recent 2 runs both failed)
    - P2: Most recent run failed (single failure)
    - P3: Success rate in yellow zone (70-89%)
    - None: Healthy job (>= 90% success rate)

    Status colors are computed from success rate:
    - green: >= 90%
    - yellow: 70-89%
    - red: < 70%

    Args:
        days: Time window for metrics (7 or 30 days)
        ws: WorkspaceClient dependency

    Returns:
        JobHealthListOut with jobs sorted by priority, window_days, and total_count
    """
    if not ws:
        raise HTTPException(
            status_code=503, detail="Databricks connection not available"
        )

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        raise HTTPException(status_code=503, detail="Warehouse ID not configured")

    # SQL query using CTEs for consecutive failure detection
    # Pattern from 02-RESEARCH.md with LAG window function
    query = f"""
    WITH latest_jobs AS (
        -- SCD2 pattern: Get latest version of each job
        SELECT *,
            ROW_NUMBER() OVER(
                PARTITION BY workspace_id, job_id
                ORDER BY change_time DESC
            ) as rn
        FROM system.lakeflow.jobs
        WHERE delete_time IS NULL
    ),
    run_stats AS (
        -- Aggregate run statistics per job
        SELECT
            job_id,
            COUNT(*) as total_runs,
            COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) as success_count,
            MAX(period_start_time) as last_run_time,
            MAX(CASE WHEN result_state IS NOT NULL THEN run_duration_seconds END) as last_duration
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
        GROUP BY job_id
    ),
    consecutive_check AS (
        -- Detect consecutive failures using LAG window function
        SELECT
            job_id,
            result_state,
            LAG(result_state) OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as prev_state,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as rn
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
    ),
    priority_flags AS (
        -- Compute priority based on consecutive failures and success rate
        SELECT
            cc.job_id,
            CASE
                WHEN cc.result_state = 'FAILED' AND cc.prev_state = 'FAILED' THEN 'P1'
                WHEN cc.result_state = 'FAILED' THEN 'P2'
                ELSE NULL
            END as failure_priority
        FROM consecutive_check cc
        WHERE cc.rn = 1
    ),
    retry_counts AS (
        -- Approximate retry detection: multiple runs for same job on same day
        SELECT
            job_id,
            SUM(CASE WHEN run_count > 1 THEN run_count - 1 ELSE 0 END) as retry_count
        FROM (
            SELECT job_id, DATE(period_start_time) as run_date, COUNT(*) as run_count
            FROM system.lakeflow.job_run_timeline
            WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
            GROUP BY job_id, DATE(period_start_time)
        )
        GROUP BY job_id
    )
    SELECT
        rs.job_id,
        lj.name as job_name,
        rs.total_runs,
        rs.success_count,
        ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1) as success_rate,
        rs.last_run_time,
        rs.last_duration,
        -- Determine final priority: P1/P2 from failures, P3 from yellow zone
        CASE
            WHEN pf.failure_priority IS NOT NULL THEN pf.failure_priority
            WHEN ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1) BETWEEN 70 AND 89.9 THEN 'P3'
            ELSE NULL
        END as priority,
        COALESCE(rc.retry_count, 0) as retry_count
    FROM run_stats rs
    LEFT JOIN latest_jobs lj ON rs.job_id = lj.job_id AND lj.rn = 1
    LEFT JOIN priority_flags pf ON rs.job_id = pf.job_id
    LEFT JOIN retry_counts rc ON rs.job_id = rc.job_id
    ORDER BY
        CASE
            WHEN pf.failure_priority = 'P1' THEN 1
            WHEN pf.failure_priority = 'P2' THEN 2
            WHEN ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1) BETWEEN 70 AND 89.9 THEN 3
            ELSE 4
        END,
        ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1) ASC
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="60s",
    )

    jobs = _parse_job_health(result)
    # Apply secondary sort to ensure consistent ordering
    sorted_jobs = _sort_by_priority(jobs)

    return JobHealthListOut(
        jobs=sorted_jobs,
        window_days=days,
        total_count=len(sorted_jobs),
    )
