"""Mock data for demo/development when system tables aren't accessible.

Mock data is controlled by:
1. config.yaml mock_data.enabled setting (default: false)
2. USE_MOCK_DATA environment variable (overrides config)

Auto-fallback (mock_data.auto_fallback) allows the app to use mock data
when system table queries fail due to permissions, while showing real data
when available.
"""

import os
import random
from datetime import datetime, timedelta
from typing import Literal

from job_monitor.backend.models import (
    Alert,
    AlertCategory,
    AlertListOut,
    AlertSeverity,
    ClusterUtilization,
    CostAnomalyOut,
    CostBySkuOut,
    CostSummaryOut,
    DurationStatsOut,
    JobCostOut,
    JobExpandedOut,
    JobHealthListOut,
    JobHealthOut,
    JobRunDetailOut,
    TeamCostOut,
)


def is_mock_mode() -> bool:
    """Check if mock data mode is explicitly enabled.

    Priority:
    1. USE_MOCK_DATA environment variable (if set)
    2. config.yaml mock_data.enabled setting (default: false)
    """
    env_value = os.environ.get("USE_MOCK_DATA", "").lower()
    if env_value:
        return env_value in ("true", "1", "yes")

    # Import config here to avoid circular imports
    from job_monitor.backend.config import settings
    return settings.use_mock_data


def is_auto_fallback_enabled() -> bool:
    """Check if auto-fallback to mock data is enabled for permission errors."""
    from job_monitor.backend.config import settings
    return settings.mock_auto_fallback


# Sample job names for realistic demo data
SAMPLE_JOBS = [
    ("job_001", "ETL - Customer Data Ingestion"),
    ("job_002", "ML - Daily Model Training"),
    ("job_003", "Analytics - Revenue Dashboard"),
    ("job_004", "ETL - Product Catalog Sync"),
    ("job_005", "Report - Weekly Sales Summary"),
    ("job_006", "ML - Feature Engineering Pipeline"),
    ("job_007", "ETL - Clickstream Processing"),
    ("job_008", "Analytics - User Behavior Analysis"),
    ("job_009", "Report - Compliance Audit"),
    ("job_010", "ETL - Inventory Updates"),
]

TEAMS = ["data-platform", "ml-team", "analytics", "reporting"]


def get_mock_health_metrics(days: int = 7) -> JobHealthListOut:
    """Generate mock job health metrics."""
    now = datetime.now()
    jobs = []

    for job_id, job_name in SAMPLE_JOBS:
        # Generate varied success rates for interesting demo
        base_rate = random.uniform(60, 100)
        total_runs = random.randint(5, 30) if days == 7 else random.randint(20, 100)
        success_count = int(total_runs * base_rate / 100)
        success_rate = round(100 * success_count / total_runs, 1)

        # Assign priority based on success rate
        priority: Literal["P1", "P2", "P3"] | None = None
        if success_rate < 70:
            priority = "P1" if random.random() > 0.5 else "P2"
        elif success_rate < 90:
            priority = "P3" if random.random() > 0.3 else None

        jobs.append(
            JobHealthOut(
                job_id=job_id,
                job_name=job_name,
                total_runs=total_runs,
                success_count=success_count,
                success_rate=success_rate,
                last_run_time=now - timedelta(minutes=random.randint(5, 120)),
                last_duration_seconds=random.randint(60, 3600),
                priority=priority,
                retry_count=random.randint(0, 5),
            )
        )

    # Sort by priority (P1 first)
    priority_order = {"P1": 0, "P2": 1, "P3": 2, None: 3}
    jobs.sort(key=lambda j: (priority_order.get(j.priority, 3), j.success_rate))

    return JobHealthListOut(
        jobs=jobs,
        window_days=days,
        total_count=len(jobs),
    )


