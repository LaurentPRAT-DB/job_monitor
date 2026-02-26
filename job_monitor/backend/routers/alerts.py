"""Alerts router for dynamic alert generation from monitoring data.

Provides:
- GET /api/alerts: Generate alerts from current system state
- POST /api/alerts/{alert_id}/acknowledge: Mark alert as acknowledged

Alerts are generated dynamically by combining data from:
- Health metrics (failure alerts)
- Jobs API (SLA breach risk for running jobs)
- Cost data (cost spikes, budget threshold alerts)
- Cluster metrics (over-provisioning alerts)

Supports cache-first loading for fast response times.
"""

import asyncio
import logging
import traceback
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

logger = logging.getLogger(__name__)

from job_monitor.backend.cache import query_alerts_cache
from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws_prefer_user
from job_monitor.backend.mock_data import get_mock_alerts, is_mock_mode
from job_monitor.backend.models import (
    Alert,
    AlertCategory,
    AlertListOut,
    AlertSeverity,
)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# In-memory acknowledgment store with 24-hour TTL
_acknowledged: dict[str, datetime] = {}  # condition_key -> acknowledged_at


def _is_acknowledged(condition_key: str) -> tuple[bool, datetime | None]:
    """Check if alert condition was acknowledged within 24-hour TTL.

    Returns:
        Tuple of (is_acknowledged, acknowledged_at timestamp or None)
    """
    if condition_key not in _acknowledged:
        return (False, None)

    ack_time = _acknowledged[condition_key]
    if datetime.now() - ack_time > timedelta(hours=24):
        # TTL expired, remove from store
        del _acknowledged[condition_key]
        return (False, None)

    return (True, ack_time)


def _generate_failure_remediation(failure_reasons: list[str]) -> str:
    """Generate context-aware remediation for failure alerts."""
    if not failure_reasons:
        return "Review recent run logs for error details. Check for resource constraints or data quality issues."

    reasons_lower = [r.lower() for r in failure_reasons]

    # Check for OOM patterns
    if any("memory" in r or "oom" in r or "heap" in r for r in reasons_lower):
        return "Memory issue detected. Consider increasing cluster size, enabling autoscaling, or optimizing data processing (partitioning, caching)."

    # Check for timeout patterns
    if any("timeout" in r or "timed out" in r for r in reasons_lower):
        return "Timeout detected. Review job duration trends, consider increasing timeout limits, or optimize slow operations."

    # Check for data quality patterns
    if any("null" in r or "schema" in r or "type" in r for r in reasons_lower):
        return "Data quality issue detected. Validate input data schemas, add null handling, and implement data quality checks."

    # Check for permission/auth issues
    if any("permission" in r or "access" in r or "denied" in r for r in reasons_lower):
        return "Permission issue detected. Review service principal permissions and IAM roles."

    # Generic remediation with failure context
    return f"Recent failures: {', '.join(failure_reasons[:3])}. Review run logs and check for infrastructure or data issues."


def _generate_sla_remediation(elapsed_pct: float, sla_minutes: int) -> str:
    """Generate SLA breach risk remediation."""
    remaining_minutes = int(sla_minutes * (100 - elapsed_pct) / 100)

    if elapsed_pct >= 100:
        return f"SLA breached. Job exceeded {sla_minutes} minute target. Review job history for duration trends and consider SLA adjustment or performance optimization."

    return f"~{remaining_minutes} minutes remaining before SLA breach ({sla_minutes} min target). Monitor actively or prepare fallback."


def _generate_cost_remediation(anomaly_type: str, multiplier: float | None, baseline: float | None) -> str:
    """Generate cost anomaly remediation."""
    if anomaly_type == "budget_exceeded":
        return "Monthly budget exceeded. Review recent job runs for unexpected usage. Consider cost allocation review with team."

    if anomaly_type == "budget_approaching":
        return "Approaching monthly budget limit. Monitor usage closely and consider adjusting job frequency or resource allocation."

    if multiplier and baseline:
        return f"Cost is {multiplier:.1f}x higher than p90 baseline ({baseline:.1f} DBUs). Check for increased data volume, cluster misconfiguration, or inefficient operations."

    return "Cost anomaly detected. Review job resource usage and recent changes."


