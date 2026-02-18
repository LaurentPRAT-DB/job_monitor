"""Jobs API router for real-time job data from Databricks Jobs API.

This router provides real-time job information that supplements system tables.
System tables have 5-15 minute latency, while Jobs API provides instant access to:
- Currently running jobs
- Recent run status
- Job definitions not yet in system tables (365-day retention limit)
"""

import asyncio
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from job_monitor.backend.core import get_ws
from job_monitor.backend.models import ActiveRunsOut, JobApiOut, JobApiRunOut

router = APIRouter(prefix="/api/jobs-api", tags=["Jobs API"])


def _job_to_model(job) -> JobApiOut:
    """Convert SDK Job object to JobApiOut model."""
    return JobApiOut(
        job_id=job.job_id,
        name=job.settings.name if job.settings else "Unknown",
        creator_user_name=job.creator_user_name,
        created_time=(
            datetime.fromtimestamp(job.created_time / 1000)
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
            datetime.fromtimestamp(run.start_time / 1000) if run.start_time else None
        ),
        end_time=(
            datetime.fromtimestamp(run.end_time / 1000) if run.end_time else None
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
        jobs = await asyncio.to_thread(lambda: list(ws.jobs.list(limit=limit)))
        return [_job_to_model(j) for j in jobs]
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
        runs = await asyncio.to_thread(
            lambda: list(ws.jobs.list_runs(job_id=job_id, limit=limit))
        )
        return [_run_to_model(r) for r in runs]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list runs for job {job_id}: {str(e)}",
        )


@router.get("/active", response_model=ActiveRunsOut)
async def get_active_runs(
    ws=Depends(get_ws),
) -> ActiveRunsOut:
    """Get all currently active/running jobs via Jobs API (real-time).

    Returns all jobs that are currently running or pending. This is the
    primary endpoint for real-time monitoring dashboards showing
    "currently running" status.

    Note: System tables have 5-15 minute latency, so this endpoint is
    essential for accurate real-time monitoring.

    Args:
        ws: WorkspaceClient dependency

    Returns:
        Count and list of all active runs
    """
    if not ws:
        raise HTTPException(
            status_code=503,
            detail="WorkspaceClient not available. Check Databricks credentials.",
        )

    try:
        runs = await asyncio.to_thread(
            lambda: list(ws.jobs.list_runs(active_only=True))
        )
        run_models = [_run_to_model(r) for r in runs]
        return ActiveRunsOut(total_active=len(run_models), runs=run_models)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get active runs: {str(e)}",
        )


# Export router with alias for consistency
api = router
