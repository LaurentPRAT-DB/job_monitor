"""Scheduled email reports using APScheduler.

Provides:
- Daily health summary (8am daily)
- Weekly cost report (Monday 8am)
- Monthly executive report (1st of month 8am)

Reports are generated from existing API endpoints and sent via SMTP.
"""

import logging
from datetime import datetime, timedelta
from pathlib import Path

import emails
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

# Initialize scheduler
scheduler = AsyncIOScheduler()

# Initialize Jinja2 environment
template_dir = Path(__file__).parent / "templates"
jinja_env = Environment(
    loader=FileSystemLoader(template_dir),
    autoescape=select_autoescape(["html", "xml"]),
)


async def send_email(
    template_name: str, context: dict, recipients: list[str], subject: str
) -> bool:
    """Render template and send email via SMTP."""
    from job_monitor.backend.config import get_settings

    settings = get_settings()

    if not settings.smtp_host or not recipients:
        logger.warning(
            f"Email not sent: SMTP not configured or no recipients for {template_name}"
        )
        return False

    try:
        template = jinja_env.get_template(template_name)
        html_content = template.render(**context)

        message = emails.Message(
            subject=subject,
            html=html_content,
            mail_from=settings.email_from,
        )

        for recipient in recipients:
            response = message.send(
                to=recipient.strip(),
                smtp={
                    "host": settings.smtp_host,
                    "port": settings.smtp_port,
                    "user": settings.smtp_user,
                    "password": settings.smtp_password,
                    "tls": True,
                },
            )
            if response.status_code != 250:
                logger.error(f"Failed to send email to {recipient}: {response.status_code}")

        logger.info(f"Email sent: {subject} to {len(recipients)} recipients")
        return True

    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False


async def generate_daily_health_report():
    """Generate and send daily health summary at 8am."""
    from job_monitor.backend.config import get_settings
    from job_monitor.backend.core import get_ws

    logger.info("Generating daily health report...")
    settings = get_settings()

    recipients = [
        r.strip() for r in settings.daily_report_recipients.split(",") if r.strip()
    ]
    if not recipients:
        logger.info("No recipients configured for daily report, skipping")
        return

    try:
        # Import FastAPI app to access state
        from job_monitor.backend.app import app

        # Create a mock request to get ws from app state
        class MockRequest:
            def __init__(self, app):
                self.app = app

        mock_request = MockRequest(app)
        ws = get_ws(mock_request)

        if not ws:
            logger.warning("WorkspaceClient not available, skipping daily report")
            return

        # Import router functions to get data
        from job_monitor.backend.routers.alerts import get_alerts
        from job_monitor.backend.routers.health_metrics import get_health_metrics

        # Get health metrics for last 7 days
        health = await get_health_metrics(days=7, ws=ws)

        # Get current alerts
        alerts_response = await get_alerts(ws=ws)

        # Separate alerts by severity
        p1_alerts = [
            a
            for a in alerts_response.alerts
            if a.severity.value == "P1" and not a.acknowledged
        ]
        p2_alerts = [
            a
            for a in alerts_response.alerts
            if a.severity.value == "P2" and not a.acknowledged
        ]

        # Calculate summary stats
        all_jobs = health.jobs
        healthy = len([j for j in all_jobs if j.status == "green"])
        warning = len([j for j in all_jobs if j.status == "yellow"])
        critical = len([j for j in all_jobs if j.status == "red"])

        total_success_rate = (
            sum(j.success_rate for j in all_jobs) / len(all_jobs) if all_jobs else 0
        )

        context = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "total_jobs": len(all_jobs),
            "healthy_count": healthy,
            "warning_count": warning,
            "critical_count": critical,
            "overall_success_rate": round(total_success_rate, 1),
            "p1_alerts": [
                {"job_name": a.job_name, "title": a.title, "remediation": a.remediation}
                for a in p1_alerts
            ],
            "p2_alerts": [
                {"job_name": a.job_name, "title": a.title, "remediation": a.remediation}
                for a in p2_alerts
            ],
            "all_jobs": [
                {
                    "job_name": j.job_name,
                    "status": j.status,
                    "success_rate": round(j.success_rate, 1),
                    "last_run": j.last_run_time.strftime("%Y-%m-%d %H:%M") if j.last_run_time else None,
                }
                for j in all_jobs
            ],
            "app_url": settings.app_url,
        }

        await send_email(
            template_name="daily_health.html",
            context=context,
            recipients=recipients,
            subject=f'Daily Health Summary - {context["date"]}',
        )

    except Exception as e:
        logger.error(f"Failed to generate daily health report: {e}")


