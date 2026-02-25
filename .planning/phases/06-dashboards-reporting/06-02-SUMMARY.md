---
phase: 06-dashboards-reporting
plan: 02
subsystem: ui
tags: [recharts, react-query, historical-trends, line-chart, fastapi]

# Dependency graph
requires:
  - phase: 06-01
    provides: Global filtering system with time range selector
provides:
  - Historical data API with auto-granularity
  - Line charts with previous period comparison
  - Metric summary cards with trend indicators
  - Historical dashboard page at /historical
affects: [06-03, reporting, dashboards]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - DATE_TRUNC with FULL OUTER JOIN for period comparison
    - Dashed line overlay for previous period visualization
    - invertColors prop for metrics where decrease is good

key-files:
  created:
    - job_monitor/backend/routers/historical.py
    - job_monitor/ui/components/historical-chart.tsx
    - job_monitor/ui/components/metric-summary-card.tsx
    - job_monitor/ui/routes/_sidebar/historical.tsx
  modified:
    - job_monitor/backend/app.py

key-decisions:
  - "Auto-granularity: 7d=hourly, 30d=daily, 90d=weekly based on day range"
  - "Previous period shown as dashed gray line overlay on all charts"
  - "invertColors prop for cost/failure metrics where decrease is good"
  - "Success rate shows absolute diff change, not percentage change"

patterns-established:
  - "Historical API pattern: DATE_TRUNC + FULL OUTER JOIN for period comparison"
  - "Chart overlay pattern: solid current + dashed previous via strokeDasharray"

requirements-completed: [APP-04]

# Metrics
duration: 4min
completed: 2026-02-25
---

# Phase 06 Plan 02: Historical Dashboard Summary

**Historical trend visualization with auto-granularity, period-over-period comparison, and metric summary cards**

## Performance

- **Duration:** 3 min 30s
- **Started:** 2026-02-25T11:19:13Z
- **Completed:** 2026-02-25T11:22:43Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Created historical data API with /costs, /success-rate, /sla-breaches endpoints
- Implemented auto-granularity (7d=hourly, 30d=daily, 90d=weekly)
- Built HistoricalChart component with dashed previous period overlay
- Added MetricSummaryCard with trend indicators and color coding
- Created Historical Dashboard page with tabbed chart views

## Task Commits

Each task was committed atomically:

1. **Task 1: Create backend historical data API with auto-granularity** - `c6fdf4b` (feat)
2. **Task 2: Create HistoricalChart component with previous period overlay** - `da1b407` (feat)
3. **Task 3: Create Historical Dashboard page with multiple trend charts** - `9f168b5` (feat)

## Files Created/Modified
- `job_monitor/backend/routers/historical.py` - Historical data API with 3 endpoints
- `job_monitor/backend/app.py` - Register historical router
- `job_monitor/ui/components/historical-chart.tsx` - Line chart with period comparison
- `job_monitor/ui/components/metric-summary-card.tsx` - Summary card with trend indicator
- `job_monitor/ui/routes/_sidebar/historical.tsx` - Historical dashboard page

## Decisions Made
- Auto-granularity based on day range: 7d=hourly, 30d=daily, 90d=weekly
- Previous period shown as dashed gray line (strokeDasharray="5 5")
- invertColors prop for cost/failure metrics where decrease is good (green)
- Success rate change shown as absolute difference, not percentage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript types for Recharts Tooltip formatter**
- **Found during:** Task 3 (Historical Dashboard page)
- **Issue:** TypeScript error with Tooltip formatter signature - value and name could be undefined
- **Fix:** Changed to use any types with runtime checks (`typeof value === 'number'`)
- **Files modified:** job_monitor/ui/components/historical-chart.tsx
- **Verification:** Build passes with `npm run build`
- **Committed in:** 9f168b5 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type fix for Recharts compatibility. No scope creep.

## Issues Encountered
None - plan executed as expected after type fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Historical trends visualization complete
- Ready for Phase 06-03: Scheduled Reports
- API endpoints available for scheduled report email content

---
*Phase: 06-dashboards-reporting*
*Completed: 2026-02-25*

## Self-Check: PASSED

All files verified:
- FOUND: job_monitor/backend/routers/historical.py
- FOUND: job_monitor/ui/components/historical-chart.tsx
- FOUND: job_monitor/ui/components/metric-summary-card.tsx
- FOUND: job_monitor/ui/routes/_sidebar/historical.tsx

All commits verified:
- FOUND: c6fdf4b
- FOUND: da1b407
- FOUND: 9f168b5
