---
phase: 03-sla-cost-visibility
plan: 03
subsystem: ui
tags: [react, tanstack-query, costs, dbu, anomalies, zombie-jobs]

# Dependency graph
requires:
  - phase: 03-01
    provides: Backend cost APIs (/api/costs/summary, /api/costs/anomalies)
provides:
  - Costs dashboard page at /costs route
  - Team cost rollup table with sorting
  - Per-job cost breakdown with SKU visualization
  - Cost anomalies tab with zombie job identification
  - DBU/dollar toggle formatting utilities
affects: [alerting, notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Cost formatting with DBU/dollar toggle
    - SKU category color coding for visualization
    - Anomaly type badges (cost_spike, zombie)

key-files:
  created:
    - job_monitor/ui/lib/cost-utils.ts
    - job_monitor/ui/components/team-cost-table.tsx
    - job_monitor/ui/components/cost-breakdown.tsx
    - job_monitor/ui/components/anomalies-tab.tsx
    - job_monitor/ui/routes/_sidebar/costs.tsx
  modified: []

key-decisions:
  - "SKU breakdown shown as mini horizontal bar with tooltip for details"
  - "Untagged teams/jobs highlighted with amber warning color"
  - "Dollar toggle disabled when dbu_rate not configured"

patterns-established:
  - "Cost formatting: formatDBUs for display, formatCost with toggle support"
  - "Trend indicators: green for cost decrease, red for increase (>10%)"
  - "Anomaly display: red bg for cost spikes, orange bg for zombies"

requirements-completed: [COST-01, COST-02, COST-04, COST-05]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 03 Plan 03: Costs Dashboard Summary

**Cost attribution dashboard with team rollups, SKU breakdown visualization, and anomaly detection for cost spikes and zombie jobs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T20:48:46Z
- **Completed:** 2026-02-24T20:52:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Costs dashboard at /costs with tabbed navigation (By Team, By Job, Anomalies)
- Team cost rollup table with sortable columns and untagged warning
- Per-job cost breakdown with SKU category mini-bar visualization
- Anomalies tab showing cost spikes (2x baseline) and zombie jobs
- DBU/dollar toggle with configurable rate from backend

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cost utilities and team cost table component** - `8d5b893` (feat)
2. **Task 2: Create costs page and anomalies tab** - `f6347d6` (feat)

## Files Created/Modified
- `job_monitor/ui/lib/cost-utils.ts` - DBU/dollar formatting, trend colors, SKU constants
- `job_monitor/ui/components/team-cost-table.tsx` - Sortable team rollup table
- `job_monitor/ui/components/cost-breakdown.tsx` - Per-job costs with SKU bar visualization
- `job_monitor/ui/components/anomalies-tab.tsx` - Cost spikes and zombie jobs display
- `job_monitor/ui/routes/_sidebar/costs.tsx` - Main costs dashboard page

## Decisions Made
- SKU breakdown displayed as horizontal proportional bar (vs badge list) for better visual comparison
- Untagged teams and jobs highlighted with amber background for governance visibility
- Dollar toggle grayed out with helper text when DBU rate is not configured
- Anomaly badge count shown in tab header for immediate visibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in job-health.tsx (type mismatch JobHealth vs JobWithSla) - documented in deferred-items.md as out of scope

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Costs dashboard complete and functional
- Consumes /api/costs/summary and /api/costs/anomalies endpoints from Plan 03-01
- Ready for Phase 4 alerting integration

## Self-Check: PASSED

- [x] cost-utils.ts exists
- [x] team-cost-table.tsx exists
- [x] cost-breakdown.tsx exists
- [x] anomalies-tab.tsx exists
- [x] costs.tsx exists
- [x] Commit 8d5b893 exists
- [x] Commit f6347d6 exists

---
*Phase: 03-sla-cost-visibility*
*Completed: 2026-02-24*