def _generate_cluster_remediation(utilization: float, runs_analyzed: int) -> str:
    """Generate cluster over-provisioning remediation."""
    if utilization < 20:
        reduction = "50%"
    elif utilization < 30:
        reduction = "30-40%"
    else:
        reduction = "20-30%"

    return f"Cluster running at ~{utilization:.0f}% utilization across {runs_analyzed} recent runs. Consider reducing workers by {reduction} or using smaller node types."


async def _generate_failure_alerts(ws, warehouse_id: str) -> list[Alert] | None:
    """Generate alerts from health metrics (failures, yellow zone).

    Returns None if permission error detected (signals to use mock data).
    """
    alerts = []
    logger.info("[alerts._generate_failure_alerts] Starting")

    # Query job health for 7-day window
    query = """
    WITH run_stats AS (
        SELECT
            job_id,
            COUNT(*) as total_runs,
            COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) as success_count,
            MAX(period_start_time) as last_run_time
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
        GROUP BY job_id
    ),
    consecutive_check AS (
        SELECT
            job_id,
            result_state,
            LAG(result_state) OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as prev_state,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as rn
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
    ),
    failure_reasons AS (
        SELECT job_id, COLLECT_SET(termination_code) as reasons
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
          AND result_state = 'FAILED'
          AND termination_code IS NOT NULL
        GROUP BY job_id
    ),
    job_names AS (
        SELECT job_id, name,
            ROW_NUMBER() OVER(PARTITION BY workspace_id, job_id ORDER BY change_time DESC) as rn
        FROM system.lakeflow.jobs
        WHERE delete_time IS NULL
    )
    SELECT
        rs.job_id,
        COALESCE(jn.name, CONCAT('job-', rs.job_id)) as job_name,
        rs.total_runs,
        rs.success_count,
        ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1) as success_rate,
        rs.last_run_time,
        cc.result_state as last_result,
        cc.prev_state as prev_result,
        fr.reasons as failure_reasons
    FROM run_stats rs
    LEFT JOIN job_names jn ON rs.job_id = jn.job_id AND jn.rn = 1
    LEFT JOIN consecutive_check cc ON rs.job_id = cc.job_id AND cc.rn = 1
    LEFT JOIN failure_reasons fr ON rs.job_id = fr.job_id
    WHERE cc.result_state = 'FAILED'
       OR ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1) BETWEEN 70 AND 89.9
    """

    try:
        logger.info(f"[alerts._generate_failure_alerts] Executing SQL on warehouse {warehouse_id}")
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=query,
            wait_timeout="50s",
        )
        logger.info(f"[alerts._generate_failure_alerts] SQL completed, status: {result.status.state if result and result.status else 'None'}")
        if result and result.status and result.status.error:
            error_msg = str(result.status.error)
            logger.error(f"[alerts._generate_failure_alerts] SQL error: {error_msg}")
            # Check for permission errors - return special marker
            if "INSUFFICIENT_PERMISSIONS" in error_msg or "USE SCHEMA" in error_msg:
                logger.warning("[alerts._generate_failure_alerts] Permission denied - will use mock data")
                return None  # Signal to use mock data

        if result and result.result and result.result.data_array:
            logger.info(f"[alerts._generate_failure_alerts] Found {len(result.result.data_array)} failure rows")
            for row in result.result.data_array:
                job_id = str(row[0]) if row[0] else ""
                job_name = str(row[1]) if row[1] else f"job-{job_id}"
                success_rate = float(row[4]) if row[4] is not None else 100.0
                last_run_time = row[5]
                last_result = row[6]
                prev_result = row[7]
                failure_reasons = row[8] if row[8] else []

                # Determine severity and type
                if last_result == "FAILED" and prev_result == "FAILED":
                    # P1: 2+ consecutive failures
                    severity = AlertSeverity.P1
                    title = "2+ consecutive failures"
                    description = f"Job has failed {2}+ times in a row. Most recent failure at {last_run_time}."
                    condition_key = f"failure_{job_id}_consecutive"
                elif last_result == "FAILED":
                    # P2: Single failure
                    severity = AlertSeverity.P2
                    title = "Recent failure"
                    description = f"Job failed at {last_run_time}. Success rate: {success_rate}%."
                    condition_key = f"failure_{job_id}_single"
                else:
                    # P3: Yellow zone (70-89%)
                    severity = AlertSeverity.P3
                    title = f"Success rate at {success_rate}%"
                    description = f"Job is in yellow zone (70-89% success rate). May need attention."
                    condition_key = f"failure_{job_id}_yellow"

                # Check acknowledgment
                is_ack, ack_time = _is_acknowledged(condition_key)

                alerts.append(Alert(
                    id=f"failure_{job_id}_{severity.value.lower()}",
                    job_id=job_id,
                    job_name=job_name,
                    category=AlertCategory.FAILURE,
                    severity=severity,
                    title=title,
                    description=description,
                    remediation=_generate_failure_remediation(failure_reasons if isinstance(failure_reasons, list) else []),
                    created_at=datetime.now(),
                    acknowledged=is_ack,
                    acknowledged_at=ack_time,
                    condition_key=condition_key,
                ))
        else:
            logger.info("[alerts._generate_failure_alerts] No failure rows found")
    except Exception as e:
        # Log error but don't fail entire alerts endpoint
        logger.error(f"[alerts._generate_failure_alerts] Exception: {e}")
        logger.error(f"[alerts._generate_failure_alerts] Traceback: {traceback.format_exc()}")

    logger.info(f"[alerts._generate_failure_alerts] Returning {len(alerts)} alerts")
    return alerts


