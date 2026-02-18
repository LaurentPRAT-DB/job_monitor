"""Jobs router for system.lakeflow table queries."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws
from job_monitor.backend.models import JobOut, JobRunListOut

router = APIRouter(prefix="/api", tags=["jobs"])


def _parse_job_runs(result) -> list[JobRunListOut]:
    """Parse statement execution result into JobRunListOut models."""
    if not result or not result.result or not result.result.data_array:
        return []

    runs = []
    for row in result.result.data_array:
        runs.append(
            JobRunListOut(
                run_id=str(row[0]),
                job_id=str(row[1]),
                period_start_time=row[2],
                period_end_time=row[3] if row[3] else None,
                run_duration_seconds=int(row[4]) if row[4] else None,
                result_state=row[5] if row[5] else None,
            )
        )
    return runs


def _parse_jobs(result) -> list[JobOut]:
    """Parse statement execution result into JobOut models."""
    if not result or not result.result or not result.result.data_array:
        return []

    jobs = []
    for row in result.result.data_array:
        jobs.append(
            JobOut(
                job_id=str(row[0]),
                name=str(row[1]) if row[1] else "",
                creator_user_name=row[2] if row[2] else None,
                run_as_user_name=row[3] if row[3] else None,
                schedule=row[4] if len(row) > 4 and row[4] else None,
            )
        )
    return jobs


@router.get("/jobs/runs", response_model=list[JobRunListOut])
async def list_job_runs(
    days: Annotated[int, Query(ge=1, le=90, description="Number of days to look back")] = 7,
    ws=Depends(get_ws),
) -> list[JobRunListOut]:
    """List job runs from system.lakeflow.job_run_timeline.

    Queries the job run timeline system table for runs within the specified
    time window. Results are ordered by start time (most recent first) and
    limited to 1000 records.

    Args:
        days: Number of days to look back (1-90, default 7)
        ws: WorkspaceClient dependency

    Returns:
        List of job runs with timing and status information
    """
    if not ws:
        return []

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        return []

    query = f"""
    SELECT run_id, job_id, period_start_time, period_end_time,
           run_duration_seconds, result_state
    FROM system.lakeflow.job_run_timeline
    WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
    ORDER BY period_start_time DESC
    LIMIT 1000
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="30s",
    )

    return _parse_job_runs(result)


@router.get("/jobs", response_model=list[JobOut])
async def list_jobs(
    ws=Depends(get_ws),
) -> list[JobOut]:
    """List jobs from system.lakeflow.jobs with SCD2 handling.

    Queries the jobs system table using ROW_NUMBER partitioning to get the
    latest version of each job. Only returns active jobs (delete_time IS NULL).

    The SCD2 pattern ensures we get the most recent job metadata even when
    jobs have been updated multiple times.

    Args:
        ws: WorkspaceClient dependency

    Returns:
        List of jobs with the latest metadata
    """
    if not ws:
        return []

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        return []

    # SCD2 pattern: ROW_NUMBER OVER PARTITION BY to get latest version
    query = """
    WITH latest_jobs AS (
        SELECT *,
            ROW_NUMBER() OVER(
                PARTITION BY workspace_id, job_id
                ORDER BY change_time DESC
            ) as rn
        FROM system.lakeflow.jobs
        WHERE delete_time IS NULL
    )
    SELECT job_id, name, creator_user_name, run_as_user_name
    FROM latest_jobs
    WHERE rn = 1
    ORDER BY name
    LIMIT 1000
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="30s",
    )

    return _parse_jobs(result)


# Export router with alias for consistency
api = router
