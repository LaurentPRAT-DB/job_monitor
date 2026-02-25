---
phase: 05-alerting-remediation
plan: 01
subsystem: api
tags: [alerts, fastapi, async, pydantic, databricks-api]

# Dependency graph
requires:
  - phase: 02-health-metrics
    provides: failure detection and priority (P1/P2/P3) logic
  - phase: 03-cost-sla
    provides: cost anomaly detection and SLA tag configuration
  - phase: 04-cluster-pipeline-integrity
    provides: cluster utilization proxy calculation
provides:
  - GET /api/alerts endpoint with dynamic alert generation
  - POST /api/alerts/{alert_id}/acknowledge endpoint
  - Alert models (Alert, AlertSeverity, AlertCategory, AlertListOut)
  - Context-aware remediation suggestions
  - budget_tag_key configuration for monthly DBU budgets
affects: [05-alerting-remediation, ui-components]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dynamic alert generation from multiple data sources
    - In-memory acknowledgment store with 24h TTL
    - asyncio.gather for parallel data fetching across sources
    - Condition-based deduplication with severity precedence

key-files:
  created:
    - job_monitor/backend/routers/alerts.py
  modified:
    - job_monitor/backend/models.py
    - job_monitor/backend/config.py
    - job_monitor/backend/app.py

key-decisions:
  - "In-memory acknowledgment with 24h TTL (no database persistence needed)"
  - "Alert ID format: {category}_{job_id}_{type} for uniqueness"
  - "Condition key for deduplication separate from display ID"
  - "Parallel alert generation using asyncio.gather for all 4 sources"

patterns-established:
  - "Alert generation pattern: query data source, map to Alert model with remediation"
  - "Remediation generation: context-aware based on failure reasons/metrics"
  - "Acknowledgment pattern: condition_key-based store with TTL"

requirements-completed: [ALERT-01, ALERT-02, SLA-03, COST-03]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 05 Plan 01: Alert Backend API Summary

**Dynamic alert generation API combining health metrics, SLA, cost, and cluster data with severity-based prioritization and actionable remediation suggestions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T08:03:43Z
- **Completed:** 2026-02-25T08:07:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created GET /api/alerts endpoint generating alerts from 4 data sources in parallel
- Implemented context-aware remediation suggestions for each alert type
- Added POST /api/alerts/{alert_id}/acknowledge with 24-hour TTL
- Defined Alert models with severity (P1/P2/P3) and category (failure/sla/cost/cluster) enums

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Alert models and config** - `5aa15ed` (feat)
2. **Task 2: Create alerts router with dynamic generation** - `f7ab7a8` (feat)

## Files Created/Modified

- `job_monitor/backend/models.py` - Added AlertSeverity, AlertCategory, Alert, AlertListOut models
- `job_monitor/backend/config.py` - Added budget_tag_key setting and get_settings() function
- `job_monitor/backend/routers/alerts.py` - Full alerts router with dynamic generation from all sources
- `job_monitor/backend/app.py` - Registered alerts router

## Decisions Made

- **In-memory acknowledgment store:** Using dict with 24h TTL instead of database persistence - alerts are regenerated dynamically anyway
- **Alert ID composition:** `{category}_{job_id}_{type}` provides readable unique IDs while condition_key handles deduplication
- **Parallel generation:** asyncio.gather across all 4 alert sources for optimal performance
- **Severity-based deduplication:** When same condition generates multiple alerts, keep higher severity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Alert backend API complete and ready for UI integration
- GET /api/alerts provides all alert data needed for dashboard
- POST /api/alerts/{alert_id}/acknowledge ready for UI interaction
- Remediation suggestions included for guiding user actions

## Self-Check: PASSED

All files verified:
- job_monitor/backend/routers/alerts.py: FOUND
- job_monitor/backend/models.py: FOUND
- job_monitor/backend/config.py: FOUND
- job_monitor/backend/app.py: FOUND
- Commit 5aa15ed: FOUND
- Commit f7ab7a8: FOUND

---
*Phase: 05-alerting-remediation*
*Completed: 2026-02-25*
