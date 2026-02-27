"""Health metrics router for job health dashboard.

Provides:
- Job health summary with priority flags (P1/P2/P3)
- Duration statistics (median, p90, avg, max) for specific jobs
- Expanded job details for dashboard row expansion

Supports:
- Cache-first queries for fast loading (from pre-aggregated Delta tables)
- Mock data fallback when system tables aren't accessible
- Live queries as fallback when cache unavailable

Enable mock mode with USE_MOCK_DATA=true or automatically on permission errors.
"""

import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from job_monitor.backend.cache import query_job_duration_cache, query_job_health_cache
from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws_prefer_user
from job_monitor.backend.mock_data import (
    get_mock_duration_stats,
    get_mock_health_metrics,
    get_mock_job_details,
    is_mock_mode,
)
from job_monitor.backend.response_cache import response_cache, TTL_STANDARD
from job_monitor.backend.models import (
    DurationStatsOut,
    JobExpandedOut,
    JobHealthListOut,
    JobHealthOut,
    JobHealthSummaryOut,
    JobRunDetailOut,
)

logger = logging.getLogger(__name__)

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


def _compute_priority_counts(jobs: list[JobHealthOut]) -> dict:
    """Compute priority counts from a list of jobs."""
    p1_count = sum(1 for j in jobs if j.priority == "P1")
    p2_count = sum(1 for j in jobs if j.priority == "P2")
    p3_count = sum(1 for j in jobs if j.priority == "P3")
    healthy_count = sum(1 for j in jobs if j.priority is None)
    return {
        "p1_count": p1_count,
        "p2_count": p2_count,
        "p3_count": p3_count,
        "healthy_count": healthy_count,
    }


def _paginate_from_cache(
    cache_data: list[dict], days: int, page: int, page_size: int
) -> JobHealthListOut:
    """Convert cache data to paginated JobHealthListOut.

    Used for cache fallback when live queries fail or timeout.
    """
    all_jobs = [
        JobHealthOut(
            job_id=row["job_id"],
            job_name=row["job_name"],
            total_runs=row["total_runs"],
            success_count=row["success_count"],
            success_rate=row["success_rate"],
            last_run_time=row["last_run_time"],
            last_duration_seconds=row["last_duration_seconds"],
            priority=row["priority"],
            retry_count=row["retry_count"],
        )
        for row in cache_data
    ]
    total_count = len(all_jobs)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_jobs = all_jobs[start_idx:end_idx]

    # Compute priority counts from full dataset
    counts = _compute_priority_counts(all_jobs)

    return JobHealthListOut(
        jobs=paginated_jobs,
        window_days=days,
        total_count=total_count,
        page=page,
        page_size=page_size,
        has_more=end_idx < total_count,
        from_cache=True,
        **counts,
    )


