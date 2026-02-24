"""Cluster metrics router for cluster utilization monitoring.

Provides:
- Cluster utilization metrics for job runs (proxy calculation from billing data)
- Over-provisioning detection with right-sizing recommendations

Note: Direct CPU/memory metrics are not available in Databricks system tables.
This implementation uses DBU consumption as a proxy for utilization.
"""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws
from job_monitor.backend.models import ClusterUtilization

router = APIRouter(prefix="/api/cluster-metrics", tags=["cluster-metrics"])


def _calculate_utilization_from_dbus(dbus_per_hour: float | None) -> tuple[float, float]:
    """Calculate estimated utilization percentage from DBUs per hour.

    Uses heuristic: Higher DBU/hour indicates higher utilization.
    - <1 DBU/hour = ~20% utilization
    - 1-2 DBU/hour = ~40% utilization
    - 2-4 DBU/hour = ~60% utilization
    - >4 DBU/hour = ~80% utilization

    Returns (driver_percent, worker_percent) split roughly 30/70.
    """
    if dbus_per_hour is None or dbus_per_hour <= 0:
        return (None, None)

    # Map DBU/hour to estimated utilization
    if dbus_per_hour < 1:
        base_util = 20.0
    elif dbus_per_hour < 2:
        base_util = 40.0
    elif dbus_per_hour < 4:
        base_util = 60.0
    else:
        base_util = min(80.0 + (dbus_per_hour - 4) * 2, 95.0)

    # Driver typically uses less resources (30%), workers more (70%)
    driver_percent = base_util * 0.85  # Driver slightly lower
    worker_percent = base_util

    return (round(driver_percent, 1), round(worker_percent, 1))


def _generate_recommendation(avg_utilization: float) -> str | None:
    """Generate right-sizing recommendation based on utilization.

    Args:
        avg_utilization: Average utilization percentage across metrics

    Returns:
        Recommendation text or None if not over-provisioned
    """
    if avg_utilization >= 40:
        return None

    if avg_utilization < 20:
        return "Consider reducing workers by 50% or using smaller node types"
    elif avg_utilization < 30:
        return "Consider reducing to fewer workers"
    else:
        return "Consider using smaller node types"


def _parse_utilization_result(result, job_id: str, runs: int) -> ClusterUtilization:
    """Parse SQL result into ClusterUtilization model.

    Expected columns:
    0: run_id
    1: run_duration_seconds
    2: total_dbus
    3: dbus_per_hour
    """
    if not result or not result.result or not result.result.data_array:
        return ClusterUtilization(
            job_id=job_id,
            driver_cpu_percent=None,
            driver_memory_percent=None,
            worker_cpu_percent=None,
            worker_memory_percent=None,
            is_over_provisioned=False,
            recommendation=None,
            runs_analyzed=0,
        )

    rows = result.result.data_array
    runs_analyzed = len(rows)

    if runs_analyzed == 0:
        return ClusterUtilization(
            job_id=job_id,
            driver_cpu_percent=None,
            driver_memory_percent=None,
            worker_cpu_percent=None,
            worker_memory_percent=None,
            is_over_provisioned=False,
            recommendation=None,
            runs_analyzed=0,
        )

    # Calculate average DBUs per hour across runs
    dbus_per_hour_list = []
    for row in rows:
        dbu_rate = float(row[3]) if row[3] is not None else None
        if dbu_rate is not None and dbu_rate > 0:
            dbus_per_hour_list.append(dbu_rate)

    if not dbus_per_hour_list:
        return ClusterUtilization(
            job_id=job_id,
            driver_cpu_percent=None,
            driver_memory_percent=None,
            worker_cpu_percent=None,
            worker_memory_percent=None,
            is_over_provisioned=False,
            recommendation=None,
            runs_analyzed=runs_analyzed,
        )

    avg_dbus_per_hour = sum(dbus_per_hour_list) / len(dbus_per_hour_list)

    # Calculate utilization estimates
    driver_percent, worker_percent = _calculate_utilization_from_dbus(avg_dbus_per_hour)

    # CPU and memory estimated as similar (no way to differentiate from billing data)
    driver_cpu = driver_percent
    driver_memory = driver_percent
    worker_cpu = worker_percent
    worker_memory = worker_percent

    # Calculate average utilization for over-provisioning check
    all_metrics = [m for m in [driver_cpu, driver_memory, worker_cpu, worker_memory] if m is not None]
    avg_utilization = sum(all_metrics) / len(all_metrics) if all_metrics else 0

    # Over-provisioned if ALL runs have <40% average utilization
    # Check if we have enough runs to make this determination
    is_over_provisioned = False
    recommendation = None

    if runs_analyzed >= runs and avg_utilization < 40:
        # Verify all runs show low utilization
        low_util_count = 0
        for row in rows:
            dbu_rate = float(row[3]) if row[3] is not None else None
            if dbu_rate is not None:
                _, worker_util = _calculate_utilization_from_dbus(dbu_rate)
                if worker_util is not None and worker_util < 40:
                    low_util_count += 1

        # Flag as over-provisioned only if sustained (all analyzed runs are low)
        if low_util_count == runs_analyzed:
            is_over_provisioned = True
            recommendation = _generate_recommendation(avg_utilization)

    return ClusterUtilization(
        job_id=job_id,
        driver_cpu_percent=driver_cpu,
        driver_memory_percent=driver_memory,
        worker_cpu_percent=worker_cpu,
        worker_memory_percent=worker_memory,
        is_over_provisioned=is_over_provisioned,
        recommendation=recommendation,
        runs_analyzed=runs_analyzed,
    )