async def _generate_sla_alerts(ws) -> list[Alert]:
    """Generate SLA breach risk alerts for running jobs."""
    alerts = []
    sla_tag_key = settings.sla_tag_key

    try:
        # Get active runs via Jobs API
        runs = await asyncio.to_thread(lambda: list(ws.jobs.list_runs(active_only=True)))

        for run in runs:
            if not run.start_time:
                continue

            # Get job settings to check for SLA tag
            try:
                job = await asyncio.to_thread(ws.jobs.get, job_id=run.job_id)
                if not job.settings or not job.settings.tags:
                    continue

                sla_minutes_str = job.settings.tags.get(sla_tag_key)
                if not sla_minutes_str:
                    continue

                sla_minutes = int(sla_minutes_str)
                sla_seconds = sla_minutes * 60

                # Calculate elapsed time
                start_time = datetime.fromtimestamp(run.start_time / 1000)
                elapsed_seconds = (datetime.now() - start_time).total_seconds()
                elapsed_pct = (elapsed_seconds / sla_seconds) * 100

                job_name = job.settings.name if job.settings else f"job-{run.job_id}"
                job_id = str(run.job_id)

                if elapsed_pct >= 100:
                    # P1: SLA breach
                    severity = AlertSeverity.P1
                    title = f"SLA breached ({sla_minutes}m target)"
                    description = f"Job has been running for {int(elapsed_seconds / 60)} minutes, exceeding {sla_minutes} minute SLA."
                    condition_key = f"sla_{job_id}_breach"
                elif elapsed_pct >= 80:
                    # P2: SLA breach risk
                    severity = AlertSeverity.P2
                    title = f"SLA breach risk ({int(elapsed_pct)}% of window)"
                    remaining = int((sla_seconds - elapsed_seconds) / 60)
                    description = f"Job at {int(elapsed_pct)}% of SLA window ({sla_minutes}m). ~{remaining} minutes remaining."
                    condition_key = f"sla_{job_id}_risk"
                else:
                    continue  # Not alerting yet

                is_ack, ack_time = _is_acknowledged(condition_key)

                alerts.append(Alert(
                    id=f"sla_{job_id}_{severity.value.lower()}",
                    job_id=job_id,
                    job_name=job_name,
                    category=AlertCategory.SLA,
                    severity=severity,
                    title=title,
                    description=description,
                    remediation=_generate_sla_remediation(elapsed_pct, sla_minutes),
                    created_at=datetime.now(),
                    acknowledged=is_ack,
                    acknowledged_at=ack_time,
                    condition_key=condition_key,
                ))

            except Exception:
                continue

    except Exception:
        pass

    return alerts