async def generate_weekly_cost_report():
    """Generate and send weekly cost report on Monday at 8am."""
    from job_monitor.backend.config import get_settings
    from job_monitor.backend.core import get_ws

    logger.info("Generating weekly cost report...")
    settings = get_settings()

    recipients = [
        r.strip() for r in settings.weekly_report_recipients.split(",") if r.strip()
    ]
    if not recipients:
        logger.info("No recipients configured for weekly report, skipping")
        return

    try:
        # Import FastAPI app to access state
        from job_monitor.backend.app import app

        class MockRequest:
            def __init__(self, app):
                self.app = app

        mock_request = MockRequest(app)
        ws = get_ws(mock_request)

        if not ws:
            logger.warning("WorkspaceClient not available, skipping weekly report")
            return

        # Import router functions
        from job_monitor.backend.routers.cost import get_cost_anomalies, get_cost_summary

        # Get cost data for last 7 days
        cost_summary = await get_cost_summary(days=7, ws=ws)
        anomalies = await get_cost_anomalies(days=7, ws=ws)

        week_start = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        week_end = datetime.now().strftime("%Y-%m-%d")

        # Calculate totals
        total_dbus = sum(t.total_dbus_30d for t in cost_summary.teams)

        # Build cost spikes from anomalies
        cost_spikes = []
        zombie_jobs = []
        for a in anomalies:
            if a.anomaly_type == "cost_spike" and a.baseline_p90_dbus:
                cost_spikes.append(
                    {
                        "job_name": a.job_name,
                        "current_dbus": a.current_dbus,
                        "baseline_dbus": a.baseline_p90_dbus,
                        "spike_factor": (
                            a.current_dbus / a.baseline_p90_dbus
                            if a.baseline_p90_dbus
                            else 0
                        ),
                        "recommendation": "Review job configuration and data volumes",
                    }
                )
            elif a.anomaly_type == "zombie":
                zombie_jobs.append(
                    {
                        "job_name": a.job_name,
                        "total_dbus": a.current_dbus,
                        "rows_processed": 0,  # Not available from anomaly data
                    }
                )

        context = {
            "week_start": week_start,
            "week_end": week_end,
            "total_dbus": total_dbus,
            "dbu_rate": cost_summary.dbu_rate,
            "change_percent": 0,  # Would need previous week data
            "cost_spikes": cost_spikes,
            "zombie_jobs": zombie_jobs,
            "teams": [
                {
                    "name": t.team,
                    "total_dbus": t.total_dbus_30d,
                    "percent_of_total": (
                        (t.total_dbus_30d / total_dbus * 100) if total_dbus else 0
                    ),
                    "change": t.trend_7d_percent,
                }
                for t in cost_summary.teams
            ],
            "top_jobs": [
                {
                    "job_name": j.job_name,
                    "team": j.team or "Untagged",
                    "total_dbus": j.total_dbus_30d,
                    "run_count": 0,  # Not available from summary
                }
                for j in sorted(
                    cost_summary.jobs, key=lambda x: x.total_dbus_30d, reverse=True
                )[:10]
            ],
        }

        await send_email(
            template_name="weekly_cost.html",
            context=context,
            recipients=recipients,
            subject=f"Weekly Cost Report - Week of {week_start}",
        )

    except Exception as e:
        logger.error(f"Failed to generate weekly cost report: {e}")