def get_mock_job_details(job_id: str) -> JobExpandedOut:
    """Generate mock expanded job details."""
    now = datetime.now()
    job_name = next(
        (name for jid, name in SAMPLE_JOBS if jid == job_id),
        f"Job {job_id}",
    )

    # Generate mock recent runs
    recent_runs = []
    baseline_median = random.randint(300, 1800)

    for i in range(10):
        duration = random.randint(200, 2500)
        is_anomaly = duration > 2 * baseline_median
        result_state = random.choice(["SUCCESS", "SUCCESS", "SUCCESS", "FAILED"])

        recent_runs.append(
            JobRunDetailOut(
                run_id=f"run_{job_id}_{i}",
                job_id=job_id,
                start_time=now - timedelta(hours=i * 4),
                end_time=now - timedelta(hours=i * 4) + timedelta(seconds=duration),
                duration_seconds=duration,
                result_state=result_state,
                is_anomaly=is_anomaly,
            )
        )

    duration_stats = DurationStatsOut(
        job_id=job_id,
        median_duration_seconds=float(baseline_median),
        p90_duration_seconds=float(baseline_median * 1.5),
        avg_duration_seconds=float(baseline_median * 1.1),
        max_duration_seconds=float(baseline_median * 2.2),
        run_count=len(recent_runs),
        baseline_30d_median=float(baseline_median),
        has_sufficient_data=True,
    )

    return JobExpandedOut(
        job_id=job_id,
        job_name=job_name,
        recent_runs=recent_runs,
        duration_stats=duration_stats,
        retry_count_7d=random.randint(0, 3),
        failure_reasons=["DRIVER_OUT_OF_MEMORY", "USER_EXCEPTION"][:random.randint(0, 2)],
    )


def get_mock_duration_stats(job_id: str) -> DurationStatsOut:
    """Generate mock duration statistics."""
    baseline_median = random.randint(300, 1800)

    return DurationStatsOut(
        job_id=job_id,
        median_duration_seconds=float(baseline_median),
        p90_duration_seconds=float(baseline_median * 1.5),
        avg_duration_seconds=float(baseline_median * 1.1),
        max_duration_seconds=float(baseline_median * 2.2),
        run_count=random.randint(10, 50),
        baseline_30d_median=float(baseline_median),
        has_sufficient_data=True,
    )


def get_mock_cost_summary() -> CostSummaryOut:
    """Generate mock cost summary."""
    jobs = []
    team_dbus: dict[str, float] = {}

    for job_id, job_name in SAMPLE_JOBS:
        team = random.choice(TEAMS)
        total_dbus = round(random.uniform(50, 500), 2)
        trend = round(random.uniform(-30, 50), 1)

        jobs.append(
            JobCostOut(
                job_id=job_id,
                job_name=job_name,
                team=team,
                total_dbus_30d=total_dbus,
                total_cost_dollars=round(total_dbus * 0.07, 2),
                cost_by_sku=[
                    CostBySkuOut(
                        sku_category="Jobs Compute",
                        total_dbus=round(total_dbus * 0.7, 2),
                        percentage=70.0,
                    ),
                    CostBySkuOut(
                        sku_category="SQL Warehouse",
                        total_dbus=round(total_dbus * 0.3, 2),
                        percentage=30.0,
                    ),
                ],
                trend_7d_percent=trend,
                is_anomaly=trend > 30,
                baseline_p90_dbus=round(total_dbus * 0.8, 2),
            )
        )

        team_dbus[team] = team_dbus.get(team, 0) + total_dbus

    teams = [
        TeamCostOut(
            team=team,
            total_dbus_30d=round(dbus, 2),
            total_cost_dollars=round(dbus * 0.07, 2),
            job_count=sum(1 for j in jobs if j.team == team),
            trend_7d_percent=round(random.uniform(-10, 20), 1),
        )
        for team, dbus in team_dbus.items()
    ]

    total_dbus = sum(j.total_dbus_30d for j in jobs)

    # Add some anomalies
    anomalies = [
        CostAnomalyOut(
            job_id="job_002",
            job_name="ML - Daily Model Training",
            team="ml-team",
            anomaly_type="cost_spike",
            reason="DBU usage 2.5x above baseline",
            current_dbus=450.0,
            baseline_p90_dbus=180.0,
            multiplier=2.5,
            job_settings_url="#",
        ),
    ]

    return CostSummaryOut(
        jobs=jobs,
        teams=teams,
        anomalies=anomalies,
        total_dbus=round(total_dbus, 2),
        total_cost_dollars=round(total_dbus * 0.07, 2),
        dbu_rate=0.07,
    )


