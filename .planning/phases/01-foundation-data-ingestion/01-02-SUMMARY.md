---
phase: 01-foundation-data-ingestion
plan: 02
subsystem: api
tags: [fastapi, databricks-sdk, unity-catalog, system-tables, scd2, billing]

# Dependency graph
requires:
  - phase: 01-01
    provides: FastAPI scaffold with WorkspaceClient dependency injection
provides:
  - Job run timeline query endpoint with parameterized days filter
  - Job metadata endpoint with SCD2 ROW_NUMBER pattern
  - Billing usage endpoint with RETRACTION handling
  - Billing by-job aggregation endpoint
affects: [02-core-monitoring, 03-alerting, 04-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SCD2 ROW_NUMBER PARTITION BY for latest job metadata
    - HAVING SUM != 0 for billing RETRACTION handling
    - asyncio.to_thread for sync SDK calls in async endpoints

key-files:
  created:
    - job_monitor/backend/routers/jobs.py
    - job_monitor/backend/routers/billing.py
  modified:
    - job_monitor/backend/models.py
    - job_monitor/backend/app.py

key-decisions:
  - "SCD2 pattern uses ROW_NUMBER OVER PARTITION BY workspace_id, job_id ORDER BY change_time DESC"
  - "RETRACTION handling via HAVING SUM(usage_quantity) != 0 excludes fully retracted items"
  - "All SQL queries return max 1000 rows with parameterized time filters"

patterns-established:
  - "System table queries: use asyncio.to_thread with statement_execution.execute_statement"
  - "Result parsing: dedicated _parse_* functions converting result.data_array to pydantic models"

requirements-completed: [APP-05]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 01 Plan 02: System Table Ingestion Summary

**Unity Catalog system table API endpoints with SCD2 pattern for jobs and RETRACTION handling for billing**

## Performance

- **Duration:** 4 min 7 sec
- **Started:** 2026-02-18T20:47:13Z
- **Completed:** 2026-02-18T20:51:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Implemented /api/jobs/runs endpoint querying system.lakeflow.job_run_timeline with days filter
- Implemented /api/jobs endpoint with correct SCD2 pattern (ROW_NUMBER PARTITION BY)
- Implemented /api/billing/usage with RETRACTION handling (HAVING SUM != 0)
- Implemented /api/billing/by-job for per-job cost aggregation
- All endpoints use async pattern with asyncio.to_thread for SDK calls

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement job run and job metadata endpoints** - `aef21e4` (feat)
2. **Task 2: Implement billing data endpoint with RETRACTION handling** - `d34cc40` (feat)

**Plan metadata:** Pending final commit (docs: complete 01-02 plan)

## Files Created/Modified

- `job_monitor/backend/routers/jobs.py` - Job runs and job metadata endpoints with SCD2 pattern
- `job_monitor/backend/routers/billing.py` - Billing usage and by-job endpoints with RETRACTION handling
- `job_monitor/backend/models.py` - Added JobRunListOut, JobOut, BillingUsageOut, BillingByJobOut models
- `job_monitor/backend/app.py` - Included jobs and billing routers

## Decisions Made

- **SCD2 query pattern:** Used ROW_NUMBER OVER PARTITION BY workspace_id, job_id ORDER BY change_time DESC with WHERE rn = 1 to get latest job version
- **RETRACTION handling:** Applied HAVING SUM(usage_quantity) != 0 to exclude fully retracted billing records
- **Query limits:** All queries limited to 1000 rows to prevent memory issues
- **Date filters:** Parameterized days filter (1-90 for jobs, 1-365 for billing) for time-bounded queries

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Virtual environment needed to be created (.venv was not set up from previous plan) - created and installed dependencies
- Additional jobs_api.py router was found already created (bonus real-time Jobs API endpoints) - included in commit

## User Setup Required

None - no external service configuration required. Endpoints will return empty lists without WAREHOUSE_ID and DATABRICKS_HOST configuration.

## Next Phase Readiness

- 4 system table query endpoints ready for monitoring features
- SQL patterns established (SCD2, RETRACTION) documented for future queries
- Ready for plan 03 (if exists) or Phase 02 core monitoring

---
*Phase: 01-foundation-data-ingestion*
*Completed: 2026-02-18*

## Self-Check: PASSED

All created files and commits verified:
- job_monitor/backend/routers/jobs.py: FOUND
- job_monitor/backend/routers/billing.py: FOUND
- Commit aef21e4: FOUND
- Commit d34cc40: FOUND
