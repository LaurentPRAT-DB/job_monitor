---
phase: 06-dashboards-reporting
plan: 03
subsystem: api, email, scheduler
tags: [apscheduler, jinja2, smtp, email, cron, scheduled-reports]

# Dependency graph
requires:
  - phase: 06-01
    provides: Global filtering system for report data
  - phase: 05-01
    provides: Alerts API for daily health report
  - phase: 03-01
    provides: Cost API for weekly and monthly reports
provides:
  - APScheduler with daily/weekly/monthly cron jobs
  - Jinja2 HTML email templates for 3 report types
  - SMTP email delivery with distribution list support
  - Reports configuration API for admin settings
  - Manual report trigger endpoint for testing
affects: [reporting, admin-ui, notifications]

# Tech tracking
tech-stack:
  added: [apscheduler, emails, jinja2]
  patterns: [cron-scheduler, email-templates, lifespan-integration]

key-files:
  created:
    - job_monitor/backend/scheduler.py
    - job_monitor/backend/templates/daily_health.html
    - job_monitor/backend/templates/weekly_cost.html
    - job_monitor/backend/templates/monthly_executive.html
    - job_monitor/backend/routers/reports.py
  modified:
    - pyproject.toml
    - job_monitor/backend/config.py
    - job_monitor/backend/app.py

key-decisions:
  - "APScheduler AsyncIOScheduler for async FastAPI integration"
  - "CronTrigger for fixed-time report schedules (8am daily/Monday/1st)"
  - "Jinja2 with autoescape for secure HTML email rendering"
  - "emails library for SMTP delivery with TLS support"
  - "Comma-separated recipient lists in config for simple distribution management"

patterns-established:
  - "Scheduler lifespan: setup_scheduler() + start() on startup, shutdown() on cleanup"
  - "Report generation via existing API endpoints (no duplicate queries)"
  - "MockRequest pattern for accessing WorkspaceClient from scheduler jobs"

requirements-completed: [ALERT-03, ALERT-04, ALERT-05]

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 06 Plan 03: Scheduled Email Reports Summary

**APScheduler with daily health, weekly cost, and monthly executive email reports sent via SMTP with Jinja2 templates**

## Performance

- **Duration:** 5m 15s
- **Started:** 2026-02-25T11:19:15Z
- **Completed:** 2026-02-25T11:24:30Z
- **Tasks:** 4
- **Files modified:** 8

## Accomplishments
- APScheduler integrated with FastAPI lifespan for automatic startup/shutdown
- Three email templates: daily health (P1/P2 alerts, all jobs), weekly cost (anomaly-first), monthly executive (TCO, recommendations)
- SMTP configuration via environment variables with distribution list support
- Reports API for viewing config and manually triggering reports

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies** - `1294ca3` (chore)
2. **Task 2: Create email templates** - `30b286f` (feat)
3. **Task 3: Create scheduler with config** - `d2d0de5` (feat)
4. **Task 4: Create reports API** - `93c58b3` (feat)

## Files Created/Modified
- `pyproject.toml` - Added apscheduler, emails, Jinja2 dependencies
- `job_monitor/backend/scheduler.py` - AsyncIOScheduler with 3 CronTrigger jobs
- `job_monitor/backend/templates/daily_health.html` - Full job status with P1/P2 alerts
- `job_monitor/backend/templates/weekly_cost.html` - Anomaly-first with team breakdown
- `job_monitor/backend/templates/monthly_executive.html` - TCO, rankings, recommendations
- `job_monitor/backend/config.py` - SMTP and recipient settings
- `job_monitor/backend/app.py` - Scheduler lifespan integration, reports router
- `job_monitor/backend/routers/reports.py` - Config view, trigger, status endpoints

## Decisions Made
- APScheduler AsyncIOScheduler chosen for native async support with FastAPI
- CronTrigger schedules: daily 8am, weekly Monday 8am, monthly 1st 8am
- Report generation reuses existing API endpoints to avoid duplicate SQL queries
- MockRequest pattern provides WorkspaceClient access from scheduled jobs
- TLS enabled by default for SMTP connections

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None - all tasks completed successfully.

## User Setup Required

**External services require manual configuration.** Environment variables needed:

| Variable | Description | Example |
|----------|-------------|---------|
| SMTP_HOST | SMTP server hostname | smtp.gmail.com |
| SMTP_PORT | SMTP port (587 TLS, 465 SSL) | 587 |
| SMTP_USER | SMTP username/email | noreply@company.com |
| SMTP_PASSWORD | SMTP password/API key | app-specific-password |
| EMAIL_FROM | Sender address | noreply@databricks-monitor.local |
| DAILY_REPORT_RECIPIENTS | Comma-separated emails | team@company.com,ops@company.com |
| WEEKLY_REPORT_RECIPIENTS | Comma-separated emails | managers@company.com |
| MONTHLY_REPORT_RECIPIENTS | Comma-separated emails | exec@company.com |

**Verification:**
```bash
curl -X POST http://localhost:8000/api/reports/trigger/daily_health
curl http://localhost:8000/api/reports/scheduler/status
```

## Next Phase Readiness
- All Phase 6 plans complete
- Email reports ready for production with SMTP configuration
- Scheduler automatically starts with application
- Manual trigger endpoints available for testing

---
*Phase: 06-dashboards-reporting*
*Completed: 2026-02-25*