def get_mock_alerts() -> AlertListOut:
    """Generate mock alerts."""
    now = datetime.now()
    alerts = []

    # P1 - Consecutive failures
    alerts.append(
        Alert(
            id="failure_job_002_consecutive",
            job_id="job_002",
            job_name="ML - Daily Model Training",
            category=AlertCategory.FAILURE,
            severity=AlertSeverity.P1,
            title="2 consecutive failures",
            description="Job failed at 10:30 AM and 10:15 AM with DRIVER_OUT_OF_MEMORY",
            remediation="Consider increasing driver memory or optimizing data processing",
            created_at=now - timedelta(hours=1),
            acknowledged=False,
            condition_key="failure_job_002_consecutive",
        )
    )

    # P2 - SLA at risk
    alerts.append(
        Alert(
            id="sla_job_003_atrisk",
            job_id="job_003",
            job_name="Analytics - Revenue Dashboard",
            category=AlertCategory.SLA,
            severity=AlertSeverity.P2,
            title="SLA at risk",
            description="Last run took 45 min, SLA target is 30 min",
            remediation="Review job performance, consider cluster sizing",
            created_at=now - timedelta(hours=2),
            acknowledged=False,
            condition_key="sla_job_003_atrisk",
        )
    )

    # P3 - Cost spike
    alerts.append(
        Alert(
            id="cost_job_007_spike",
            job_id="job_007",
            job_name="ETL - Clickstream Processing",
            category=AlertCategory.COST,
            severity=AlertSeverity.P3,
            title="Cost spike detected",
            description="DBU usage 2.3x above 30-day baseline",
            remediation="Review recent code changes, check for data volume increase",
            created_at=now - timedelta(hours=3),
            acknowledged=True,
            acknowledged_at=now - timedelta(hours=1),
            condition_key="cost_job_007_spike",
        )
    )

    by_severity = {
        "P1": sum(1 for a in alerts if a.severity == AlertSeverity.P1 and not a.acknowledged),
        "P2": sum(1 for a in alerts if a.severity == AlertSeverity.P2 and not a.acknowledged),
        "P3": sum(1 for a in alerts if a.severity == AlertSeverity.P3 and not a.acknowledged),
    }

    return AlertListOut(
        alerts=alerts,
        total=len(alerts),
        by_severity=by_severity,
    )


def get_mock_cluster_utilization(job_id: str, runs: int = 5) -> ClusterUtilization:
    """Generate mock cluster utilization metrics.

    Generates realistic utilization data with varied efficiency levels:
    - Some jobs are efficient (60%+ utilization)
    - Some are fairly utilized (40-60%)
    - Some are over-provisioned (<40%)
    """
    # Seed based on job_id for consistent results per job
    seed = hash(job_id) % 1000
    random.seed(seed)

    # Determine utilization tier for this job
    tier = seed % 3  # 0=efficient, 1=fair, 2=over-provisioned

    if tier == 0:
        # Efficient: 60-85% utilization
        base = random.uniform(60, 85)
    elif tier == 1:
        # Fair: 40-60% utilization
        base = random.uniform(40, 60)
    else:
        # Over-provisioned: 15-40% utilization
        base = random.uniform(15, 40)

    # Add some variation between CPU/memory and driver/worker
    driver_cpu = round(base * random.uniform(0.85, 0.95), 1)
    driver_memory = round(base * random.uniform(0.80, 0.92), 1)
    worker_cpu = round(base * random.uniform(0.95, 1.05), 1)
    worker_memory = round(base * random.uniform(0.90, 1.0), 1)

    # Calculate average for over-provisioning detection
    avg_util = (driver_cpu + driver_memory + worker_cpu + worker_memory) / 4
    is_over_provisioned = avg_util < 40

    recommendation = None
    if is_over_provisioned:
        if avg_util < 20:
            recommendation = "Consider reducing workers by 50% or using smaller node types"
        elif avg_util < 30:
            recommendation = "Consider reducing to fewer workers"
        else:
            recommendation = "Consider using smaller node types"

    # Reset random seed
    random.seed()

    return ClusterUtilization(
        job_id=job_id,
        driver_cpu_percent=driver_cpu,
        driver_memory_percent=driver_memory,
        worker_cpu_percent=worker_cpu,
        worker_memory_percent=worker_memory,
        is_over_provisioned=is_over_provisioned,
        recommendation=recommendation,
        runs_analyzed=runs,
    )
