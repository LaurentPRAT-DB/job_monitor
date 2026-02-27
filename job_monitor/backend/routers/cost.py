"""Cost router for job cost attribution and anomaly detection.

Provides:
- Job cost summary with SKU breakdown
- Team cost rollups
- Cost anomalies (spikes and zombie jobs)

Supports cache-first loading for fast response times.

IMPORTANT: Uses HAVING SUM(usage_quantity) != 0 to handle RETRACTION records.
Databricks billing system uses negative quantities for corrections.
"""

import asyncio
import logging
import traceback
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

logger = logging.getLogger(__name__)

from job_monitor.backend.cache import query_cost_cache
from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws_prefer_user
from job_monitor.backend.mock_data import get_mock_cost_summary, is_mock_mode
from job_monitor.backend.response_cache import response_cache, TTL_SLOW
from job_monitor.backend.models import (
    CostAnomalyOut,
    CostBySkuOut,
    CostSummaryOut,
    JobCostOut,
    TeamCostOut,
)

router = APIRouter(prefix="/api/costs", tags=["costs"])


def _categorize_sku(sku_name: str) -> str:
    """Categorize SKU name into display category.

    Categories:
    - ALL_PURPOSE -> "All-Purpose"
    - JOBS -> "Jobs Compute"
    - SQL -> "SQL Warehouse"
    - SERVERLESS -> "Serverless"
    - else -> "Other"
    """
    sku_upper = sku_name.upper()
    if "ALL_PURPOSE" in sku_upper:
        return "All-Purpose"
    elif "JOBS" in sku_upper:
        return "Jobs Compute"
    elif "SQL" in sku_upper:
        return "SQL Warehouse"
    elif "SERVERLESS" in sku_upper:
        return "Serverless"
    else:
        return "Other"


def _parse_job_costs(result, dbu_rate: float) -> list[JobCostOut]:
    """Parse statement execution result into JobCostOut models.

    Expected columns:
    0: job_id
    1: job_name
    2: total_dbus_30d
    3: current_7d_dbus
    4: prev_7d_dbus
    5: sku_breakdown (JSON string or structured)
    6: p90_dbus
    """
    if not result or not result.result or not result.result.data_array:
        return []

    jobs = []
    for row in result.result.data_array:
        job_id = str(row[0]) if row[0] else ""
        job_name = str(row[1]) if row[1] else f"job-{job_id}"
        total_dbus = float(row[2]) if row[2] else 0.0
        current_7d = float(row[3]) if row[3] else 0.0
        prev_7d = float(row[4]) if row[4] else 0.0
        p90_dbus = float(row[6]) if row[6] else None

        # Calculate 7-day trend
        if prev_7d > 0:
            trend = ((current_7d - prev_7d) / prev_7d) * 100
        else:
            trend = 0.0 if current_7d == 0 else 100.0

        # Check for anomaly (cost spike > 2x p90)
        is_anomaly = False
        if p90_dbus and current_7d > 0:
            is_anomaly = current_7d > (2 * p90_dbus)

        # Calculate dollar cost if rate is set
        cost_dollars = total_dbus * dbu_rate if dbu_rate > 0 else None

        # Parse SKU breakdown (row[5] contains aggregated SKU data)
        # Format: "sku1:dbus1,sku2:dbus2,..."
        cost_by_sku = []
        if row[5] and total_dbus > 0:
            sku_parts = str(row[5]).split(",")
            for part in sku_parts:
                if ":" in part:
                    sku_name, dbus_str = part.split(":", 1)
                    try:
                        sku_dbus = float(dbus_str)
                        category = _categorize_sku(sku_name)
                        pct = (sku_dbus / total_dbus) * 100 if total_dbus > 0 else 0
                        cost_by_sku.append(
                            CostBySkuOut(
                                sku_category=category,
                                total_dbus=sku_dbus,
                                percentage=round(pct, 1),
                            )
                        )
                    except ValueError:
                        pass

        jobs.append(
            JobCostOut(
                job_id=job_id,
                job_name=job_name,
                team=None,  # Will be populated via Jobs API lookup
                total_dbus_30d=total_dbus,
                total_cost_dollars=cost_dollars,
                cost_by_sku=cost_by_sku,
                trend_7d_percent=round(trend, 1),
                is_anomaly=is_anomaly,
                baseline_p90_dbus=p90_dbus,
            )
        )

    return jobs


