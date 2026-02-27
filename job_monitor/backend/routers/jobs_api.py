"""Jobs API router for real-time job data from Databricks Jobs API.

This router provides real-time job information that supplements system tables.
System tables have 5-15 minute latency, while Jobs API provides instant access to:
- Currently running jobs
- Recent run status
- Job definitions not yet in system tables (365-day retention limit)

Performance optimizations:
- Response caching for active runs (30s TTL)
- Limited pagination to avoid fetching all pages
- Summary endpoint for count-only dashboard display
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from job_monitor.backend.core import get_ws
from job_monitor.backend.response_cache import response_cache

logger = logging.getLogger(__name__)

# Default timeout for Jobs API calls (seconds)
JOBS_API_TIMEOUT = 30

# Cache TTL for active runs (seconds) - short TTL for near-real-time updates
ACTIVE_RUNS_CACHE_TTL = 30

# Maximum pages to fetch for active runs (each page = 100 runs)
# This limits the worst case to ~3 pages = 300 runs = ~3-5 seconds
MAX_ACTIVE_RUNS_PAGES = 3
from job_monitor.backend.models import (
    ActiveRunsOut,
    ActiveRunsWithHistoryOut,
    ActiveRunWithHistory,
    JobApiOut,
    JobApiRunOut,
    RecentRunStatus,
)


class ActiveRunsSummary(BaseModel):
    """Lightweight summary of active runs for dashboard display."""
    total_active: int
    running_count: int
    pending_count: int
    queued_count: int
    from_cache: bool = False
    cache_age_seconds: int = 0

router = APIRouter(prefix="/api/jobs-api", tags=["Jobs API"])


def _job_to_model(job) -> JobApiOut:
    """Convert SDK Job object to JobApiOut model."""
    return JobApiOut(
        job_id=job.job_id,
        name=job.settings.name if job.settings else "Unknown",
        creator_user_name=job.creator_user_name,
        created_time=(
            datetime.fromtimestamp(job.created_time / 1000, tz=timezone.utc)
            if job.created_time
            else None
        ),
        settings_format=(
            job.settings.format.value
            if job.settings and job.settings.format
            else None
        ),
    )


def _run_to_model(run) -> JobApiRunOut:
    """Convert SDK Run object to JobApiRunOut model."""
    return JobApiRunOut(
        run_id=run.run_id,
        job_id=run.job_id,
        run_name=run.run_name,
        state=(
            run.state.life_cycle_state.value
            if run.state and run.state.life_cycle_state
            else "UNKNOWN"
        ),
        result_state=(
            run.state.result_state.value
            if run.state and run.state.result_state
            else None
        ),
        start_time=(
            datetime.fromtimestamp(run.start_time / 1000, tz=timezone.utc) if run.start_time else None
        ),
        end_time=(
            datetime.fromtimestamp(run.end_time / 1000, tz=timezone.utc) if run.end_time else None
        ),
        run_page_url=run.run_page_url,
    )


@router.get("/list", response_model=list[JobApiOut])
async def list_jobs_api(
    limit: Annotated[
        int, Query(ge=1, le=1000, description="Maximum number of jobs to return")
    ] = 100,
    ws=Depends(get_ws),
) -> list[JobApiOut]:
    """List all jobs via Jobs API (real-time).

    Returns job definitions directly from the Jobs API. Useful for:
    - Discovering jobs not yet in system tables (365-day retention limit)
    - Getting the most up-to-date job configurations

    Args:
        limit: Maximum number of jobs to return (1-1000, default 100)
        ws: WorkspaceClient dependency

    Returns:
        List of jobs with basic metadata
    """
    if not ws:
        raise HTTPException(
            status_code=503,
            detail="WorkspaceClient not available. Check Databricks credentials.",
        )

    try:
        jobs = await asyncio.wait_for(
            asyncio.to_thread(lambda: list(ws.jobs.list(limit=limit))),
            timeout=JOBS_API_TIMEOUT,
        )
        return [_job_to_model(j) for j in jobs]
    except asyncio.TimeoutError:
        logger.warning(f"Jobs API timeout after {JOBS_API_TIMEOUT}s for list jobs")
        raise HTTPException(
            status_code=504,
            detail=f"Jobs API request timed out after {JOBS_API_TIMEOUT}s",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list jobs: {str(e)}",
        )


@router.get("/runs/{job_id}", response_model=list[JobApiRunOut])
async def list_job_runs_api(
    job_id: int,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum number of runs to return")
    ] = 20,
    ws=Depends(get_ws),
) -> list[JobApiRunOut]:
    """Get recent runs for a specific job via Jobs API (real-time).

    Returns the most recent runs for a job directly from the Jobs API.
    Useful for monitoring critical jobs where 5-15 minute system table
    latency is not acceptable.

    Args:
        job_id: The job ID to get runs for
        limit: Maximum number of runs to return (1-100, default 20)
        ws: WorkspaceClient dependency

    Returns:
        List of job runs with status information
    """
    if not ws:
        raise HTTPException(
            status_code=503,
            detail="WorkspaceClient not available. Check Databricks credentials.",
        )

    try:
        runs = await asyncio.wait_for(
            asyncio.to_thread(lambda: list(ws.jobs.list_runs(job_id=job_id, limit=limit))),
            timeout=JOBS_API_TIMEOUT,
        )
        return [_run_to_model(r) for r in runs]
    except asyncio.TimeoutError:
        logger.warning(f"Jobs API timeout after {JOBS_API_TIMEOUT}s for job {job_id} runs")
        raise HTTPException(
            status_code=504,
            detail=f"Jobs API request timed out after {JOBS_API_TIMEOUT}s",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list runs for job {job_id}: {str(e)}",
        )


async def _fetch_active_runs_cached(ws) -> tuple[list, float]:
    """Fetch active runs with caching and limited pagination.

    Returns (runs_list, cache_timestamp) tuple.
    """
    cache_key = "active_runs_all"
    cached = response_cache.get(cache_key)
    if cached:
        logger.info(f"[CACHE_HIT] Active runs from cache ({len(cached['runs'])} runs)")
        return cached["runs"], cached["timestamp"]

    # Fetch with limited pagination to avoid long waits
    # Using iterator with manual pagination control
    runs = []
    page_count = 0

    try:
        # Get the iterator - don't convert to list() which fetches all pages
        runs_iter = ws.jobs.list_runs(active_only=True)

        # Manually iterate with page limit
        for run in runs_iter:
            runs.append(run)
            # Each "page" from API is ~100 runs
            if len(runs) >= MAX_ACTIVE_RUNS_PAGES * 100:
                logger.info(f"[ACTIVE_RUNS] Reached max limit ({len(runs)} runs), stopping pagination")
                break
    except Exception as e:
        logger.error(f"Error fetching active runs: {e}")
        raise

    # Cache the results
    cache_data = {"runs": runs, "timestamp": time.time()}
    response_cache.set(cache_key, cache_data, ACTIVE_RUNS_CACHE_TTL)
    logger.info(f"[CACHE_SET] Cached {len(runs)} active runs (TTL={ACTIVE_RUNS_CACHE_TTL}s)")

    return runs, time.time()


@router.get("/active/summary", response_model=ActiveRunsSummary)
async def get_active_runs_summary(
    ws=Depends(get_ws),
) -> ActiveRunsSummary:
    """Get a lightweight summary of active runs for dashboard display.

    Returns only counts (not full run details) for fast dashboard loading.
    Cached for 30 seconds to balance freshness with performance.

    Returns:
        Summary with total_active, running_count, pending_count, queued_count
    """
    if not ws:
        raise HTTPException(
            status_code=503,
            detail="WorkspaceClient not available. Check Databricks credentials.",
        )

    try:
        runs, cache_time = await asyncio.wait_for(
            asyncio.to_thread(lambda: _fetch_active_runs_cached_sync(ws)),
            timeout=JOBS_API_TIMEOUT,
        )

        # Count by state
        running = pending = queued = 0
        for run in runs:
            state = run.state.life_cycle_state.value if run.state and run.state.life_cycle_state else ""
            if state == "RUNNING":
                running += 1
            elif state == "PENDING":
                pending += 1
            elif state == "QUEUED":
                queued += 1

        cache_age = int(time.time() - cache_time) if cache_time else 0

        return ActiveRunsSummary(
            total_active=len(runs),
            running_count=running,
            pending_count=pending,
            queued_count=queued,
            from_cache=cache_age > 0,
            cache_age_seconds=cache_age,
        )
    except asyncio.TimeoutError:
        logger.warning(f"Jobs API timeout after {JOBS_API_TIMEOUT}s for active runs summary")
        raise HTTPException(
            status_code=504,
            detail=f"Jobs API request timed out after {JOBS_API_TIMEOUT}s",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get active runs summary: {str(e)}",
        )


def _fetch_active_runs_cached_sync(ws) -> tuple[list, float]:
    """Synchronous version for use with asyncio.to_thread."""
    cache_key = "active_runs_all"
    cached = response_cache.get(cache_key)
    if cached:
        logger.info(f"[CACHE_HIT] Active runs from cache ({len(cached['runs'])} runs)")
        return cached["runs"], cached["timestamp"]

    # Fetch with limited pagination
    runs = []
    try:
        runs_iter = ws.jobs.list_runs(active_only=True)
        for run in runs_iter:
            runs.append(run)
            if len(runs) >= MAX_ACTIVE_RUNS_PAGES * 100:
                logger.info(f"[ACTIVE_RUNS] Reached max limit ({len(runs)} runs)")
                break
    except Exception as e:
        logger.error(f"Error fetching active runs: {e}")
        raise

    # Cache the results
    cache_data = {"runs": runs, "timestamp": time.time()}
    response_cache.set(cache_key, cache_data, ACTIVE_RUNS_CACHE_TTL)
    logger.info(f"[CACHE_SET] Cached {len(runs)} active runs")

    return runs, time.time()


@router.get("/active", response_model=ActiveRunsOut)
async def get_active_runs(
    page: Annotated[int, Query(ge=1, description="Page number (1-indexed)")] = 1,
    page_size: Annotated[
        int, Query(ge=10, le=200, description="Number of runs per page")
    ] = 50,
    ws=Depends(get_ws),
) -> ActiveRunsOut:
    """Get currently active/running jobs via Jobs API (real-time).

    Returns jobs that are currently running or pending with pagination support.
    Results are cached for 30 seconds to balance freshness with performance.

    Note: Limited to first 300 active runs for performance. Use filters
    if you need to see specific jobs in large workspaces.

    Args:
        page: Page number (1-indexed, default 1)
        page_size: Number of runs per page (10-200, default 50)
        ws: WorkspaceClient dependency

    Returns:
        Paginated list of active runs with total count
    """
    if not ws:
        raise HTTPException(
            status_code=503,
            detail="WorkspaceClient not available. Check Databricks credentials.",
        )

    try:
        runs, _ = await asyncio.wait_for(
            asyncio.to_thread(lambda: _fetch_active_runs_cached_sync(ws)),
            timeout=JOBS_API_TIMEOUT,
        )
        run_models = [_run_to_model(r) for r in runs]

        # Paginate the results
        total_active = len(run_models)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_runs = run_models[start_idx:end_idx]
        has_more = end_idx < total_active

        return ActiveRunsOut(
            total_active=total_active,
            runs=paginated_runs,
            page=page,
            page_size=page_size,
            has_more=has_more,
        )
    except asyncio.TimeoutError:
        logger.warning(f"Jobs API timeout after {JOBS_API_TIMEOUT}s for active runs")
        raise HTTPException(
            status_code=504,
            detail=f"Jobs API request timed out after {JOBS_API_TIMEOUT}s. Try again later.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get active runs: {str(e)}",
        )


@router.get("/active-with-history", response_model=ActiveRunsWithHistoryOut)
async def get_active_runs_with_history(
    ws=Depends(get_ws),
) -> ActiveRunsWithHistoryOut:
    """Get active runs with recent run history for each job.

    Returns all currently active jobs enriched with the last 5 completed runs
    for each job. This enables displaying the recent run status icons like
    in the Databricks native UI.

    Note: To keep response times reasonable, history is fetched only for
    up to 100 unique jobs. Jobs without history will show empty circles.

    Args:
        ws: WorkspaceClient dependency

    Returns:
        Active runs with recent run history
    """
    if not ws:
        raise HTTPException(
            status_code=503,
            detail="WorkspaceClient not available. Check Databricks credentials.",
        )

    try:
        # Get active runs with timeout
        active_runs = await asyncio.wait_for(
            asyncio.to_thread(lambda: list(ws.jobs.list_runs(active_only=True))),
            timeout=JOBS_API_TIMEOUT,
        )

        # Get unique job IDs - limit to 50 to keep response time reasonable
        all_job_ids = list(set(run.job_id for run in active_runs))
        job_ids = all_job_ids[:50]  # Limit history fetches

        # Use semaphore to limit concurrent API calls (SDK is blocking)
        semaphore = asyncio.Semaphore(10)

        async def fetch_job_history(job_id: int) -> tuple[int, list[RecentRunStatus]]:
            """Fetch last 5 completed runs for a job."""
            async with semaphore:
                try:
                    runs = await asyncio.to_thread(
                        lambda jid=job_id: list(ws.jobs.list_runs(job_id=jid, limit=6))
                    )
                    # Filter to completed runs only (exclude currently running)
                    completed = [
                        RecentRunStatus(
                            run_id=r.run_id,
                            result_state=(
                                r.state.result_state.value
                                if r.state and r.state.result_state
                                else None
                            ),
                        )
                        for r in runs
                        if r.state
                        and r.state.life_cycle_state
                        and r.state.life_cycle_state.value == "TERMINATED"
                    ][:5]
                    return (job_id, completed)
                except Exception:
                    return (job_id, [])

        # Fetch job histories with limited concurrency
        history_tasks = [fetch_job_history(job_id) for job_id in job_ids]
        history_results = await asyncio.gather(*history_tasks)
        history_by_job = dict(history_results)

        # Build enriched response
        enriched_runs = [
            ActiveRunWithHistory(
                run_id=run.run_id,
                job_id=run.job_id,
                run_name=run.run_name,
                state=(
                    run.state.life_cycle_state.value
                    if run.state and run.state.life_cycle_state
                    else "UNKNOWN"
                ),
                result_state=(
                    run.state.result_state.value
                    if run.state and run.state.result_state
                    else None
                ),
                start_time=(
                    datetime.fromtimestamp(run.start_time / 1000, tz=timezone.utc)
                    if run.start_time
                    else None
                ),
                end_time=(
                    datetime.fromtimestamp(run.end_time / 1000, tz=timezone.utc)
                    if run.end_time
                    else None
                ),
                run_page_url=run.run_page_url,
                recent_runs=history_by_job.get(run.job_id, []),
            )
            for run in active_runs
        ]

        return ActiveRunsWithHistoryOut(
            total_active=len(enriched_runs), runs=enriched_runs
        )
    except asyncio.TimeoutError:
        logger.warning(f"Jobs API timeout after {JOBS_API_TIMEOUT}s for active runs with history")
        raise HTTPException(
            status_code=504,
            detail=f"Jobs API request timed out after {JOBS_API_TIMEOUT}s",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get active runs with history: {str(e)}",
        )


# Export router with alias for consistency
api = router