async def _generate_cost_alerts(ws, warehouse_id: str) -> list[Alert]:
    """Generate cost spike and budget threshold alerts."""
    alerts = []
    budget_tag_key = settings.budget_tag_key
    team_tag_key = settings.team_tag_key

    # Query for cost spikes (>2x p90 baseline)
    spike_query = """
    WITH job_costs AS (
        SELECT
            usage_metadata.job_id as job_id,
            SUM(usage_quantity) as total_dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL 7 DAYS
          AND usage_metadata.job_id IS NOT NULL
        GROUP BY usage_metadata.job_id
        HAVING SUM(usage_quantity) > 0
    ),
    job_p90 AS (
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
              AND usage_metadata.job_id IS NOT NULL
            GROUP BY usage_metadata.job_id, usage_date
            HAVING SUM(usage_quantity) > 0
        )
        GROUP BY job_id
        HAVING COUNT(*) >= 5
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
        jp.p90_dbus,
        jc.total_dbus / NULLIF(jp.p90_dbus, 0) as multiplier
    FROM job_costs jc
    JOIN job_p90 jp ON jc.job_id = jp.job_id
    LEFT JOIN job_names jn ON jc.job_id = jn.job_id AND jn.rn = 1
    WHERE jc.total_dbus > (jp.p90_dbus * 2)
    ORDER BY multiplier DESC
    LIMIT 50
    """

    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=spike_query,
            wait_timeout="50s",
        )

        if result and result.result and result.result.data_array:
            for row in result.result.data_array:
                job_id = str(row[0]) if row[0] else ""
                job_name = str(row[1]) if row[1] else f"job-{job_id}"
                total_dbus = float(row[2]) if row[2] else 0
                p90_dbus = float(row[3]) if row[3] else 0
                multiplier = float(row[4]) if row[4] else 0

                condition_key = f"cost_{job_id}_spike"
                is_ack, ack_time = _is_acknowledged(condition_key)

                alerts.append(Alert(
                    id=f"cost_{job_id}_spike",
                    job_id=job_id,
                    job_name=job_name,
                    category=AlertCategory.COST,
                    severity=AlertSeverity.P2,
                    title=f"Cost spike ({multiplier:.1f}x baseline)",
                    description=f"Current 7-day cost ({total_dbus:.1f} DBUs) is {multiplier:.1f}x higher than p90 baseline ({p90_dbus:.1f} DBUs).",
                    remediation=_generate_cost_remediation("spike", multiplier, p90_dbus),
                    created_at=datetime.now(),
                    acknowledged=is_ack,
                    acknowledged_at=ack_time,
                    condition_key=condition_key,
                ))
    except Exception:
        pass

    # Check budget thresholds for jobs with budget tags
    try:
        # Get jobs with budget tags
        jobs_with_budget = []
        jobs = await asyncio.to_thread(lambda: list(ws.jobs.list(limit=100)))

        for job in jobs:
            if job.settings and job.settings.tags:
                budget_str = job.settings.tags.get(budget_tag_key)
                if budget_str:
                    try:
                        budget = float(budget_str)
                        jobs_with_budget.append((str(job.job_id), job.settings.name or f"job-{job.job_id}", budget))
                    except ValueError:
                        pass

        if jobs_with_budget:
            # Query current month usage for these jobs
            job_ids = [j[0] for j in jobs_with_budget]
            job_id_list = ",".join([f"'{jid}'" for jid in job_ids])

            budget_query = f"""
            SELECT
                usage_metadata.job_id as job_id,
                SUM(usage_quantity) as month_dbus
            FROM system.billing.usage
            WHERE usage_date >= date_trunc('MONTH', current_date())
              AND usage_metadata.job_id IN ({job_id_list})
            GROUP BY usage_metadata.job_id
            HAVING SUM(usage_quantity) > 0
            """

            result = await asyncio.to_thread(
                ws.statement_execution.execute_statement,
                warehouse_id=warehouse_id,
                statement=budget_query,
                wait_timeout="50s",
            )

            if result and result.result and result.result.data_array:
                usage_map = {str(row[0]): float(row[1]) for row in result.result.data_array if row[0]}

                for job_id, job_name, budget in jobs_with_budget:
                    month_usage = usage_map.get(job_id, 0)
                    usage_pct = (month_usage / budget) * 100 if budget > 0 else 0

                    if usage_pct >= 100:
                        # P1: Budget exceeded
                        severity = AlertSeverity.P1
                        title = f"Budget exceeded ({usage_pct:.0f}%)"
                        description = f"Monthly usage ({month_usage:.1f} DBUs) exceeds budget ({budget:.1f} DBUs)."
                        condition_key = f"cost_{job_id}_budget_exceeded"
                        anomaly_type = "budget_exceeded"
                    elif usage_pct >= 80:
                        # P2: Approaching budget
                        severity = AlertSeverity.P2
                        title = f"Approaching budget ({usage_pct:.0f}%)"
                        description = f"Monthly usage ({month_usage:.1f} DBUs) at {usage_pct:.0f}% of budget ({budget:.1f} DBUs)."
                        condition_key = f"cost_{job_id}_budget_approaching"
                        anomaly_type = "budget_approaching"
                    else:
                        continue

                    is_ack, ack_time = _is_acknowledged(condition_key)

                    alerts.append(Alert(
                        id=f"cost_{job_id}_budget",
                        job_id=job_id,
                        job_name=job_name,
                        category=AlertCategory.COST,
                        severity=severity,
                        title=title,
                        description=description,
                        remediation=_generate_cost_remediation(anomaly_type, None, None),
                        created_at=datetime.now(),
                        acknowledged=is_ack,
                        acknowledged_at=ack_time,
                        condition_key=condition_key,
                    ))

    except Exception:
        pass

    return alerts