async def _get_job_teams(ws, job_ids: list[str]) -> dict[str, str]:
    """Lookup team tags for jobs via Jobs API.

    Returns a dict mapping job_id -> team name.
    Jobs without team tags are not included.
    """
    if not ws or not job_ids:
        return {}

    team_map = {}
    team_tag_key = settings.team_tag_key

    # Batch lookup - limit to avoid rate limiting
    batch_size = 50
    for i in range(0, len(job_ids), batch_size):
        batch = job_ids[i : i + batch_size]

        async def get_job_team(job_id: str) -> tuple[str, str | None]:
            try:
                job = await asyncio.to_thread(ws.jobs.get, job_id=int(job_id))
                if job.settings and job.settings.tags:
                    return (job_id, job.settings.tags.get(team_tag_key))
            except Exception:
                pass
            return (job_id, None)

        results = await asyncio.gather(*[get_job_team(jid) for jid in batch])
        for job_id, team in results:
            if team:
                team_map[job_id] = team

    return team_map


@router.get("/summary", response_model=CostSummaryOut)
async def get_cost_summary(
    days: Annotated[
        int, Query(ge=7, le=90, description="Time window in days")
    ] = 30,
    include_teams: Annotated[
        bool, Query(description="Include team tags lookup (adds 20-30s)")
    ] = False,
    workspace_id: Annotated[
        str | None,
        Query(description="Filter by workspace ID (omit or null for all, specific ID for single workspace)"),
    ] = None,
    page: Annotated[int, Query(ge=1, description="Page number (1-indexed)")] = 1,
    page_size: Annotated[
        int, Query(ge=10, le=200, description="Number of jobs per page")
    ] = 50,
    ws=Depends(get_ws_prefer_user),
) -> CostSummaryOut:
    """Get cost summary with per-job breakdown, team rollups, and anomalies.

    Queries system.billing.usage with SKU categorization and RETRACTION handling.
    Calculates 7-day trends and identifies cost anomalies.

    Supports cache-first loading and mock data fallback.

    Args:
        days: Time window for cost aggregation (7-90 days, default 30)
        ws: WorkspaceClient dependency

    Returns:
        Complete cost summary with jobs, teams, and anomalies
    """
    # Check for mock data mode
    if is_mock_mode():
        logger.info("Mock mode enabled - returning mock cost summary")
        return get_mock_cost_summary()

    if not ws:
        logger.warning("WorkspaceClient not available - falling back to mock cost summary")
        return get_mock_cost_summary()

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        logger.warning("Warehouse ID not configured - falling back to mock cost summary")
        return get_mock_cost_summary()

    # Check in-memory response cache first (fastest path)
    ws_filter = workspace_id if workspace_id else "all"
    cache_key = f"cost_summary:{days}:{include_teams}:{ws_filter}:p{page}:{page_size}"
    cached_response = response_cache.get(cache_key)
    if cached_response:
        logger.info(f"[RESPONSE_CACHE] Returning cached cost summary ({days}d, ws={ws_filter}, page={page})")
        return cached_response

    dbu_rate = settings.dbu_rate

    # Try Delta table cache for fast response
    # NOTE: Delta cache doesn't support workspace filtering, so skip it when workspace_id is specified
    use_delta_cache = settings.use_cache and (not workspace_id or workspace_id == "all")
    if use_delta_cache:
        logger.info("[CACHE] Attempting Delta cache lookup for costs/summary (no workspace filter)")
        cached_data = await query_cost_cache(ws)
        if cached_data:
            logger.info(f"[CACHE_HIT] costs/summary: returning {len(cached_data)} jobs from cache")

            # Parse cached data into JobCostOut models
            jobs = []
            for row in cached_data:
                # Parse SKU breakdown
                cost_by_sku = []
                if row["sku_breakdown"] and row["total_dbus_30d"] > 0:
                    sku_parts = row["sku_breakdown"].split(",")
                    for part in sku_parts:
                        if ":" in part:
                            sku_name, dbus_str = part.split(":", 1)
                            try:
                                sku_dbus = float(dbus_str)
                                category = _categorize_sku(sku_name)
                                pct = (sku_dbus / row["total_dbus_30d"]) * 100
                                cost_by_sku.append(CostBySkuOut(
                                    sku_category=category,
                                    total_dbus=sku_dbus,
                                    percentage=round(pct, 1),
                                ))
                            except ValueError:
                                pass

                jobs.append(JobCostOut(
                    job_id=row["job_id"],
                    job_name=row["job_name"],
                    team=None,  # Will be populated via Jobs API
                    total_dbus_30d=row["total_dbus_30d"],
                    total_cost_dollars=row["total_dbus_30d"] * dbu_rate if dbu_rate > 0 else None,
                    cost_by_sku=cost_by_sku,
                    trend_7d_percent=row["trend_7d_percent"],
                    is_anomaly=row["is_anomaly"],
                    baseline_p90_dbus=row["baseline_p90_dbus"],
                ))

            # Lookup team tags only if requested (adds 20-30s)
            if include_teams:
                job_ids = [j.job_id for j in jobs]
                team_map = await _get_job_teams(ws, job_ids)
                for job in jobs:
                    job.team = team_map.get(job.job_id)

            # Calculate team rollups
            team_costs: dict[str, dict] = {}
            for job in jobs:
                team = job.team or "Untagged"
                if team not in team_costs:
                    team_costs[team] = {"total_dbus": 0.0, "job_count": 0, "current_7d": 0.0, "prev_7d": 0.0}
                team_costs[team]["total_dbus"] += job.total_dbus_30d
                team_costs[team]["job_count"] += 1

            teams = [
                TeamCostOut(
                    team=team_name,
                    total_dbus_30d=data["total_dbus"],
                    total_cost_dollars=data["total_dbus"] * dbu_rate if dbu_rate > 0 else None,
                    job_count=data["job_count"],
                    trend_7d_percent=0.0,
                )
                for team_name, data in sorted(team_costs.items(), key=lambda x: x[1]["total_dbus"], reverse=True)
            ]

            # Identify anomalies from cached data
            anomalies = [
                CostAnomalyOut(
                    job_id=job.job_id,
                    job_name=job.job_name,
                    team=job.team,
                    anomaly_type="cost_spike",
                    reason=f"Cost {job.total_dbus_30d / job.baseline_p90_dbus:.1f}x higher than p90 baseline" if job.baseline_p90_dbus else "Cost spike",
                    current_dbus=job.total_dbus_30d,
                    baseline_p90_dbus=job.baseline_p90_dbus,
                    multiplier=job.total_dbus_30d / job.baseline_p90_dbus if job.baseline_p90_dbus else None,
                    job_settings_url=f"{settings.databricks_host}/jobs/{job.job_id}",
                )
                for job in jobs if job.is_anomaly and job.baseline_p90_dbus
            ]

            total_dbus = sum(j.total_dbus_30d for j in jobs)
            total_jobs_count = len(jobs)

            # Paginate jobs list
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            paginated_jobs = jobs[start_idx:end_idx]
            has_more = end_idx < total_jobs_count

            result = CostSummaryOut(
                jobs=paginated_jobs,
                teams=teams,
                anomalies=anomalies,
                total_dbus_30d=total_dbus,
                total_cost_dollars=total_dbus * dbu_rate if dbu_rate > 0 else None,
                dbu_rate=dbu_rate,
                total_jobs_count=total_jobs_count,
                page=page,
                page_size=page_size,
                has_more=has_more,
            )
            # Cache in response cache for instant subsequent requests
            response_cache.set(cache_key, result, TTL_SLOW)
            logger.info(f"[RESPONSE_CACHE] Cached cost summary from Delta cache (page {page}, {len(paginated_jobs)} of {total_jobs_count} jobs)")
            return result

        logger.info("[CACHE_MISS] costs/summary: falling back to live query")
    elif workspace_id:
        logger.info(f"[CACHE_SKIP] Skipping Delta cache - workspace filter active: {workspace_id}")

    # Build workspace filter clause
    # workspace_id in system tables is BIGINT, not string - don't quote it
    workspace_clause = ""
    if workspace_id and workspace_id != "all":
        workspace_clause = f"AND workspace_id = {workspace_id}"

    # Main query: Job costs with SKU breakdown and trend calculation
    query = f"""
    WITH job_costs AS (
        SELECT
            usage_metadata.job_id as job_id,
            sku_name,
            SUM(usage_quantity) as total_dbus,
            SUM(CASE WHEN usage_date >= current_date() - INTERVAL 7 DAYS THEN usage_quantity ELSE 0 END) as current_7d,
            SUM(CASE WHEN usage_date >= current_date() - INTERVAL 14 DAYS AND usage_date < current_date() - INTERVAL 7 DAYS THEN usage_quantity ELSE 0 END) as prev_7d
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL {days} DAYS
          AND usage_metadata.job_id IS NOT NULL {workspace_clause}
        GROUP BY usage_metadata.job_id, sku_name
        HAVING SUM(usage_quantity) != 0
    ),
    job_totals AS (
        SELECT
            job_id,
            SUM(total_dbus) as total_dbus_30d,
            SUM(current_7d) as current_7d_dbus,
            SUM(prev_7d) as prev_7d_dbus,
            CONCAT_WS(',', COLLECT_LIST(CONCAT(sku_name, ':', CAST(total_dbus AS STRING)))) as sku_breakdown
        FROM job_costs
        GROUP BY job_id
    ),
    job_p90 AS (
        -- Calculate p90 DBU baseline per job (daily totals over 30 days)
        SELECT
            job_id,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY daily_dbus) as p90_dbus
        FROM (
            SELECT
                usage_metadata.job_id as job_id,
                usage_date,
                SUM(usage_quantity) as daily_dbus
            FROM system.billing.usage
            WHERE usage_date >= current_date() - INTERVAL 30 DAYS
              AND usage_metadata.job_id IS NOT NULL {workspace_clause}
            GROUP BY usage_metadata.job_id, usage_date
            HAVING SUM(usage_quantity) != 0
        )
        GROUP BY job_id
        HAVING COUNT(*) >= 5
    ),
    job_names AS (
        SELECT job_id, name,
            ROW_NUMBER() OVER(PARTITION BY workspace_id, job_id ORDER BY change_time DESC) as rn
        FROM system.lakeflow.jobs
        WHERE delete_time IS NULL {workspace_clause}
    )
    SELECT
        jt.job_id,
        COALESCE(jn.name, CONCAT('job-', jt.job_id)) as job_name,
        jt.total_dbus_30d,
        jt.current_7d_dbus,
        jt.prev_7d_dbus,
        jt.sku_breakdown,
        jp.p90_dbus
    FROM job_totals jt
    LEFT JOIN job_names jn ON jt.job_id = jn.job_id AND jn.rn = 1
    LEFT JOIN job_p90 jp ON jt.job_id = jp.job_id
    ORDER BY jt.total_dbus_30d DESC
    LIMIT 500
    """

    logger.info(f"[cost.get_cost_summary] Executing SQL on warehouse {warehouse_id}, days={days}")
    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=query,
            wait_timeout="50s",
        )
        logger.info(f"[cost.get_cost_summary] SQL completed, status: {result.status.state if result and result.status else 'None'}")
        if result and result.status and result.status.error:
            logger.error(f"[cost.get_cost_summary] SQL error: {result.status.error}")
        if result and result.result:
            row_count = len(result.result.data_array) if result.result.data_array else 0
            logger.info(f"[cost.get_cost_summary] Result row count: {row_count}")
    except Exception as e:
        logger.error(f"[cost.get_cost_summary] SQL execution failed: {e}")
        logger.error(f"[cost.get_cost_summary] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"SQL execution failed: {str(e)}")

    jobs = _parse_job_costs(result, dbu_rate)
    logger.info(f"[cost.get_cost_summary] Parsed {len(jobs)} jobs")

    # Lookup team tags for jobs only if requested (adds 20-30s)
    if include_teams:
        job_ids = [j.job_id for j in jobs]
        team_map = await _get_job_teams(ws, job_ids)
        # Apply team tags to jobs
        for job in jobs:
            job.team = team_map.get(job.job_id)

    # Calculate team rollups
    team_costs: dict[str, dict] = {}
    for job in jobs:
        team = job.team or "Untagged"
        if team not in team_costs:
            team_costs[team] = {
                "total_dbus": 0.0,
                "job_count": 0,
                "current_7d": 0.0,
                "prev_7d": 0.0,
            }
        team_costs[team]["total_dbus"] += job.total_dbus_30d
        team_costs[team]["job_count"] += 1
        # Approximate trend from job trends
        if job.trend_7d_percent != 0:
            team_costs[team]["current_7d"] += job.total_dbus_30d * (
                1 + job.trend_7d_percent / 100
            )
            team_costs[team]["prev_7d"] += job.total_dbus_30d

    teams = []
    for team_name, data in sorted(
        team_costs.items(), key=lambda x: x[1]["total_dbus"], reverse=True
    ):
        if data["prev_7d"] > 0:
            trend = ((data["current_7d"] - data["prev_7d"]) / data["prev_7d"]) * 100
        else:
            trend = 0.0

        teams.append(
            TeamCostOut(
                team=team_name,
                total_dbus_30d=data["total_dbus"],
                total_cost_dollars=data["total_dbus"] * dbu_rate if dbu_rate > 0 else None,
                job_count=data["job_count"],
                trend_7d_percent=round(trend, 1),
            )
        )

    # Identify anomalies
    anomalies = []
    for job in jobs:
        if job.is_anomaly and job.baseline_p90_dbus:
            # Cost spike: current > 2x p90
            multiplier = job.total_dbus_30d / job.baseline_p90_dbus if job.baseline_p90_dbus > 0 else None
            anomalies.append(
                CostAnomalyOut(
                    job_id=job.job_id,
                    job_name=job.job_name,
                    team=job.team,
                    anomaly_type="cost_spike",
                    reason=f"Cost {multiplier:.1f}x higher than p90 baseline" if multiplier else "Cost spike detected",
                    current_dbus=job.total_dbus_30d,
                    baseline_p90_dbus=job.baseline_p90_dbus,
                    multiplier=multiplier,
                    job_settings_url=f"{settings.databricks_host}/jobs/{job.job_id}",
                )
            )

    # Calculate totals
    total_dbus = sum(j.total_dbus_30d for j in jobs)
    total_cost = total_dbus * dbu_rate if dbu_rate > 0 else None
    total_jobs_count = len(jobs)

    # Paginate jobs list
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_jobs = jobs[start_idx:end_idx]
    has_more = end_idx < total_jobs_count

    result = CostSummaryOut(
        jobs=paginated_jobs,
        teams=teams,
        anomalies=anomalies,
        total_dbus_30d=total_dbus,
        total_cost_dollars=total_cost,
        dbu_rate=dbu_rate,
        total_jobs_count=total_jobs_count,
        page=page,
        page_size=page_size,
        has_more=has_more,
    )

    # Cache the response for 10 minutes
    response_cache.set(cache_key, result, TTL_SLOW)
    logger.info(f"[RESPONSE_CACHE] Cached cost summary (page {page}, {len(paginated_jobs)} of {total_jobs_count} jobs, {days}d)")

    return result


@router.get("/by-team", response_model=list[TeamCostOut])
async def get_costs_by_team(
    days: Annotated[
        int, Query(ge=7, le=90, description="Time window in days")
    ] = 30,
    ws=Depends(get_ws_prefer_user),
) -> list[TeamCostOut]:
    """Get cost rollups by team.

    Groups job costs by team tag, with "Untagged" for jobs without team tags.
    Sorted by total_dbus DESC.

    Args:
        days: Time window for cost aggregation (7-90 days, default 30)
        ws: WorkspaceClient dependency

    Returns:
        List of team cost summaries
    """
    # Reuse summary endpoint logic
    summary = await get_cost_summary(days=days, ws=ws)
    return summary.teams


@router.get("/anomalies", response_model=list[CostAnomalyOut])
async def get_cost_anomalies(
    days: Annotated[
        int, Query(ge=7, le=90, description="Time window in days")
    ] = 30,
    ws=Depends(get_ws_prefer_user),
) -> list[CostAnomalyOut]:
    """Get cost anomalies (spikes and zombie jobs).

    Anomaly types:
    - cost_spike: Current period DBUs > 2x p90 baseline
    - zombie: High cost with low/zero output (conservative thresholds)

    Args:
        days: Time window for anomaly detection (7-90 days, default 30)
        ws: WorkspaceClient dependency

    Returns:
        List of cost anomalies with details and job settings URLs
    """
    if not ws:
        raise HTTPException(
            status_code=503, detail="Databricks connection not available"
        )

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        raise HTTPException(status_code=503, detail="Warehouse ID not configured")

    # Get cost spike anomalies from summary
    summary = await get_cost_summary(days=days, ws=ws)
    anomalies = list(summary.anomalies)

    # Query for zombie jobs: high cost with low rows processed
    # Conservative thresholds: >10 DBUs with <100 rows over 30 days
    zombie_query = f"""
    WITH job_costs AS (
        SELECT
            usage_metadata.job_id as job_id,
            SUM(usage_quantity) as total_dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL {days} DAYS
          AND usage_metadata.job_id IS NOT NULL
        GROUP BY usage_metadata.job_id
        HAVING SUM(usage_quantity) > 10
    ),
    job_output AS (
        -- Approximate output by counting successful runs
        SELECT
            job_id,
            COUNT(*) as run_count,
            SUM(CASE WHEN result_state = 'SUCCESS' THEN 1 ELSE 0 END) as success_count
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
        GROUP BY job_id
    ),
    job_names AS (
        SELECT job_id, name,
            ROW_NUMBER() OVER(PARTITION BY workspace_id, job_id ORDER BY change_time DESC) as rn
        FROM system.lakeflow.jobs
        WHERE delete_time IS NULL
    )
    SELECT
        jc.job_id,
        COALESCE(jn.name, CONCAT('job-', jc.job_id)) as job_name,
        jc.total_dbus,
        COALESCE(jo.run_count, 0) as run_count,
        COALESCE(jo.success_count, 0) as success_count
    FROM job_costs jc
    LEFT JOIN job_output jo ON jc.job_id = jo.job_id
    LEFT JOIN job_names jn ON jc.job_id = jn.job_id AND jn.rn = 1
    WHERE COALESCE(jo.success_count, 0) = 0
      OR (jc.total_dbus / NULLIF(jo.run_count, 0) > 5)
    ORDER BY jc.total_dbus DESC
    LIMIT 50
    """

    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=zombie_query,
            wait_timeout="50s",
        )

        if result and result.result and result.result.data_array:
            # Get team tags for zombie jobs
            zombie_job_ids = [str(row[0]) for row in result.result.data_array if row[0]]
            team_map = await _get_job_teams(ws, zombie_job_ids)

            for row in result.result.data_array:
                job_id = str(row[0]) if row[0] else ""
                job_name = str(row[1]) if row[1] else f"job-{job_id}"
                total_dbus = float(row[2]) if row[2] else 0.0
                run_count = int(row[3]) if row[3] else 0
                success_count = int(row[4]) if row[4] else 0

                # Skip if already in anomalies (cost spike)
                if any(a.job_id == job_id for a in anomalies):
                    continue

                if success_count == 0 and run_count > 0:
                    reason = f"High cost ({total_dbus:.1f} DBUs) with 0 successful runs out of {run_count} attempts"
                elif run_count == 0:
                    reason = f"High cost ({total_dbus:.1f} DBUs) with no detected runs"
                else:
                    dbu_per_run = total_dbus / run_count
                    reason = f"High cost per run ({dbu_per_run:.1f} DBUs/run) may indicate inefficiency"

                anomalies.append(
                    CostAnomalyOut(
                        job_id=job_id,
                        job_name=job_name,
                        team=team_map.get(job_id),
                        anomaly_type="zombie",
                        reason=reason,
                        current_dbus=total_dbus,
                        baseline_p90_dbus=None,
                        multiplier=None,
                        job_settings_url=f"{settings.databricks_host}/jobs/{job_id}",
                    )
                )
    except Exception:
        # If zombie query fails, return cost spike anomalies only
        pass

    return anomalies
