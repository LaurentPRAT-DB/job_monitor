---
phase: 02-job-health-monitoring
plan: 03
subsystem: ui
tags: [react, tanstack-router, tanstack-query, recharts, shadcn-ui, tailwind]

# Dependency graph
requires:
  - phase: 02-01
    provides: Job health metrics API with success rates, priority flags
  - phase: 02-02
    provides: Duration statistics and expanded details API endpoints
provides:
  - Job health dashboard page at /job-health route
  - Traffic light status indicators (green/yellow/red)
  - Priority badges (P1/P2/P3) for problem jobs
  - Expandable rows with recent runs and duration charts
  - 7-day/30-day tab toggle for time window selection
  - Duration trend visualization with anomaly highlighting
affects: [03-sla-cost-visibility, 06-dashboards-reporting]

# Tech tracking
tech-stack:
  added: [recharts, lucide-react, shadcn/ui collapsible, shadcn/ui tabs, shadcn/ui badge, shadcn/ui tooltip, shadcn/ui table]
  patterns: [TanStack Query for data fetching, collapsible table rows, traffic light status indicators]

key-files:
  created:
    - job_monitor/ui/routes/_sidebar/job-health.tsx
    - job_monitor/ui/components/job-health-table.tsx
    - job_monitor/ui/components/job-health-row.tsx
    - job_monitor/ui/components/duration-chart.tsx
    - job_monitor/ui/components/job-expanded-details.tsx
    - job_monitor/ui/components/status-indicator.tsx
    - job_monitor/ui/components/priority-badge.tsx
    - job_monitor/ui/lib/health-utils.ts
  modified:
    - job_monitor/ui/routeTree.gen.tsx

key-decisions:
  - "STATUS_THRESHOLDS: green >= 90%, yellow 70-89%, red < 70%"
  - "Anomaly threshold 2x baseline shown as dashed red reference line on chart"
  - "5-minute stale time for health metrics queries (matches system table latency)"
  - "Problem-first sorting: P1 > P2 > P3 > healthy jobs"

patterns-established:
  - "Traffic light pattern: colored dot + percentage for status visualization"
  - "Expandable row pattern: Collapsible wrapper around TableRow for drill-down details"
  - "Health utils module: centralized threshold constants and formatting functions"

requirements-completed: [JOB-01, JOB-02, JOB-03, JOB-04]

# Metrics
duration: ~15min
completed: 2026-02-24
---

# Phase 2 Plan 3: Job Health Dashboard UI Summary

**Job health dashboard with traffic light indicators, P1/P2/P3 badges, expandable rows, duration charts, and 7/30-day tabs using React, TanStack Query, and Recharts**

## Performance

- **Duration:** ~15 min (including human verification)
- **Tasks:** 6 (5 auto + 1 human-verify)
- **Files created:** 14
- **Files modified:** 1

## Accomplishments

- Built complete job health monitoring UI accessible at /job-health route
- Implemented traffic light status indicators with green/yellow/red based on success rate thresholds
- Created P1/P2/P3 priority badges for identifying problem jobs at a glance
- Built expandable table rows showing recent runs list and duration trend chart
- Added 7-day/30-day tab toggle for switching time windows
- Implemented duration anomaly highlighting with 2x baseline threshold visualization

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and add shadcn/ui components** - `ae2ba29` (feat)
2. **Task 2: Create utility components and helpers** - `e8d94b0` (feat)
3. **Task 3: Create duration chart and expanded details components** - `1fe6bbe` (feat)
4. **Task 4: Create job health table with expandable rows** - `5906c6b` (feat)
5. **Task 5: Create job health dashboard page with tabs** - `5de6871` (feat)
6. **Task 6: Verify job health dashboard functionality** - Human verified (approved)

## Files Created/Modified

**UI Components:**
- `job_monitor/ui/routes/_sidebar/job-health.tsx` - Main dashboard page with tabs and data fetching
- `job_monitor/ui/components/job-health-table.tsx` - Table container with headers and loading states
- `job_monitor/ui/components/job-health-row.tsx` - Collapsible row with expand/collapse behavior
- `job_monitor/ui/components/job-expanded-details.tsx` - Expanded view with recent runs and metrics
- `job_monitor/ui/components/duration-chart.tsx` - Recharts line chart with baseline reference lines
- `job_monitor/ui/components/status-indicator.tsx` - Traffic light dot with percentage
- `job_monitor/ui/components/priority-badge.tsx` - Colored P1/P2/P3 badges

**Utilities:**
- `job_monitor/ui/lib/health-utils.ts` - Threshold constants and formatting functions

**shadcn/ui Components:**
- `job_monitor/ui/components/ui/collapsible.tsx` - Radix collapsible primitive
- `job_monitor/ui/components/ui/tabs.tsx` - Tab navigation components
- `job_monitor/ui/components/ui/badge.tsx` - Badge component for priorities
- `job_monitor/ui/components/ui/tooltip.tsx` - Tooltip for anomaly explanations
- `job_monitor/ui/components/ui/table.tsx` - Table primitives
- `job_monitor/ui/components/ui/button.tsx` - Button component

## Decisions Made

- **STATUS_THRESHOLDS:** green >= 90%, yellow 70-89%, red < 70% (matches backend priority logic)
- **Anomaly visualization:** 2x baseline shown as dashed red reference line on duration chart
- **Query caching:** 5-minute stale time matches system table 5-15 minute latency
- **Sorting:** Problem-first (P1 at top, then P2, P3, healthy last) for immediate attention

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all dependencies installed correctly and components rendered as expected.

## User Setup Required

None - no external service configuration required. Dashboard uses existing backend API endpoints.

## Next Phase Readiness

- Phase 2 (Job Health Monitoring) complete with all requirements satisfied
- Backend APIs (02-01, 02-02) and frontend UI (02-03) integrated
- Ready for Phase 3: SLA & Cost Visibility
- Dashboard foundation can be extended for additional monitoring views

## Self-Check: PASSED

All files verified present. All commits verified in git history.

---
*Phase: 02-job-health-monitoring*
*Completed: 2026-02-24*