async def _generate_cluster_alerts(ws, warehouse_id: str) -> list[Alert]:
    """Generate over-provisioning alerts from cluster metrics."""
    alerts = []

    # Query for over-provisioned jobs (low utilization across all recent runs)
    # Note: run_duration_seconds can be 0 for serverless jobs, so we calculate
    # effective duration from timestamps as fallback
    query = """
    WITH job_runs_raw AS (
        SELECT
            job_id,
            run_id,
            CASE
                WHEN run_duration_seconds IS NULL OR run_duration_seconds = 0
                THEN TIMESTAMPDIFF(SECOND, period_start_time, period_end_time)
                ELSE run_duration_seconds
            END as run_duration_seconds,
            period_start_time
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 30 DAYS
            AND period_end_time IS NOT NULL
            AND result_state IS NOT NULL
    ),
    job_runs AS (
        SELECT * FROM job_runs_raw WHERE run_duration_seconds > 0
    ),
    billing AS (
        SELECT
            usage_metadata.job_id as job_id,
            usage_date,
            SUM(usage_quantity) as total_dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL 30 DAYS
          AND usage_metadata.job_id IS NOT NULL
        GROUP BY usage_metadata.job_id, usage_date
        HAVING SUM(usage_quantity) > 0
    ),
    job_utilization AS (
        SELECT
            jr.job_id,
            AVG(
                CASE
                    WHEN jr.run_duration_seconds > 0 THEN
                        COALESCE(b.total_dbus, 0) / (jr.run_duration_seconds / 3600.0)
                    ELSE 0
                END
            ) as avg_dbus_per_hour,
            COUNT(DISTINCT jr.run_id) as runs_analyzed
        FROM job_runs jr
        LEFT JOIN billing b ON jr.job_id = b.job_id AND DATE(jr.period_start_time) = b.usage_date
        GROUP BY jr.job_id
        HAVING COUNT(DISTINCT jr.run_id) >= 3
    ),
    job_names AS (
        SELECT job_id, name,
            ROW_NUMBER() OVER(PARTITION BY workspace_id, job_id ORDER BY change_time DESC) as rn
        FROM system.lakeflow.jobs
        WHERE delete_time IS NULL
    )
    SELECT
        ju.job_id,
        COALESCE(jn.name, CONCAT('job-', ju.job_id)) as job_name,
        ju.avg_dbus_per_hour,
        ju.runs_analyzed
    FROM job_utilization ju
    LEFT JOIN job_names jn ON ju.job_id = jn.job_id AND jn.rn = 1
    WHERE ju.avg_dbus_per_hour < 1.0
    ORDER BY ju.avg_dbus_per_hour ASC
    LIMIT 50
    """

    try:
        result = await asyncio.to_thread(
            ws.statement_execution.execute_statement,
            warehouse_id=warehouse_id,
            statement=query,
            wait_timeout="50s",
        )

        if result and result.result and result.result.data_array:
            for row in result.result.data_array:
                job_id = str(row[0]) if row[0] else ""
                job_name = str(row[1]) if row[1] else f"job-{job_id}"
                avg_dbus_per_hour = float(row[2]) if row[2] else 0
                runs_analyzed = int(row[3]) if row[3] else 0

                # Map DBU/hour to utilization (same heuristic as cluster_metrics)
                if avg_dbus_per_hour < 1:
                    utilization = 20.0
                elif avg_dbus_per_hour < 2:
                    utilization = 40.0
                else:
                    continue  # Not over-provisioned

                condition_key = f"cluster_{job_id}_overprov"
                is_ack, ack_time = _is_acknowledged(condition_key)

                alerts.append(Alert(
                    id=f"cluster_{job_id}_overprov",
                    job_id=job_id,
                    job_name=job_name,
                    category=AlertCategory.CLUSTER,
                    severity=AlertSeverity.P3,
                    title=f"Over-provisioned (~{utilization:.0f}% utilization)",
                    description=f"Cluster running at ~{utilization:.0f}% utilization across {runs_analyzed} recent runs. Resources may be underutilized.",
                    remediation=_generate_cluster_remediation(utilization, runs_analyzed),
                    created_at=datetime.now(),
                    acknowledged=is_ack,
                    acknowledged_at=ack_time,
                    condition_key=condition_key,
                ))

    except Exception:
        pass

    return alerts


