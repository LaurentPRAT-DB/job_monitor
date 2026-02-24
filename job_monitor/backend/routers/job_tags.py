"""Job tags router for SLA target and team attribution management.

Provides CRUD operations for job tags via Databricks Jobs API:
- Read SLA target, team, and owner tags
- Update tags with merge behavior (preserves existing settings)
- Query p90 duration to suggest SLA targets for jobs without SLA
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException

from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws
from job_monitor.backend.models import JobTagsOut, TagUpdateRequest, TagUpdateResponse

router = APIRouter(prefix="/api/jobs", tags=["job-tags"])


def _extract_tag_value(tags: dict[str, str] | None, key: str) -> str | None:
    """Extract tag value from job tags dict, handling None case."""
    if not tags:
        return None
    return tags.get(key)


def _extract_int_tag(tags: dict[str, str] | None, key: str) -> int | None:
    """Extract integer tag value, handling conversion and None cases."""
    value = _extract_tag_value(tags, key)
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


async def _get_p90_duration(ws, job_id: str, warehouse_id: str) -> int | None:
    """Query p90 duration for a job to suggest SLA target.

    Returns p90 duration in minutes, rounded up.
    """
    if not warehouse_id:
        return None

    query = f"""
    SELECT
        CEIL(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY run_duration_seconds) / 60) as p90_minutes
    FROM system.lakeflow.job_run_timeline
    WHERE job_id = '{job_id}'
      AND period_start_time >= current_date() - INTERVAL 30 DAYS
      AND run_duration_seconds IS NOT NULL
      AND result_state IS NOT NULL
    HAVING COUNT(*) >= 5
    """

    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=query,
            wait_timeout="30s",
        )

        if result and result.result and result.result.data_array:
            row = result.result.data_array[0]
            if row[0] is not None:
                return int(row[0])
    except Exception:
        # If query fails, return None - not critical
        pass

    return None


@router.get("/{job_id}/tags", response_model=JobTagsOut)
async def get_job_tags(
    job_id: str,
    ws=Depends(get_ws),
) -> JobTagsOut:
    """Read job tags including SLA, team, and owner.

    Retrieves tag values using configured tag keys from settings.
    If no SLA is set, queries duration stats to suggest p90 as SLA target.

    Args:
        job_id: The job ID to get tags for
        ws: WorkspaceClient dependency

    Returns:
        Job tags with SLA, team, owner, and suggested SLA if not set
    """
    if not ws:
        raise HTTPException(
            status_code=503,
            detail="WorkspaceClient not available. Check Databricks credentials.",
        )

    try:
        job = await asyncio.to_thread(ws.jobs.get, job_id=int(job_id))
    except Exception as e:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found: {str(e)}",
        )

    # Extract tags from job settings
    tags = job.settings.tags if job.settings else None

    sla_minutes = _extract_int_tag(tags, settings.sla_tag_key)
    team = _extract_tag_value(tags, settings.team_tag_key)
    owner = _extract_tag_value(tags, settings.owner_tag_key)

    # If no SLA set, query p90 to suggest a value
    suggested_p90 = None
    if sla_minutes is None:
        suggested_p90 = await _get_p90_duration(ws, job_id, settings.warehouse_id)

    return JobTagsOut(
        job_id=job_id,
        sla_minutes=sla_minutes,
        suggested_p90_minutes=suggested_p90,
        team=team,
        owner=owner,
        has_sla=sla_minutes is not None,
        has_team=team is not None,
    )


@router.patch("/{job_id}/tags", response_model=TagUpdateResponse)
async def update_job_tags(
    job_id: str,
    request: TagUpdateRequest,
    ws=Depends(get_ws),
) -> TagUpdateResponse:
    """Update job tags (SLA, team, owner) with merge behavior.

    Merges requested tag updates with existing tags, preserving
    all job settings (name, tasks, schedule, max_concurrent_runs).

    Args:
        job_id: The job ID to update tags for
        request: Tag values to update (only non-None values are applied)
        ws: WorkspaceClient dependency

    Returns:
        Updated tags after merge
    """
    if not ws:
        raise HTTPException(
            status_code=503,
            detail="WorkspaceClient not available. Check Databricks credentials.",
        )

    # Get current job to preserve settings
    try:
        job = await asyncio.to_thread(ws.jobs.get, job_id=int(job_id))
    except Exception as e:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found: {str(e)}",
        )

    if not job.settings:
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} has no settings",
        )

    # Merge tags: start with existing, update with requested values
    current_tags = dict(job.settings.tags) if job.settings.tags else {}

    if request.sla_minutes is not None:
        current_tags[settings.sla_tag_key] = str(request.sla_minutes)
    if request.team is not None:
        current_tags[settings.team_tag_key] = request.team
    if request.owner is not None:
        current_tags[settings.owner_tag_key] = request.owner

    # Update job with merged tags, preserving other settings
    try:
        await asyncio.to_thread(
            ws.jobs.update,
            job_id=int(job_id),
            new_settings={
                "name": job.settings.name,
                "tags": current_tags,
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update job {job_id}: {str(e)}",
        )

    return TagUpdateResponse(
        job_id=job_id,
        tags=current_tags,
    )
