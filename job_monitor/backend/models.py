"""Pydantic models for Job Monitor API."""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, computed_field


class UserInfo(BaseModel):
    """User information model."""

    email: str
    display_name: str | None = None
    workspace_host: str | None = None
    workspace_name: str | None = None
    workspace_id: str | None = None  # Numeric workspace ID for filtering system tables


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    version: str
    user: str | None = None


# Job status enum matching Databricks job run result states
class JobStatus(str, Enum):
    """Job run result states from Databricks."""

    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    RUNNING = "RUNNING"
    PENDING = "PENDING"
    CANCELED = "CANCELED"
    SKIPPED = "SKIPPED"


class JobRunListOut(BaseModel):
    """Job run information from system.lakeflow.job_run_timeline."""

    run_id: str
    job_id: str
    period_start_time: datetime
    period_end_time: datetime | None = None
    run_duration_seconds: int | None = None
    result_state: str | None = None


class JobOut(BaseModel):
    """Job metadata from system.lakeflow.jobs (latest version via SCD2)."""

    job_id: str
    name: str
    creator_user_name: str | None = None
    run_as_user_name: str | None = None
    schedule: str | None = None


# Jobs API models for real-time data (not from system tables)


class JobApiOut(BaseModel):
    """Job information from Jobs API (real-time)."""

    job_id: int
    name: str
    creator_user_name: str | None = None
    created_time: datetime | None = None
    settings_format: str | None = None  # SINGLE_TASK, MULTI_TASK


class JobApiRunOut(BaseModel):
    """Job run information from Jobs API (real-time)."""

    run_id: int
    job_id: int
    run_name: str | None = None
    state: str  # PENDING, RUNNING, TERMINATED, etc.
    result_state: str | None = None  # SUCCESS, FAILED, etc.
    start_time: datetime | None = None
    end_time: datetime | None = None
    run_page_url: str | None = None


class ActiveRunsOut(BaseModel):
    """Active runs response model with pagination support."""

    total_active: int
    runs: list[JobApiRunOut]
    # Pagination fields
    page: int = 1
    page_size: int = 50
    has_more: bool = False


class RecentRunStatus(BaseModel):
    """Minimal run status for recent runs display (like Databricks UI)."""

    run_id: int
    result_state: str | None = None  # SUCCESS, FAILED, CANCELED, SKIPPED, None (running)


class ActiveRunWithHistory(BaseModel):
    """Active run enriched with recent run history for main list view."""

    run_id: int
    job_id: int
    run_name: str | None = None
    state: str  # PENDING, RUNNING, TERMINATED, etc.
    result_state: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    run_page_url: str | None = None
    recent_runs: list[RecentRunStatus]  # Last 5 completed runs for this job
    is_streaming: bool = False  # True if streaming/continuous job
    is_long_running: bool = False  # True if duration > 4h (or unusual)


class ActiveRunsWithHistoryOut(BaseModel):
    """Active runs with recent run history response model."""

    total_active: int
    runs: list[ActiveRunWithHistory]


# Billing models for system.billing.usage


class BillingUsageOut(BaseModel):
    """Billing usage from system.billing.usage with RETRACTION handling.

    Note: usage_metadata.job_id is NULL for all-purpose compute clusters.
    Only job compute and serverless workloads have job_id populated.
    """

    usage_date: str  # DATE type from SQL as string YYYY-MM-DD
    job_id: str | None = None
    cluster_id: str | None = None
    sku_name: str
    total_dbus: float


class BillingByJobOut(BaseModel):
    """Aggregated billing by job_id."""

    job_id: str
    sku_name: str
    total_dbus: float
    usage_days: int  # Number of days this job had usage


# Job Health models for Phase 2