def _deduplicate_alerts(alerts: list[Alert]) -> list[Alert]:
    """Deduplicate alerts by condition_key, keeping higher severity."""
    seen: dict[str, Alert] = {}
    severity_order = {"P1": 0, "P2": 1, "P3": 2}

    for alert in alerts:
        key = alert.condition_key
        if key not in seen:
            seen[key] = alert
        else:
            # Keep higher severity (lower number)
            existing_priority = severity_order.get(seen[key].severity.value, 99)
            new_priority = severity_order.get(alert.severity.value, 99)
            if new_priority < existing_priority:
                seen[key] = alert

    return list(seen.values())


def _sort_alerts(alerts: list[Alert]) -> list[Alert]:
    """Sort alerts by severity (P1 first, then P2, then P3)."""
    severity_order = {"P1": 0, "P2": 1, "P3": 2}
    return sorted(alerts, key=lambda a: severity_order.get(a.severity.value, 99))


@router.get("", response_model=AlertListOut)
async def get_alerts(
    severity: Annotated[
        list[str] | None,
        Query(description="Filter by severity (P1, P2, P3)"),
    ] = None,
    category: Annotated[
        list[str] | None,
        Query(description="Filter by category (failure, sla, cost, cluster)"),
    ] = None,
    acknowledged: Annotated[
        bool | None,
        Query(description="Filter by acknowledged status"),
    ] = None,
    ws=Depends(get_ws_prefer_user),
) -> AlertListOut:
    """Get alerts generated from current system state.

    Alerts are generated dynamically by analyzing:
    - Health metrics (failure patterns, consecutive failures)
    - Running jobs (SLA breach risk)
    - Cost data (anomalies, budget thresholds)
    - Cluster metrics (over-provisioning)

    Supports cache-first loading and mock data fallback.

    Args:
        severity: Filter by P1, P2, P3 (optional)
        category: Filter by failure, sla, cost, cluster (optional)
        acknowledged: Filter by acknowledgment status (optional)
        ws: WorkspaceClient dependency

    Returns:
        AlertListOut with alerts sorted by severity and counts by severity
    """
    # Check for mock data mode
    if is_mock_mode():
        logger.info("Mock mode enabled - returning mock alerts")
        return get_mock_alerts()

    if not ws:
        logger.warning("WorkspaceClient not available - falling back to mock alerts")
        return get_mock_alerts()

    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        logger.warning("Warehouse ID not configured - falling back to mock alerts")
        return get_mock_alerts()

    # Try cache first for fast response
    if settings.use_cache:
        logger.info("[CACHE] Attempting cache lookup for alerts")
        cached_alerts = await query_alerts_cache(ws)
        if cached_alerts:
            logger.info(f"[CACHE_HIT] alerts: returning {len(cached_alerts)} alerts from cache")
            all_alerts = []
            for row in cached_alerts:
                # Check acknowledgment status
                condition_key = row["alert_id"]
                is_ack, ack_time = _is_acknowledged(condition_key)

                # Map category string to enum
                cat_map = {
                    "failure": AlertCategory.FAILURE,
                    "sla": AlertCategory.SLA,
                    "cost": AlertCategory.COST,
                    "cluster": AlertCategory.CLUSTER,
                }
                sev_map = {
                    "P1": AlertSeverity.P1,
                    "P2": AlertSeverity.P2,
                    "P3": AlertSeverity.P3,
                }

                all_alerts.append(Alert(
                    id=row["alert_id"],
                    job_id=row["job_id"],
                    job_name=row["job_name"],
                    category=cat_map.get(row["category"], AlertCategory.FAILURE),
                    severity=sev_map.get(row["severity"], AlertSeverity.P3),
                    title=row["title"],
                    description=row["description"],
                    remediation=_generate_failure_remediation(
                        row["failure_reasons"].split(",") if row["failure_reasons"] else []
                    ) if row["category"] == "failure" else _generate_cost_remediation(
                        "spike", row["cost_multiplier"], row["baseline_p90_dbus"]
                    ) if row["category"] == "cost" else "Review job configuration.",
                    created_at=datetime.now(),
                    acknowledged=is_ack,
                    acknowledged_at=ack_time,
                    condition_key=condition_key,
                ))

            # Apply filters and return
            if severity:
                severity_set = {s.upper() for s in severity}
                all_alerts = [a for a in all_alerts if a.severity.value in severity_set]
            if category:
                category_set = {c.lower() for c in category}
                all_alerts = [a for a in all_alerts if a.category.value in category_set]
            if acknowledged is not None:
                all_alerts = [a for a in all_alerts if a.acknowledged == acknowledged]

            all_alerts = _sort_alerts(all_alerts)
            by_severity = {"P1": 0, "P2": 0, "P3": 0}
            for alert in all_alerts:
                by_severity[alert.severity.value] = by_severity.get(alert.severity.value, 0) + 1

            return AlertListOut(alerts=all_alerts, total=len(all_alerts), by_severity=by_severity)

        logger.info("[CACHE_MISS] alerts: falling back to live query")

    # Determine which alert categories to generate
    # If category filter is specified, only run those queries (major perf optimization)
    requested_categories = {c.lower() for c in category} if category else {"failure", "sla", "cost", "cluster"}
    logger.info(f"[alerts] Generating alerts for categories: {requested_categories}")

    # Build list of coroutines to run based on requested categories
    tasks = []
    task_names = []
    if "failure" in requested_categories:
        tasks.append(_generate_failure_alerts(ws, warehouse_id))
        task_names.append("failure")
    if "sla" in requested_categories:
        tasks.append(_generate_sla_alerts(ws))
        task_names.append("sla")
    if "cost" in requested_categories:
        tasks.append(_generate_cost_alerts(ws, warehouse_id))
        task_names.append("cost")
    if "cluster" in requested_categories:
        tasks.append(_generate_cluster_alerts(ws, warehouse_id))
        task_names.append("cluster")

    # Generate alerts from selected sources in parallel
    # Add timeout to prevent gateway timeout (504) - fall back to mock data if too slow
    try:
        results = await asyncio.wait_for(
            asyncio.gather(*tasks),
            timeout=45.0,  # 45 second timeout to avoid 504
        )
    except asyncio.TimeoutError:
        logger.warning("[TIMEOUT] alerts: live query timed out after 45s, falling back to mock data")
        return get_mock_alerts()

    # Check if any generator returned None (permission error) - fall back to mock data
    if any(r is None for r in results):
        logger.warning("Permission error detected in alert generation - falling back to mock alerts")
        return get_mock_alerts()

    # Combine all results
    all_alerts = []
    for result in results:
        all_alerts.extend(result)
    all_alerts = _deduplicate_alerts(all_alerts)

    # Apply severity filter
    if severity:
        severity_set = {s.upper() for s in severity}
        all_alerts = [a for a in all_alerts if a.severity.value in severity_set]

    # Category filter already applied by selective query execution

    if acknowledged is not None:
        all_alerts = [a for a in all_alerts if a.acknowledged == acknowledged]

    # Sort by severity
    all_alerts = _sort_alerts(all_alerts)

    # Calculate by_severity counts
    by_severity = {"P1": 0, "P2": 0, "P3": 0}
    for alert in all_alerts:
        by_severity[alert.severity.value] = by_severity.get(alert.severity.value, 0) + 1

    return AlertListOut(
        alerts=all_alerts,
        total=len(all_alerts),
        by_severity=by_severity,
    )