@router.get("/{job_id}", response_model=ClusterUtilization)
async def get_cluster_utilization(
    job_id: str,
    runs: Annotated[
        int,
        Query(ge=1, le=10, description="Number of recent runs to analyze"),
    ] = 5,
    ws=Depends(get_ws),
) -> ClusterUtilization:
    """Get cluster utilization metrics for a job.

    Uses proxy calculation from billing data (DBU consumption) since direct
    CPU/memory metrics are not available in Databricks system tables.

    Over-provisioning is flagged when ALL of the last N runs show <40%
    average utilization, indicating sustained underutilization.

    Args:
        job_id: The job ID to get utilization for
        runs: Number of recent runs to analyze (default 5, max 10)
        ws: WorkspaceClient dependency

    Returns:
        ClusterUtilization with estimated metrics and recommendation
    """
    if not ws:
        raise HTTPException(
            status_code=503, detail="Databricks connection not available"
        )

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        raise HTTPException(status_code=503, detail="Warehouse ID not configured")

    # Query billing data for DBU consumption patterns across recent runs
    # Using proxy calculation: DBUs per hour normalized against typical rates
    query = f"""
    WITH job_runs AS (
        SELECT
            run_id,
            job_id,
            run_duration_seconds,
            period_start_time
        FROM system.lakeflow.job_run_timeline
        WHERE job_id = '{job_id}'
            AND period_start_time >= current_date() - INTERVAL 30 DAYS
            AND run_duration_seconds IS NOT NULL
            AND run_duration_seconds > 0
            AND result_state IS NOT NULL
        ORDER BY period_start_time DESC
        LIMIT {runs}
    ),
    billing AS (
        SELECT
            usage_metadata.job_id as job_id,
            usage_date,
            SUM(usage_quantity) as total_dbus
        FROM system.billing.usage
        WHERE usage_metadata.job_id = '{job_id}'
            AND usage_date >= current_date() - INTERVAL 30 DAYS
        GROUP BY usage_metadata.job_id, usage_date
        HAVING SUM(usage_quantity) != 0
    )
    SELECT
        jr.run_id,
        jr.run_duration_seconds,
        COALESCE(b.total_dbus, 0) as total_dbus,
        CASE
            WHEN jr.run_duration_seconds > 0 THEN
                COALESCE(b.total_dbus, 0) / (jr.run_duration_seconds / 3600.0)
            ELSE 0
        END as dbus_per_hour
    FROM job_runs jr
    LEFT JOIN billing b ON DATE(jr.period_start_time) = b.usage_date
    ORDER BY jr.period_start_time DESC
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="30s",
    )

    return _parse_utilization_result(result, job_id, runs)