class JobHealthOut(BaseModel):
    """Job health summary for dashboard.

    Status is computed from success_rate using thresholds:
    - green: >= 90%
    - yellow: 70-89%
    - red: < 70%
    """

    job_id: str
    job_name: str
    total_runs: int
    success_count: int
    success_rate: float  # Percentage 0-100
    last_run_time: datetime
    last_duration_seconds: int | None = None
    priority: Literal["P1", "P2", "P3"] | None = None
    retry_count: int = 0

    @computed_field
    @property
    def status(self) -> Literal["green", "yellow", "red"]:
        """Compute status from success_rate thresholds."""
        if self.success_rate >= 90:
            return "green"
        elif self.success_rate >= 70:
            return "yellow"
        else:
            return "red"


class JobHealthListOut(BaseModel):
    """Wrapper for job health list response with pagination support."""

    jobs: list[JobHealthOut]
    window_days: int  # 7 or 30
    total_count: int
    # Pagination fields (optional for backward compatibility)
    page: int = 1
    page_size: int = 50
    has_more: bool = False
    from_cache: bool = False  # True if served from cache table
    # Priority counts for summary stats (computed from full dataset)
    p1_count: int = 0
    p2_count: int = 0
    p3_count: int = 0
    healthy_count: int = 0


class JobHealthSummaryOut(BaseModel):
    """Lightweight summary of job health counts without full job list.

    Used for fast dashboard loading - returns only aggregate counts,
    not individual job details. Much faster than full health-metrics query.
    """

    total_count: int
    p1_count: int  # Critical - consecutive failures
    p2_count: int  # Warning - single failure
    p3_count: int  # Info - yellow zone (70-89% success)
    healthy_count: int  # Healthy - 90%+ success
    window_days: int  # 7 or 30
    from_cache: bool = False
    avg_success_rate: float = 0.0  # Average success rate across all jobs


# Duration and expanded details models for job row expansion


class DurationStatsOut(BaseModel):
    """Duration statistics for a job over a time period.

    Used to show duration trends and identify anomalies.
    """

    job_id: str
    median_duration_seconds: float | None = None  # None if insufficient data
    p90_duration_seconds: float | None = None
    avg_duration_seconds: float | None = None
    max_duration_seconds: float | None = None
    run_count: int
    baseline_30d_median: float | None = None  # 30-day median baseline for comparison
    has_sufficient_data: bool  # True if run_count >= 5


class JobRunDetailOut(BaseModel):
    """Detailed job run information for expanded view.

    Includes anomaly flag for duration comparison.
    """

    run_id: str
    job_id: str
    start_time: datetime
    end_time: datetime | None = None
    duration_seconds: int | None = None
    result_state: str | None = None
    is_anomaly: bool  # True if duration > 2x baseline


class JobExpandedOut(BaseModel):
    """Expanded job details shown when row is clicked.

    Combines recent runs, duration stats, and failure information.
    """

    job_id: str
    job_name: str
    recent_runs: list[JobRunDetailOut]  # Last 10 runs
    duration_stats: DurationStatsOut
    retry_count_7d: int  # Retry count in last 7 days
    failure_reasons: list[str]  # Distinct error messages from failed runs


# SLA and Tag models for Phase 3


class TagUpdateRequest(BaseModel):
    """Request to update job tags."""

    sla_minutes: int | None = None
    team: str | None = None
    owner: str | None = None


class TagUpdateResponse(BaseModel):
    """Response with updated tags."""

    job_id: str
    tags: dict[str, str]


class JobTagsOut(BaseModel):
    """Job tags including SLA and team attribution."""

    job_id: str
    sla_minutes: int | None = None
    suggested_p90_minutes: int | None = None
    team: str | None = None
    owner: str | None = None
    has_sla: bool = False
    has_team: bool = False


# Cost models for Phase 3


class CostBySkuOut(BaseModel):
    """Cost breakdown by SKU category."""

    sku_category: str
    total_dbus: float
    percentage: float


class JobCostOut(BaseModel):
    """Cost summary for a job."""

    job_id: str
    job_name: str
    team: str | None = None
    total_dbus_30d: float
    total_cost_dollars: float | None = None
    cost_by_sku: list[CostBySkuOut]
    trend_7d_percent: float
    is_anomaly: bool = False
    baseline_p90_dbus: float | None = None


class TeamCostOut(BaseModel):
    """Cost rollup by team."""

    team: str
    total_dbus_30d: float
    total_cost_dollars: float | None = None
    job_count: int
    trend_7d_percent: float


