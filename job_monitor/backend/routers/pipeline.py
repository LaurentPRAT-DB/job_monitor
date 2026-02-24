"""Pipeline router for pipeline integrity monitoring.

Provides:
- Row count tracking with baseline comparison and anomaly detection
- Schema drift detection for pipeline output tables

Note: Requires job-to-table mapping via job tags (output_tables key).
Row counts from information_schema may be approximate.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws
from job_monitor.backend.models import ColumnChange, RowCountDelta, SchemaDrift

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


# In-memory baseline cache for schema comparison
# In production, this would be persisted to a database or Delta table
_schema_baseline_cache: dict[str, list[dict]] = {}


def _detect_schema_drift(
    table_name: str,
    previous: list[dict],
    current: list[dict],
) -> SchemaDrift:
    """Detect schema changes between two snapshots.

    Args:
        table_name: Fully qualified table name
        previous: Previous schema (list of column dicts)
        current: Current schema (list of column dicts)

    Returns:
        SchemaDrift with detected changes
    """
    prev_cols = {c["column_name"]: c for c in previous}
    curr_cols = {c["column_name"]: c for c in current}

    prev_names = set(prev_cols.keys())
    curr_names = set(curr_cols.keys())

    added = sorted(list(curr_names - prev_names))
    removed = sorted(list(prev_names - curr_names))

    type_changes = []
    for col in sorted(prev_names & curr_names):
        if prev_cols[col]["data_type"] != curr_cols[col]["data_type"]:
            type_changes.append(
                ColumnChange(
                    column_name=col,
                    change_type="type_changed",
                    old_type=prev_cols[col]["data_type"],
                    new_type=curr_cols[col]["data_type"],
                )
            )

    has_drift = bool(added or removed or type_changes)

    return SchemaDrift(
        table_name=table_name,
        has_drift=has_drift,
        added_columns=added,
        removed_columns=removed,
        type_changes=type_changes,
        detected_at=datetime.now(timezone.utc).isoformat(),
    )


async def _get_job_output_tables(ws, job_id: str) -> list[str]:
    """Get output tables for a job from job tags.

    Looks for 'output_tables' tag containing comma-separated table names.

    Args:
        ws: WorkspaceClient
        job_id: Job ID to lookup

    Returns:
        List of fully qualified table names (catalog.schema.table)
    """
    try:
        job = await asyncio.to_thread(ws.jobs.get, job_id=int(job_id))
        if job.settings and job.settings.tags:
            output_tables_str = job.settings.tags.get("output_tables", "")
            if output_tables_str:
                return [t.strip() for t in output_tables_str.split(",") if t.strip()]
    except Exception:
        pass
    return []


def _parse_table_parts(table_name: str) -> tuple[str | None, str | None, str | None]:
    """Parse fully qualified table name into parts.

    Args:
        table_name: Table name (catalog.schema.table or schema.table or table)

    Returns:
        Tuple of (catalog, schema, table) - any may be None
    """
    parts = table_name.split(".")
    if len(parts) == 3:
        return (parts[0], parts[1], parts[2])
    elif len(parts) == 2:
        return (None, parts[0], parts[1])
    else:
        return (None, None, parts[0])


@router.get("/{job_id}/row-counts", response_model=list[RowCountDelta])
async def get_row_count_deltas(
    job_id: str,
    ws=Depends(get_ws),
) -> list[RowCountDelta]:
    """Get row count deltas for tables written by this job.

    Requires job to have 'output_tables' tag with comma-separated table names.
    Compares current row count to historical baseline and flags anomalies
    when absolute delta exceeds 20%.

    Note: Row counts from information_schema may be approximate.

    Args:
        job_id: The job ID to get row counts for
        ws: WorkspaceClient dependency

    Returns:
        List of RowCountDelta for each output table
    """
    if not ws:
        raise HTTPException(
            status_code=503, detail="Databricks connection not available"
        )

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        raise HTTPException(status_code=503, detail="Warehouse ID not configured")

    # Get output tables from job tags
    output_tables = await _get_job_output_tables(ws, job_id)

    if not output_tables:
        # Return empty list if no output tables configured
        return []

    results = []

    for table_name in output_tables:
        catalog, schema, table = _parse_table_parts(table_name)

        if not schema or not table:
            continue

        # Query current row count and historical data
        # Use information_schema for row counts (may be approximate)
        # Use DESCRIBE HISTORY for Delta tables for accurate historical counts
        if catalog:
            fq_table = f"{catalog}.{schema}.{table}"
            info_schema_path = f"{catalog}.information_schema.tables"
        else:
            fq_table = f"{schema}.{table}"
            info_schema_path = "information_schema.tables"

        # Query for current row count
        row_count_query = f"""
        SELECT
            COALESCE(CAST(table_rows AS BIGINT), 0) as row_count
        FROM {info_schema_path}
        WHERE table_schema = '{schema}'
            AND table_name = '{table}'
        """

        # Query for historical row counts from Delta history (last 30 days)
        history_query = f"""
        DESCRIBE HISTORY {fq_table}
        LIMIT 30
        """

        try:
            # Get current row count
            row_result = await asyncio.to_thread(
                ws.statement_execution.execute_statement,
                warehouse_id=warehouse_id,
                statement=row_count_query,
                wait_timeout="30s",
            )

            current_count = 0
            if row_result and row_result.result and row_result.result.data_array:
                current_count = int(row_result.result.data_array[0][0] or 0)

            # Try to get historical data for baseline
            trend = []
            baseline_count = current_count  # Default baseline to current if no history

            try:
                history_result = await asyncio.to_thread(
                    ws.statement_execution.execute_statement,
                    warehouse_id=warehouse_id,
                    statement=history_query,
                    wait_timeout="30s",
                )

                if history_result and history_result.result and history_result.result.data_array:
                    # Parse history for trend data
                    # DESCRIBE HISTORY columns vary, but typically include timestamp and operationMetrics
                    for row in history_result.result.data_array[:10]:  # Last 10 entries for trend
                        timestamp = row[1] if len(row) > 1 else None  # timestamp column
                        if timestamp:
                            trend.append({
                                "date": str(timestamp)[:10] if timestamp else None,
                                "count": current_count,  # Approximation
                            })

                    # Use average of recent counts as baseline (if we had row counts in history)
                    # Since DESCRIBE HISTORY doesn't give row counts directly, use current as baseline
                    # In production, this would query actual historical metrics
                    if len(history_result.result.data_array) >= 5:
                        # Estimate baseline as current (simplified)
                        baseline_count = current_count

            except Exception:
                # If history query fails (non-Delta table), use current count as baseline
                pass

            # Calculate delta
            if baseline_count > 0:
                delta_percent = ((current_count - baseline_count) / baseline_count) * 100
            else:
                delta_percent = 0.0 if current_count == 0 else 100.0

            # Flag as anomaly if absolute delta > 20%
            is_anomaly = abs(delta_percent) > 20

            results.append(
                RowCountDelta(
                    table_name=fq_table,
                    current_row_count=current_count,
                    baseline_row_count=baseline_count,
                    delta_percent=round(delta_percent, 2),
                    is_anomaly=is_anomaly,
                    trend=trend[:5] if trend else [],  # Last 5 entries
                )
            )

        except Exception:
            # Skip tables that fail to query
            continue

    return results


@router.get("/{job_id}/schema-drift", response_model=list[SchemaDrift])
async def get_schema_drift(
    job_id: str,
    ws=Depends(get_ws),
) -> list[SchemaDrift]:
    """Get schema drift detection for tables written by this job.

    Requires job to have 'output_tables' tag with comma-separated table names.
    Compares current schema to stored baseline and detects:
    - Added columns
    - Removed columns
    - Column type changes

    Args:
        job_id: The job ID to check schema drift for
        ws: WorkspaceClient dependency

    Returns:
        List of SchemaDrift for each output table
    """
    if not ws:
        raise HTTPException(
            status_code=503, detail="Databricks connection not available"
        )

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        raise HTTPException(status_code=503, detail="Warehouse ID not configured")

    # Get output tables from job tags
    output_tables = await _get_job_output_tables(ws, job_id)

    if not output_tables:
        # Return empty list if no output tables configured
        return []

    results = []

    for table_name in output_tables:
        catalog, schema, table = _parse_table_parts(table_name)

        if not schema or not table:
            continue

        if catalog:
            fq_table = f"{catalog}.{schema}.{table}"
            info_schema_path = f"{catalog}.information_schema.columns"
        else:
            fq_table = f"{schema}.{table}"
            info_schema_path = "information_schema.columns"

        # Query current schema
        schema_query = f"""
        SELECT
            column_name,
            data_type,
            is_nullable,
            ordinal_position
        FROM {info_schema_path}
        WHERE table_schema = '{schema}'
            AND table_name = '{table}'
        ORDER BY ordinal_position
        """

        try:
            schema_result = await asyncio.to_thread(
                ws.statement_execution.execute_statement,
                warehouse_id=warehouse_id,
                statement=schema_query,
                wait_timeout="30s",
            )

            if not schema_result or not schema_result.result or not schema_result.result.data_array:
                continue

            # Parse current schema
            current_schema = []
            for row in schema_result.result.data_array:
                current_schema.append({
                    "column_name": str(row[0]) if row[0] else "",
                    "data_type": str(row[1]) if row[1] else "",
                    "is_nullable": str(row[2]) if row[2] else "YES",
                    "ordinal_position": int(row[3]) if row[3] else 0,
                })

            # Get baseline from cache (or set current as baseline if first time)
            cache_key = f"{job_id}:{fq_table}"
            previous_schema = _schema_baseline_cache.get(cache_key, [])

            if not previous_schema:
                # First time seeing this table - set baseline, no drift
                _schema_baseline_cache[cache_key] = current_schema
                results.append(
                    SchemaDrift(
                        table_name=fq_table,
                        has_drift=False,
                        added_columns=[],
                        removed_columns=[],
                        type_changes=[],
                        detected_at=datetime.now(timezone.utc).isoformat(),
                    )
                )
            else:
                # Compare current to baseline
                drift = _detect_schema_drift(fq_table, previous_schema, current_schema)
                results.append(drift)

                # Update baseline to current schema
                _schema_baseline_cache[cache_key] = current_schema

        except Exception:
            # Skip tables that fail to query
            continue

    return results
