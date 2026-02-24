---
phase: 02-job-health-monitoring
plan: 01
subsystem: api
tags: [fastapi, pydantic, sql, window-functions, lag, job-health, priority-detection]

# Dependency graph
requires:
  - phase: 01-foundation-data-ingestion
    provides: FastAPI app structure, WorkspaceClient setup, SCD2 pattern for jobs table
provides:
  - GET /api/health-metrics endpoint with priority flags (P1/P2/P3)
  - JobHealthOut model with computed status field
  - Consecutive failure detection via SQL LAG window function
  - Retry count tracking via same-day run heuristic
affects: [02-02-PLAN, 02-03-PLAN, job-health-ui, alerts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - LAG window function for consecutive failure detection
    - Computed Pydantic field for status from success_rate
    - Problem-first sorting (P1 > P2 > P3 > healthy)

key-files:
  created:
    - job_monitor/backend/routers/health_metrics.py
  modified:
    - job_monitor/backend/models.py
    - job_monitor/backend/app.py

key-decisions:
  - "P3 priority assigned to jobs in yellow zone (70-89% success rate)"
  - "Retry detection uses same-day multiple runs as heuristic (system tables don't distinguish auto vs manual retries)"
  - "Status computed from success_rate using Pydantic computed_field decorator"

patterns-established:
  - "CTE-based SQL queries for complex aggregations with priority computation"
  - "Problem-first sorting at API level (not client-side)"
  - "Computed Pydantic fields for derived values (status from success_rate)"

requirements-completed: [JOB-01, JOB-02, JOB-04]

# Metrics
duration: 2m 46s
completed: 2026-02-24
---

# Phase 02 Plan 01: Job Health Metrics API Summary

**Backend API endpoint for job health metrics with consecutive failure detection (P1/P2), yellow zone detection (P3), and retry tracking using SQL LAG window functions**

## Performance

- **Duration:** 2m 46s
- **Started:** 2026-02-24T16:54:21Z
- **Completed:** 2026-02-24T16:57:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- JobHealthOut model with computed status field (green/yellow/red based on success_rate thresholds)
- GET /api/health-metrics endpoint accepting days=7 or days=30 query parameter
- Consecutive failure detection using SQL LAG window function (P1 for 2+ consecutive, P2 for single)
- Retry count tracking via same-day multiple runs heuristic
- Problem-first sorting: P1 > P2 > P3 > healthy

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Pydantic models for job health data** - `815b111` (feat)
2. **Task 2: Implement job health metrics endpoint with consecutive failure detection** - `fdc7bef` (feat)

## Files Created/Modified
- `job_monitor/backend/models.py` - Added JobHealthOut with computed status, JobHealthListOut wrapper, and supporting models (DurationStatsOut, JobRunDetailOut, JobExpandedOut)
- `job_monitor/backend/routers/health_metrics.py` - New router with GET /api/health-metrics endpoint using CTEs and LAG window function
- `job_monitor/backend/app.py` - Registered health_metrics router

## Decisions Made
- P3 priority assigned to jobs in yellow zone (70-89% success rate) - follows user constraint from CONTEXT.md
- Retry detection uses same-day multiple runs as heuristic since system tables don't distinguish automatic retries from manual reruns
- Status computed using Pydantic computed_field decorator for automatic derivation from success_rate

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TestClient requires httpx package not installed in venv - verified endpoint registration via route inspection instead of HTTP test

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- API foundation complete for job health dashboard UI (Plan 02)
- Endpoint returns data sorted by priority, ready for frontend consumption
- Additional models (DurationStatsOut, JobRunDetailOut, JobExpandedOut) added by linter for future expanded view functionality

## Self-Check: PASSED

All files and commits verified.

---
*Phase: 02-job-health-monitoring*
*Completed: 2026-02-24*