class CostAnomalyOut(BaseModel):
    """Cost anomaly for anomalies tab."""

    job_id: str
    job_name: str
    team: str | None = None
    anomaly_type: Literal["cost_spike", "zombie"]
    reason: str
    current_dbus: float
    baseline_p90_dbus: float | None = None
    multiplier: float | None = None
    job_settings_url: str


class CostSummaryOut(BaseModel):
    """Complete cost summary response with pagination for jobs."""

    jobs: list[JobCostOut]
    teams: list[TeamCostOut]
    anomalies: list[CostAnomalyOut]
    total_dbus_30d: float  # Field name matches frontend expectation
    total_cost_dollars: float | None = None
    dbu_rate: float
    # Pagination fields for jobs list
    total_jobs_count: int = 0
    page: int = 1
    page_size: int = 50
    has_more: bool = False


# Cluster Utilization models for Phase 4


class ClusterUtilization(BaseModel):
    """Cluster utilization metrics for a job.

    Uses proxy calculation from billing data when direct metrics unavailable.
    Inverted traffic light: Green = high utilization (efficient), Red = low (<40%).
    """

    job_id: str
    driver_cpu_percent: float | None = None
    driver_memory_percent: float | None = None
    worker_cpu_percent: float | None = None
    worker_memory_percent: float | None = None
    is_over_provisioned: bool
    recommendation: str | None = None
    runs_analyzed: int


# Pipeline Integrity models for Phase 4


class RowCountDelta(BaseModel):
    """Row count delta for pipeline integrity monitoring.

    Flags anomaly if absolute delta exceeds 20% threshold.
    """

    table_name: str
    current_row_count: int
    baseline_row_count: int
    delta_percent: float
    is_anomaly: bool  # True if abs(delta_percent) > 20
    trend: list[dict]  # Recent history: [{date, count}]


class ColumnChange(BaseModel):
    """Column change for schema drift detection."""

    column_name: str
    change_type: Literal["added", "removed", "type_changed"]
    old_type: str | None = None
    new_type: str | None = None


class SchemaDrift(BaseModel):
    """Schema drift detection for pipeline integrity.

    Compares current schema to baseline and detects changes.
    """

    table_name: str
    has_drift: bool
    added_columns: list[str]
    removed_columns: list[str]
    type_changes: list[ColumnChange]
    detected_at: str  # ISO timestamp


# Alert models for Phase 5


class AlertSeverity(str, Enum):
    """Alert severity levels.

    - P1: Critical - requires immediate attention (2+ consecutive failures, SLA breach)
    - P2: Warning - requires attention soon (single failure, SLA risk, budget exceeded)
    - P3: Info - optimization opportunity (yellow zone, over-provisioned clusters)
    """

    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class AlertCategory(str, Enum):
    """Alert categories based on monitoring domain."""

    FAILURE = "failure"
    SLA = "sla"
    COST = "cost"
    CLUSTER = "cluster"


class Alert(BaseModel):
    """Dynamic alert generated from monitoring data.

    Alerts are generated on-demand from current system state,
    not persisted. Acknowledgment state stored separately.
    """

    id: str  # Composite: {category}_{job_id}_{type}
    job_id: str
    job_name: str
    category: AlertCategory
    severity: AlertSeverity
    title: str  # Short summary like "2 consecutive failures"
    description: str  # Context like "Job failed at 10:30 AM, 10:15 AM"
    remediation: str  # Actionable suggestion
    created_at: datetime
    acknowledged: bool = False
    acknowledged_at: datetime | None = None
    condition_key: str  # Unique key for deduplication


class AlertListOut(BaseModel):
    """Response wrapper for alert list.

    Includes summary counts by severity for dashboard display.
    Supports pagination for large alert lists.
    """

    alerts: list[Alert]
    total: int
    by_severity: dict[str, int]  # {"P1": 2, "P2": 5, "P3": 10}
    # Pagination fields
    page: int = 1
    page_size: int = 50
    has_more: bool = False
