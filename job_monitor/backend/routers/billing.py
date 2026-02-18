"""Billing router for system.billing.usage queries.

This router provides billing and cost data from Unity Catalog system tables.
IMPORTANT: The queries use HAVING SUM(usage_quantity) != 0 to handle RETRACTION
records. Databricks billing system uses negative quantities for corrections,
and this pattern ensures fully retracted items are excluded.
"""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws
from job_monitor.backend.models import BillingByJobOut, BillingUsageOut

router = APIRouter(prefix="/api", tags=["billing"])


def _parse_billing_usage(result) -> list[BillingUsageOut]:
    """Parse statement execution result into BillingUsageOut models."""
    if not result or not result.result or not result.result.data_array:
        return []

    usage_records = []
    for row in result.result.data_array:
        usage_records.append(
            BillingUsageOut(
                usage_date=str(row[0]),  # Convert DATE to string
                job_id=str(row[1]) if row[1] else None,
                cluster_id=str(row[2]) if row[2] else None,
                sku_name=str(row[3]),
                total_dbus=float(row[4]) if row[4] else 0.0,
            )
        )
    return usage_records


def _parse_billing_by_job(result) -> list[BillingByJobOut]:
    """Parse statement execution result into BillingByJobOut models."""
    if not result or not result.result or not result.result.data_array:
        return []

    records = []
    for row in result.result.data_array:
        records.append(
            BillingByJobOut(
                job_id=str(row[0]),
                sku_name=str(row[1]),
                total_dbus=float(row[2]) if row[2] else 0.0,
                usage_days=int(row[3]) if row[3] else 0,
            )
        )
    return records


@router.get("/billing/usage", response_model=list[BillingUsageOut])
async def list_billing_usage(
    days: Annotated[
        int, Query(ge=1, le=365, description="Number of days to look back")
    ] = 30,
    ws=Depends(get_ws),
) -> list[BillingUsageOut]:
    """List billing usage from system.billing.usage with RETRACTION handling.

    Queries the billing usage system table for usage records within the specified
    time window. Uses HAVING SUM != 0 pattern to properly handle RETRACTION records
    (negative quantities used for billing corrections).

    NOTE: usage_metadata.job_id is NULL for all-purpose compute clusters.
    Only job compute (JOBS_COMPUTE) and serverless workloads have job_id populated.

    Args:
        days: Number of days to look back (1-365, default 30)
        ws: WorkspaceClient dependency

    Returns:
        List of billing usage records aggregated by date, job, cluster, and SKU
    """
    if not ws:
        return []

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        return []

    # RETRACTION handling: HAVING SUM(usage_quantity) != 0
    # This excludes fully retracted billing items
    query = f"""
    SELECT
        usage_date,
        usage_metadata.job_id as job_id,
        usage_metadata.cluster_id as cluster_id,
        sku_name,
        SUM(usage_quantity) AS total_dbus
    FROM system.billing.usage
    WHERE usage_date >= current_date() - INTERVAL {days} DAYS
    GROUP BY usage_date, usage_metadata.job_id, usage_metadata.cluster_id, sku_name
    HAVING SUM(usage_quantity) != 0
    ORDER BY usage_date DESC, total_dbus DESC
    LIMIT 1000
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="30s",
    )

    return _parse_billing_usage(result)


@router.get("/billing/by-job", response_model=list[BillingByJobOut])
async def list_billing_by_job(
    days: Annotated[
        int, Query(ge=1, le=365, description="Number of days to look back")
    ] = 30,
    ws=Depends(get_ws),
) -> list[BillingByJobOut]:
    """Aggregate billing by job_id from system.billing.usage.

    Returns total DBU consumption per job over the specified time period.
    Only includes records where job_id is not NULL (excludes all-purpose compute).

    Uses HAVING SUM != 0 pattern for RETRACTION handling.

    Args:
        days: Number of days to look back (1-365, default 30)
        ws: WorkspaceClient dependency

    Returns:
        List of billing records aggregated by job_id
    """
    if not ws:
        return []

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        return []

    # Aggregate by job_id, exclude NULL job_ids (all-purpose compute)
    # Count distinct days to show usage_days
    query = f"""
    SELECT
        usage_metadata.job_id as job_id,
        sku_name,
        SUM(usage_quantity) AS total_dbus,
        COUNT(DISTINCT usage_date) AS usage_days
    FROM system.billing.usage
    WHERE usage_date >= current_date() - INTERVAL {days} DAYS
      AND usage_metadata.job_id IS NOT NULL
    GROUP BY usage_metadata.job_id, sku_name
    HAVING SUM(usage_quantity) != 0
    ORDER BY total_dbus DESC
    LIMIT 1000
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="30s",
    )

    return _parse_billing_by_job(result)


# Export router with alias for consistency
api = router
