"""Reports configuration router for admin settings.

Provides:
- GET /api/reports/config: View report configuration (schedules, recipients)
- POST /api/reports/trigger/{report_type}: Manually trigger report generation
- GET /api/reports/scheduler/status: Check scheduler health
"""

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from job_monitor.backend.config import get_settings
from job_monitor.backend.scheduler import (
    generate_daily_health_report,
    generate_monthly_executive_report,
    generate_weekly_cost_report,
    scheduler,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])


class ReportConfig(BaseModel):
    """Configuration for a scheduled report."""

    report_type: str
    schedule: str
    recipients: list[str]
    last_run: datetime | None = None
    next_run: datetime | None = None


class ReportListOut(BaseModel):
    """List of all report configurations."""

    reports: list[ReportConfig]


class TriggerResponse(BaseModel):
    """Response from manual report trigger."""

    success: bool
    message: str


class SchedulerJobStatus(BaseModel):
    """Status of a single scheduler job."""

    id: str
    next_run: str | None = None


class SchedulerStatus(BaseModel):
    """Scheduler health status."""

    running: bool
    jobs: list[SchedulerJobStatus]


@router.get("/config", response_model=ReportListOut)
async def get_report_config() -> ReportListOut:
    """Get configuration for all scheduled reports.

    Returns schedule and recipient list for daily, weekly, and monthly reports.
    """
    settings = get_settings()

    reports = []

    # Daily health report
    daily_job = scheduler.get_job("daily_health_report")
    reports.append(
        ReportConfig(
            report_type="daily_health",
            schedule="Daily at 8:00 AM",
            recipients=[
                r.strip()
                for r in settings.daily_report_recipients.split(",")
                if r.strip()
            ],
            next_run=daily_job.next_run_time if daily_job else None,
        )
    )

    # Weekly cost report
    weekly_job = scheduler.get_job("weekly_cost_report")
    reports.append(
        ReportConfig(
            report_type="weekly_cost",
            schedule="Weekly on Monday at 8:00 AM",
            recipients=[
                r.strip()
                for r in settings.weekly_report_recipients.split(",")
                if r.strip()
            ],
            next_run=weekly_job.next_run_time if weekly_job else None,
        )
    )

    # Monthly executive report
    monthly_job = scheduler.get_job("monthly_executive_report")
    reports.append(
        ReportConfig(
            report_type="monthly_executive",
            schedule="Monthly on 1st at 8:00 AM",
            recipients=[
                r.strip()
                for r in settings.monthly_report_recipients.split(",")
                if r.strip()
            ],
            next_run=monthly_job.next_run_time if monthly_job else None,
        )
    )

    return ReportListOut(reports=reports)


@router.post("/trigger/{report_type}", response_model=TriggerResponse)
async def trigger_report(report_type: str) -> TriggerResponse:
    """Manually trigger a report generation (for testing).

    Valid report types:
    - daily_health: Daily health summary
    - weekly_cost: Weekly cost report
    - monthly_executive: Monthly executive report

    Args:
        report_type: Type of report to trigger

    Returns:
        Success status and message
    """
    try:
        if report_type == "daily_health":
            await generate_daily_health_report()
        elif report_type == "weekly_cost":
            await generate_weekly_cost_report()
        elif report_type == "monthly_executive":
            await generate_monthly_executive_report()
        else:
            raise HTTPException(
                status_code=400, detail=f"Unknown report type: {report_type}"
            )

        return TriggerResponse(
            success=True, message=f"Report {report_type} triggered successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trigger report {report_type}: {e}")
        return TriggerResponse(success=False, message=str(e))


@router.get("/scheduler/status", response_model=SchedulerStatus)
async def get_scheduler_status() -> SchedulerStatus:
    """Get scheduler health status.

    Returns whether scheduler is running and details of scheduled jobs.
    """
    return SchedulerStatus(
        running=scheduler.running,
        jobs=[
            SchedulerJobStatus(
                id=job.id,
                next_run=str(job.next_run_time) if job.next_run_time else None,
            )
            for job in scheduler.get_jobs()
        ],
    )