@router.post("/{alert_id}/acknowledge", response_model=Alert)
async def acknowledge_alert(
    alert_id: str,
    ws=Depends(get_ws_prefer_user),
) -> Alert:
    """Acknowledge an alert to suppress it for 24 hours.

    Acknowledgment is stored in memory with 24-hour TTL.
    After TTL expires, alert will reappear if condition persists.

    Args:
        alert_id: The alert ID to acknowledge
        ws: WorkspaceClient dependency

    Returns:
        Updated Alert with acknowledged=True
    """
    if not ws:
        raise HTTPException(
            status_code=503, detail="Databricks connection not available"
        )

    # Extract condition_key from alert_id (format: {category}_{job_id}_{type})
    # We need to find the alert to get its condition_key
    warehouse_id = settings.warehouse_id
    if not warehouse_id:
        raise HTTPException(status_code=503, detail="Warehouse ID not configured")

    # Get all alerts to find the one with matching ID
    alerts_response = await get_alerts(ws=ws)

    matching_alert = None
    for alert in alerts_response.alerts:
        if alert.id == alert_id:
            matching_alert = alert
            break

    if not matching_alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

    # Store acknowledgment
    now = datetime.now()
    _acknowledged[matching_alert.condition_key] = now

    # Return updated alert
    return Alert(
        id=matching_alert.id,
        job_id=matching_alert.job_id,
        job_name=matching_alert.job_name,
        category=matching_alert.category,
        severity=matching_alert.severity,
        title=matching_alert.title,
        description=matching_alert.description,
        remediation=matching_alert.remediation,
        created_at=matching_alert.created_at,
        acknowledged=True,
        acknowledged_at=now,
        condition_key=matching_alert.condition_key,
    )