@router.get("/health-metrics", response_model=JobHealthListOut)
async def get_health_metrics(
    days: Annotated[
        int,
        Query(description="Time window: 7 or 30 days"),
    ] = 7,
    workspace_id: Annotated[
        str | None,
        Query(description="Filter by workspace ID (omit or null for current, 'all' for all workspaces)"),
    ] = None,
    page: Annotated[
        int,
        Query(description="Page number (1-indexed)", ge=1),
    ] = 1,
    page_size: Annotated[
        int,
        Query(description="Number of jobs per page", ge=10, le=500),
    ] = 50,
    ws=Depends(get_ws_prefer_user),
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

    Data source priority:
    1. Cache tables (fast, pre-aggregated)
    2. Live system table queries (slow, real-time)
    3. Mock data (when permissions unavailable)

    Args:
        days: Time window for metrics (7 or 30 days)
        ws: WorkspaceClient dependency

    Returns:
        JobHealthListOut with jobs sorted by priority, window_days, and total_count
    """
    # Validate days parameter (query params come as strings, so we need manual validation)
    if days not in (7, 30):
        raise HTTPException(status_code=422, detail="days must be 7 or 30")

    # Check for mock data mode
    if is_mock_mode():
        logger.info(f"Mock mode enabled - returning mock health metrics for {days} days")
        mock_result = get_mock_health_metrics(days)
        # Apply pagination to mock data
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_jobs = mock_result.jobs[start_idx:end_idx]
        return JobHealthListOut(
            jobs=paginated_jobs,
            window_days=days,
            total_count=mock_result.total_count,
            page=page,
            page_size=page_size,
            has_more=end_idx < mock_result.total_count,
            from_cache=False,
        )

    # Check in-memory response cache first (fastest path)
    # Include workspace_id and pagination in cache key
    ws_filter = workspace_id if workspace_id else "current"
    cache_key = f"health_metrics:{days}:{ws_filter}:p{page}:s{page_size}"
    cached_response = response_cache.get(cache_key)
    if cached_response:
        logger.info(f"[RESPONSE_CACHE] Returning cached health metrics ({days}d, ws={ws_filter}, page={page})")
        return cached_response

    logger.info(f"get_health_metrics called with days={days}")
    logger.info(f"WorkspaceClient available: {ws is not None}")
    logger.info(f"WAREHOUSE_ID: {settings.warehouse_id}")

    if not ws:
        logger.error("WorkspaceClient is None - returning 503")
        raise HTTPException(
            status_code=503, detail="Databricks connection not available"
        )

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        logger.error("WAREHOUSE_ID not configured - returning 503")
        raise HTTPException(status_code=503, detail="Warehouse ID not configured")

    # Try Delta table cache first for fast response
    # NOTE: Delta cache doesn't support workspace filtering, so skip it when workspace_id is specified
    use_delta_cache = settings.use_cache and (not workspace_id or workspace_id == "all")
    delta_cache_data = None
    if use_delta_cache:
        logger.info("[CACHE] Attempting Delta cache lookup for health-metrics (no workspace filter)")
        delta_cache_data = await query_job_health_cache(ws, days)
        if delta_cache_data:
            logger.info(f"[CACHE_HIT] health-metrics: {len(delta_cache_data)} jobs from Delta cache")
            all_jobs = [
                JobHealthOut(
                    job_id=row["job_id"],
                    job_name=row["job_name"],
                    total_runs=row["total_runs"],
                    success_count=row["success_count"],
                    success_rate=row["success_rate"],
                    last_run_time=row["last_run_time"],
                    last_duration_seconds=row["last_duration_seconds"],
                    priority=row["priority"],
                    retry_count=row["retry_count"],
                )
                for row in delta_cache_data
            ]
            # Apply pagination
            total_count = len(all_jobs)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            paginated_jobs = all_jobs[start_idx:end_idx]

            # Compute priority counts from full dataset
            counts = _compute_priority_counts(all_jobs)

            result = JobHealthListOut(
                jobs=paginated_jobs,
                window_days=days,
                total_count=total_count,
                page=page,
                page_size=page_size,
                has_more=end_idx < total_count,
                from_cache=True,
                **counts,
            )
            # Cache in response cache for instant subsequent requests
            response_cache.set(cache_key, result, TTL_STANDARD)
            logger.info(f"[RESPONSE_CACHE] Cached page {page} from Delta cache ({len(paginated_jobs)}/{total_count} jobs)")
            return result
        logger.info("[CACHE_MISS] health-metrics: falling back to live query")
    elif workspace_id:
        logger.info(f"[CACHE_SKIP] Skipping Delta cache - workspace filter active: {workspace_id}")

    # Build workspace filter clause
    # If workspace_id='all' or None, don't filter by workspace
    # If specific workspace_id provided, filter to that workspace
    workspace_clause = ""
    if workspace_id and workspace_id != "all":
        # workspace_id in system tables is BIGINT, not string - don't quote it
        # Validate it's numeric to prevent SQL injection
        if not workspace_id.isdigit():
            raise HTTPException(status_code=422, detail="workspace_id must be numeric")
        workspace_clause = f"AND workspace_id = {workspace_id}"

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
        WHERE delete_time IS NULL {workspace_clause}
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
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS {workspace_clause}
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
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS {workspace_clause}
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
            WHERE period_start_time >= current_date() - INTERVAL {days} DAYS {workspace_clause}
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

    try:
        logger.info(f"Executing SQL query on warehouse {warehouse_id}")
        logger.debug(f"SQL Query:\n{query}")
        # Max allowed wait_timeout is 50s - use async polling for longer queries
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=query,
            wait_timeout="50s",
        )

        # If query is still pending after initial wait, poll for completion
        if result and result.status and result.status.state.value in ("PENDING", "RUNNING"):
            statement_id = result.statement_id
            logger.info(f"Query still {result.status.state.value}, polling for completion (statement_id: {statement_id})")
            for attempt in range(6):  # Poll up to 6 times (additional 60s total)
                await asyncio.sleep(10)  # Wait 10s between polls
                result = await asyncio.to_thread(
                    ws.statement_execution.get_statement,
                    statement_id=statement_id,
                )
                logger.info(f"Poll {attempt + 1}: status = {result.status.state.value if result.status else 'None'}")
                if result.status and result.status.state.value not in ("PENDING", "RUNNING"):
                    break
        logger.info(f"SQL query completed, status: {result.status if result else 'None'}")

        # Log detailed result info and handle incomplete queries
        if result:
            logger.info(f"Result status state: {result.status.state if result.status else 'None'}")
            if result.status and result.status.error:
                error_msg = str(result.status.error)
                logger.error(f"SQL Error: {error_msg}")
                # Check for permission errors - fall back to cache or mock data
                if "INSUFFICIENT_PERMISSIONS" in error_msg or "USE SCHEMA" in error_msg:
                    logger.warning("Permission denied on system tables - trying cache fallback")
                    # Try cache fallback before mock data
                    if delta_cache_data:
                        logger.info("[CACHE_FALLBACK] Using Delta cache after permission error")
                        return _paginate_from_cache(delta_cache_data, days, page, page_size)
                    return get_mock_health_metrics(days)
            # Check if query is still pending/running - use cache fallback
            if result.status and result.status.state.value in ("PENDING", "RUNNING"):
                logger.warning(f"Query still {result.status.state.value} after timeout - trying cache fallback")
                # Try cache fallback
                if delta_cache_data:
                    logger.info("[CACHE_FALLBACK] Using Delta cache after query timeout")
                    return _paginate_from_cache(delta_cache_data, days, page, page_size)
                return JobHealthListOut(jobs=[], window_days=days, total_count=0, page=page, page_size=page_size)
            if result.result:
                row_count = len(result.result.data_array) if result.result.data_array else 0
                logger.info(f"Result row count: {row_count}")
                if result.result.data_array and row_count > 0:
                    logger.info(f"First row sample: {result.result.data_array[0]}")
            else:
                logger.warning("Result object exists but result.result is None")
        else:
            logger.warning("Result is None")
    except Exception as e:
        logger.error(f"SQL execution failed: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Try cache fallback before mock data
        if delta_cache_data:
            logger.warning("[CACHE_FALLBACK] SQL execution failed - using Delta cache")
            return _paginate_from_cache(delta_cache_data, days, page, page_size)
        logger.warning("SQL execution failed - falling back to mock data")
        return get_mock_health_metrics(days)

    jobs = _parse_job_health(result)
    logger.info(f"Parsed {len(jobs)} jobs from result")
    # Apply secondary sort to ensure consistent ordering
    sorted_jobs = _sort_by_priority(jobs)

    # Compute priority counts from full dataset
    counts = _compute_priority_counts(sorted_jobs)

    # Apply pagination
    total_count = len(sorted_jobs)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_jobs = sorted_jobs[start_idx:end_idx]

    result_obj = JobHealthListOut(
        jobs=paginated_jobs,
        window_days=days,
        total_count=total_count,
        page=page,
        page_size=page_size,
        has_more=end_idx < total_count,
        from_cache=False,
        **counts,
    )

    # Cache the response for 5 minutes
    response_cache.set(cache_key, result_obj, TTL_STANDARD)
    logger.info(f"[RESPONSE_CACHE] Cached page {page} ({len(paginated_jobs)}/{total_count} jobs, {days}d)")

    return result_obj


@router.get("/health-metrics/summary", response_model=JobHealthSummaryOut)
async def get_health_summary(
    days: Annotated[int, Query(ge=1, le=90, description="Time window in days")] = 7,
    workspace_id: Annotated[str | None, Query(description="Filter by workspace ID")] = None,
    ws=Depends(get_ws_prefer_user),
) -> JobHealthSummaryOut:
    """Get lightweight health summary with counts only - much faster than full endpoint.

    Returns only aggregate counts (p1_count, p2_count, etc.) without individual job details.
    Use this for dashboard summary cards where you only need counts.

    Typical response time: <1s (vs 11-16s for full health-metrics with job list)

    Args:
        days: Time window for analysis (7 or 30 days recommended)
        workspace_id: Optional workspace ID filter ("all" to skip filtering)
        ws: WorkspaceClient dependency

    Returns:
        JobHealthSummaryOut with priority counts and average success rate
    """
    from job_monitor.backend.models import JobHealthSummaryOut

    # Validate days parameter
    if days not in (7, 30):
        days = 7

    # Check response cache first
    ws_filter = workspace_id if workspace_id else "current"
    cache_key = f"health_summary:{days}:{ws_filter}"
    cached = response_cache.get(cache_key)
    if cached:
        logger.info(f"[RESPONSE_CACHE] Returning cached health summary ({days}d, ws={ws_filter})")
        return cached

    # Handle mock mode
    if is_mock_mode():
        return JobHealthSummaryOut(
            total_count=150,
            p1_count=3,
            p2_count=12,
            p3_count=25,
            healthy_count=110,
            window_days=days,
            from_cache=False,
            avg_success_rate=87.5,
        )

    if not ws:
        raise HTTPException(status_code=503, detail="WorkspaceClient not available")
    if not settings.warehouse_id:
        raise HTTPException(status_code=503, detail="Warehouse ID not configured")

    # Fast path: Use Delta cache when no workspace filter (much faster)
    if settings.use_cache and (not workspace_id or workspace_id == "all"):
        cache_data = await query_job_health_cache(ws, days)
        if cache_data:
            # Compute counts from cached data
            p1 = sum(1 for j in cache_data if j.get("priority") == "P1")
            p2 = sum(1 for j in cache_data if j.get("priority") == "P2")
            p3 = sum(1 for j in cache_data if j.get("priority") == "P3")
            healthy = sum(1 for j in cache_data if j.get("priority") is None)
            total = len(cache_data)
            avg_rate = sum(j.get("success_rate", 0) for j in cache_data) / total if total > 0 else 0.0

            summary = JobHealthSummaryOut(
                total_count=total,
                p1_count=p1,
                p2_count=p2,
                p3_count=p3,
                healthy_count=healthy,
                window_days=days,
                from_cache=True,
                avg_success_rate=round(avg_rate, 1),
            )
            response_cache.set(cache_key, summary, TTL_STANDARD)
            logger.info(f"[SUMMARY_CACHE] Fast path: {total} jobs from Delta cache")
            return summary

    # Build workspace filter
    workspace_clause = ""
    if workspace_id and workspace_id != "all":
        if not workspace_id.isdigit():
            raise HTTPException(status_code=422, detail="workspace_id must be numeric")
        workspace_clause = f"AND workspace_id = {workspace_id}"

    # Optimized query - only fetches counts, not individual jobs
    query = f"""
    WITH run_stats AS (
        SELECT
            job_id,
            COUNT(*) as total_runs,
            COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) as success_count,
            ROUND(100.0 * COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as success_rate
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
          AND result_state IS NOT NULL
          {workspace_clause}
        GROUP BY job_id
    ),
    consecutive_check AS (
        SELECT
            job_id,
            result_state,
            LAG(result_state) OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as prev_state,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as rn
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
          AND result_state IS NOT NULL
          {workspace_clause}
    ),
    priority_flags AS (
        SELECT
            job_id,
            CASE
                WHEN result_state = 'FAILED' AND prev_state = 'FAILED' THEN 'P1'
                WHEN result_state = 'FAILED' THEN 'P2'
                ELSE NULL
            END as failure_priority
        FROM consecutive_check
        WHERE rn = 1
    ),
    job_priorities AS (
        SELECT
            rs.job_id,
            rs.success_rate,
            CASE
                WHEN pf.failure_priority IS NOT NULL THEN pf.failure_priority
                WHEN rs.success_rate BETWEEN 70 AND 89.9 THEN 'P3'
                ELSE NULL
            END as priority
        FROM run_stats rs
        LEFT JOIN priority_flags pf ON rs.job_id = pf.job_id
    )
    SELECT
        COUNT(*) as total_count,
        COUNT(CASE WHEN priority = 'P1' THEN 1 END) as p1_count,
        COUNT(CASE WHEN priority = 'P2' THEN 1 END) as p2_count,
        COUNT(CASE WHEN priority = 'P3' THEN 1 END) as p3_count,
        COUNT(CASE WHEN priority IS NULL THEN 1 END) as healthy_count,
        ROUND(AVG(success_rate), 1) as avg_success_rate
    FROM job_priorities
    """

    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=settings.warehouse_id,
            statement=query,
            wait_timeout="30s",
        )

        if result and result.result and result.result.data_array:
            row = result.result.data_array[0]
            summary = JobHealthSummaryOut(
                total_count=int(row[0]) if row[0] else 0,
                p1_count=int(row[1]) if row[1] else 0,
                p2_count=int(row[2]) if row[2] else 0,
                p3_count=int(row[3]) if row[3] else 0,
                healthy_count=int(row[4]) if row[4] else 0,
                window_days=days,
                from_cache=False,
                avg_success_rate=float(row[5]) if row[5] else 0.0,
            )
            # Cache for 5 minutes
            response_cache.set(cache_key, summary, TTL_STANDARD)
            logger.info(f"[SUMMARY] Returned counts: total={summary.total_count}, p1={summary.p1_count}, p2={summary.p2_count}")
            return summary

        # Empty result
        return JobHealthSummaryOut(
            total_count=0, p1_count=0, p2_count=0, p3_count=0,
            healthy_count=0, window_days=days, from_cache=False,
        )

    except Exception as e:
        logger.error(f"Health summary query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get health summary: {str(e)}")


# Duration and expanded details endpoint helpers


def _parse_duration_stats(result, job_id: str) -> DurationStatsOut:
    """Parse statement execution result into DurationStatsOut model."""
    if not result or not result.result or not result.result.data_array:
        return DurationStatsOut(
            job_id=job_id,
            median_duration_seconds=None,
            p90_duration_seconds=None,
            avg_duration_seconds=None,
            max_duration_seconds=None,
            run_count=0,
            baseline_30d_median=None,
            has_sufficient_data=False,
        )

    row = result.result.data_array[0]
    run_count = int(row[4]) if row[4] else 0

    return DurationStatsOut(
        job_id=job_id,
        median_duration_seconds=float(row[0]) if row[0] else None,
        p90_duration_seconds=float(row[1]) if row[1] else None,
        avg_duration_seconds=float(row[2]) if row[2] else None,
        max_duration_seconds=float(row[3]) if row[3] else None,
        run_count=run_count,
        baseline_30d_median=float(row[0]) if row[0] else None,  # 30-day median IS the baseline
        has_sufficient_data=run_count >= 5,
    )


def _parse_job_runs(result, baseline_median: float | None) -> list[JobRunDetailOut]:
    """Parse statement execution result into JobRunDetailOut models."""
    if not result or not result.result or not result.result.data_array:
        return []

    runs = []
    for row in result.result.data_array:
        duration = int(row[4]) if row[4] else None

        # Anomaly detection: duration > 2x baseline median
        is_anomaly = False
        if baseline_median and duration:
            is_anomaly = duration > (2 * baseline_median)

        runs.append(
            JobRunDetailOut(
                run_id=str(row[0]),
                job_id=str(row[1]),
                start_time=row[2],
                end_time=row[3] if row[3] else None,
                duration_seconds=duration,
                result_state=row[5] if row[5] else None,
                is_anomaly=is_anomaly,
            )
        )
    return runs


@router.get("/health-metrics/{job_id}/duration", response_model=DurationStatsOut)
async def get_duration_stats(
    job_id: str,
    ws=Depends(get_ws_prefer_user),
) -> DurationStatsOut:
    """Get duration statistics for a specific job.

    Calculates statistical metrics (median, p90, avg, max) for job run durations
    over the last 30 days. Uses PERCENTILE_CONT for accurate percentile calculations.

    Args:
        job_id: The job ID to get statistics for
        ws: WorkspaceClient dependency

    Returns:
        Duration statistics including has_sufficient_data flag (>= 5 runs)
    """
    # Check for mock data mode
    if is_mock_mode():
        logger.info(f"Mock mode enabled - returning mock duration stats for {job_id}")
        return get_mock_duration_stats(job_id)

    if not ws:
        return get_mock_duration_stats(job_id)

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        return get_mock_duration_stats(job_id)

    # Try cache first
    if settings.use_cache:
        cached = await query_job_duration_cache(ws, job_id)
        if cached:
            logger.info(f"Duration stats cache hit for {job_id}")
            run_count = cached["run_count"] or 0
            return DurationStatsOut(
                job_id=job_id,
                median_duration_seconds=cached["median_duration_seconds"],
                p90_duration_seconds=cached["p90_duration_seconds"],
                avg_duration_seconds=cached["avg_duration_seconds"],
                max_duration_seconds=cached["max_duration_seconds"],
                run_count=run_count,
                baseline_30d_median=cached["median_duration_seconds"],
                has_sufficient_data=run_count >= 5,
            )

    # Use PERCENTILE_CONT for accurate percentile calculations
    query = f"""
    SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY run_duration_seconds) as median_duration,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY run_duration_seconds) as p90_duration,
        AVG(run_duration_seconds) as avg_duration,
        MAX(run_duration_seconds) as max_duration,
        COUNT(*) as run_count
    FROM system.lakeflow.job_run_timeline
    WHERE job_id = '{job_id}'
      AND period_start_time >= current_date() - INTERVAL 30 DAYS
      AND run_duration_seconds IS NOT NULL
      AND result_state IS NOT NULL
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="30s",
    )

    return _parse_duration_stats(result, job_id)


