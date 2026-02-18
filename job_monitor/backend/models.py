"""Pydantic models for Job Monitor API."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


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
