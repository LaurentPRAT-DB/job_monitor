"""Pydantic models for Job Monitor API."""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, computed_field


class UserInfo(BaseModel):
    """User information model."""

    email: str
    display_name: str | None = None


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
    """Active runs response model."""

    total_active: int
    runs: list[JobApiRunOut]


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
    """Wrapper for job health list response."""

    jobs: list[JobHealthOut]
    window_days: int  # 7 or 30
    total_count: int


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