@router.get("/health-metrics/{job_id}/details", response_model=JobExpandedOut)
async def get_job_details(
    job_id: str,
    ws=Depends(get_ws_prefer_user),
) -> JobExpandedOut:
    """Get expanded details for a job (used when expanding a row in the dashboard).

    Returns:
    - Recent runs (last 10) with anomaly flags
    - Duration statistics
    - Retry count in last 7 days
    - Distinct failure reasons

    Args:
        job_id: The job ID to get details for
        ws: WorkspaceClient dependency

    Returns:
        Expanded job details for dashboard row expansion
    """
    # Check for mock data mode
    if is_mock_mode():
        logger.info(f"Mock mode enabled - returning mock job details for {job_id}")
        return get_mock_job_details(job_id)

    if not ws:
        return get_mock_job_details(job_id)

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        return get_mock_job_details(job_id)

    # Run all queries in parallel for better performance
    # Note: run_duration_seconds can be 0 for serverless jobs, so we calculate
    # effective duration from timestamps as fallback
    # 1. Duration stats query
    stats_query = f"""
    WITH runs_with_duration AS (
        SELECT
            CASE
                WHEN run_duration_seconds IS NULL OR run_duration_seconds = 0
                THEN TIMESTAMPDIFF(SECOND, period_start_time, period_end_time)
                ELSE run_duration_seconds
            END as effective_duration
        FROM system.lakeflow.job_run_timeline
        WHERE job_id = '{job_id}'
          AND period_start_time >= current_date() - INTERVAL 30 DAYS
          AND period_end_time IS NOT NULL
          AND result_state IS NOT NULL
    )
    SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY effective_duration) as median_duration,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY effective_duration) as p90_duration,
        AVG(effective_duration) as avg_duration,
        MAX(effective_duration) as max_duration,
        COUNT(*) as run_count
    FROM runs_with_duration
    WHERE effective_duration > 0
    """

    # 2. Recent runs query (last 10)
    # Calculate effective duration for serverless jobs where run_duration_seconds = 0
    runs_query = f"""
    SELECT run_id, job_id, period_start_time, period_end_time,
           CASE
               WHEN run_duration_seconds IS NULL OR run_duration_seconds = 0
               THEN TIMESTAMPDIFF(SECOND, period_start_time, period_end_time)
               ELSE run_duration_seconds
           END as run_duration_seconds,
           result_state
    FROM system.lakeflow.job_run_timeline
    WHERE job_id = '{job_id}'
      AND period_start_time >= current_date() - INTERVAL 30 DAYS
    ORDER BY period_start_time DESC
    LIMIT 10
    """

    # 3. Job name query (SCD2 pattern for latest version)
    job_name_query = f"""
    WITH latest_jobs AS (
        SELECT *,
            ROW_NUMBER() OVER(
                PARTITION BY workspace_id, job_id
                ORDER BY change_time DESC
            ) as rn
        FROM system.lakeflow.jobs
        WHERE job_id = '{job_id}'
          AND delete_time IS NULL
    )
    SELECT name FROM latest_jobs WHERE rn = 1
    """

    # 4. Retry count in last 7 days (multiple runs on same day = retries)
    retry_query = f"""
    SELECT COUNT(*) - COUNT(DISTINCT DATE(period_start_time)) as retry_count
    FROM system.lakeflow.job_run_timeline
    WHERE job_id = '{job_id}'
      AND period_start_time >= current_date() - INTERVAL 7 DAYS
      AND result_state IS NOT NULL
    """

    # 5. Distinct failure reasons (error messages from failed runs)
    failure_reasons_query = f"""
    SELECT DISTINCT termination_code
    FROM system.lakeflow.job_run_timeline
    WHERE job_id = '{job_id}'
      AND period_start_time >= current_date() - INTERVAL 30 DAYS
      AND result_state = 'FAILED'
      AND termination_code IS NOT NULL
    LIMIT 10
    """

    # Execute all queries in parallel
    stats_result, runs_result, name_result, retry_result, reasons_result = await asyncio.gather(
        asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=stats_query,
            wait_timeout="30s",
        ),
        asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=runs_query,
            wait_timeout="30s",
        ),
        asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=job_name_query,
            wait_timeout="30s",
        ),
        asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=retry_query,
            wait_timeout="30s",
        ),
        asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=failure_reasons_query,
            wait_timeout="30s",
        ),
    )

    # Parse duration stats
    duration_stats = _parse_duration_stats(stats_result, job_id)

    # Parse recent runs with anomaly detection based on baseline
    recent_runs = _parse_job_runs(runs_result, duration_stats.baseline_30d_median)

    # Extract job name
    job_name = "Unknown"
    if name_result and name_result.result and name_result.result.data_array:
        job_name = str(name_result.result.data_array[0][0]) or "Unknown"

    # Extract retry count
    retry_count = 0
    if retry_result and retry_result.result and retry_result.result.data_array:
        retry_count = int(retry_result.result.data_array[0][0] or 0)
        # Ensure non-negative (edge case when all runs are on different days)
        retry_count = max(0, retry_count)

    # Extract failure reasons
    failure_reasons = []
    if reasons_result and reasons_result.result and reasons_result.result.data_array:
        failure_reasons = [
            str(row[0]) for row in reasons_result.result.data_array if row[0]
        ]

    return JobExpandedOut(
        job_id=job_id,
        job_name=job_name,
        recent_runs=recent_runs,
        duration_stats=duration_stats,
        retry_count_7d=retry_count,
        failure_reasons=failure_reasons,
    )