async def generate_monthly_executive_report():
    """Generate and send monthly executive report on 1st at 8am."""
    from job_monitor.backend.config import get_settings
    from job_monitor.backend.core import get_ws

    logger.info("Generating monthly executive report...")
    settings = get_settings()

    recipients = [
        r.strip() for r in settings.monthly_report_recipients.split(",") if r.strip()
    ]
    if not recipients:
        logger.info("No recipients configured for monthly report, skipping")
        return

    try:
        # Import FastAPI app to access state
        from job_monitor.backend.app import app

        class MockRequest:
            def __init__(self, app):
                self.app = app

        mock_request = MockRequest(app)
        ws = get_ws(mock_request)

        if not ws:
            logger.warning("WorkspaceClient not available, skipping monthly report")
            return

        # Import router functions
        from job_monitor.backend.routers.cost import get_cost_summary
        from job_monitor.backend.routers.health_metrics import get_health_metrics

        # Get data for last 30 days
        cost_summary = await get_cost_summary(days=30, ws=ws)
        health = await get_health_metrics(days=30, ws=ws)

        month = datetime.now().strftime("%B %Y")
        month_start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        month_end = datetime.now().strftime("%Y-%m-%d")

        total_dbus = sum(t.total_dbus_30d for t in cost_summary.teams)
        reliability = (
            sum(j.success_rate for j in health.jobs) / len(health.jobs)
            if health.jobs
            else 0
        )

        context = {
            "month": month,
            "month_start": month_start,
            "month_end": month_end,
            "total_runs": sum(j.total_runs for j in health.jobs),
            "total_jobs": len(health.jobs),
            "total_dbus": total_dbus,
            "dbu_rate": cost_summary.dbu_rate,
            "reliability_percent": reliability,
            "reliability_change": 0,  # Would need previous month
            "cost_change": 0,  # Would need previous month
            "sla_compliance": 95.0,  # Would need SLA data
            "sla_change": 0,
            "cost_breakdown": [
                {
                    "name": t.team or "Untagged",
                    "dbus": t.total_dbus_30d,
                    "percent": (
                        (t.total_dbus_30d / total_dbus * 100) if total_dbus else 0
                    ),
                }
                for t in cost_summary.teams[:5]
            ],
            "team_rankings": [
                {
                    "name": t.team or "Untagged",
                    "reliability": 95.0,
                    "dbus": t.total_dbus_30d,
                    "efficiency_score": 75,
                }
                for t in sorted(
                    cost_summary.teams, key=lambda x: x.total_dbus_30d, reverse=True
                )[:5]
            ],
            "potential_savings": total_dbus * 0.1 * (cost_summary.dbu_rate or 0.07),
            "recommendations": [
                {
                    "title": "Right-size over-provisioned clusters",
                    "description": "Several jobs show sustained low utilization. Consider reducing cluster sizes.",
                    "savings": f"${total_dbus * 0.05 * (cost_summary.dbu_rate or 0.07):.0f}/month",
                    "effort": "Low",
                },
                {
                    "title": "Consolidate zombie jobs",
                    "description": "Jobs running but processing minimal data should be reviewed.",
                    "savings": f"${total_dbus * 0.03 * (cost_summary.dbu_rate or 0.07):.0f}/month",
                    "effort": "Medium",
                },
            ],
            "action_items": [
                "Review and disable identified zombie jobs",
                "Right-size top 5 over-provisioned clusters",
                "Set SLA targets for jobs currently without targets",
                "Schedule architecture review for highest-cost jobs",
            ],
        }

        await send_email(
            template_name="monthly_executive.html",
            context=context,
            recipients=recipients,
            subject=f"Monthly Executive Report - {month}",
        )

    except Exception as e:
        logger.error(f"Failed to generate monthly executive report: {e}")


def setup_scheduler():
    """Configure scheduled report jobs."""
    # Daily at 8am
    scheduler.add_job(
        generate_daily_health_report,
        CronTrigger(hour=8, minute=0),
        id="daily_health_report",
        replace_existing=True,
    )

    # Weekly on Monday at 8am
    scheduler.add_job(
        generate_weekly_cost_report,
        CronTrigger(day_of_week="mon", hour=8, minute=0),
        id="weekly_cost_report",
        replace_existing=True,
    )

    # Monthly on 1st at 8am
    scheduler.add_job(
        generate_monthly_executive_report,
        CronTrigger(day=1, hour=8, minute=0),
        id="monthly_executive_report",
        replace_existing=True,
    )

    logger.info("Scheduler configured with 3 report jobs")
