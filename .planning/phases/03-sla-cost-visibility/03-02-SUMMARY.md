---
phase: 03-sla-cost-visibility
plan: 02
subsystem: ui
tags: [react, tanstack-query, recharts, sparkline, inline-edit, sla]

# Dependency graph
requires:
  - phase: 03-01
    provides: Backend APIs for job tags PATCH and SLA data
provides:
  - SLA Target column with click-to-edit inline editing
  - Breach history sparkline visualization
  - Auto-suggest p90 duration when no SLA defined
  - Breach indicator for last run exceeding SLA
affects: [03-03, cost-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-edit-pattern, sparkline-visualization, responsive-column-hiding]

key-files:
  created:
    - job_monitor/ui/components/sla-sparkline.tsx
    - job_monitor/ui/components/inline-sla-edit.tsx
  modified:
    - job_monitor/ui/components/job-health-row.tsx
    - job_monitor/ui/components/job-health-table.tsx
    - job_monitor/ui/routes/_sidebar/job-health.tsx
    - job_monitor/ui/lib/health-utils.ts
    - job_monitor/ui/lib/api.ts

key-decisions:
  - "Recharts LineChart with stepAfter type for breach visualization"
  - "Breach sparkline hidden on mobile for responsive design"
  - "Red indicator dot shown when last run breached SLA"
  - "P90 suggestion shown as placeholder in edit mode, not pre-populated"

patterns-established:
  - "Inline edit pattern: display mode with hover pencil icon, edit mode with input + save/cancel"
  - "Sparkline pattern: breach history as stepAfter line, red if any breaches"
  - "Responsive columns: hidden md:table-cell for narrow screens"

requirements-completed: [SLA-01, SLA-02]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Phase 3 Plan 2: SLA UI Components Summary

**Click-to-edit SLA targets with p90 auto-suggest and breach history sparklines in job health table**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T20:48:49Z
- **Completed:** 2026-02-24T20:51:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- SLA sparkline component renders breach history as stepAfter line chart
- Inline SLA edit component provides click-to-edit with auto-suggest placeholder
- SLA Target and Breach History columns added to job health table
- Last run breach indicator shows red dot when SLA exceeded
- Responsive design hides breach history on mobile

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SLA sparkline and inline edit components** - `af4542d` (feat)
2. **Task 2: Integrate SLA components into job health table** - `9250613` (feat)

## Files Created/Modified
- `job_monitor/ui/components/sla-sparkline.tsx` - Compact breach history visualization with Recharts
- `job_monitor/ui/components/inline-sla-edit.tsx` - Click-to-edit SLA target with p90 placeholder
- `job_monitor/ui/lib/api.ts` - Added updateJobTags() for PATCH /api/jobs/{jobId}/tags
- `job_monitor/ui/lib/health-utils.ts` - Added JobWithSla and BreachDataPoint types
- `job_monitor/ui/components/job-health-row.tsx` - Added SLA cells with InlineSlaEdit and SlaSparkline
- `job_monitor/ui/components/job-health-table.tsx` - Added SLA Target and Breach History columns
- `job_monitor/ui/routes/_sidebar/job-health.tsx` - Updated types and passed refetch callback

## Decisions Made
- Used stepAfter line type for breach visualization (step-like chart showing discrete breached/met states)
- Red (#ef4444) when any breaches, green (#22c55e) when all met
- P90 suggestion shown as input placeholder, not pre-populated value, to encourage intentional SLA setting
- Breach history column hidden on mobile screens (hidden md:table-cell pattern)
- Last run breach indicator shown as small red dot next to SLA value

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Minor TypeScript warning for unused BreachDataPoint import - removed unused import

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SLA UI components complete and integrated
- Ready for 03-03 (Cost dashboard visualization)
- Backend APIs (03-01) fully wired to frontend

## Self-Check: PASSED

- [x] sla-sparkline.tsx exists with Recharts LineChart implementation
- [x] inline-sla-edit.tsx exists with click-to-edit pattern
- [x] SLA column added to job health table header
- [x] Breach history column added to job health table
- [x] InlineSlaEdit component rendered in each job row
- [x] SlaSparkline component rendered when breach data exists
- [x] PATCH mutation wired to /api/jobs/{job_id}/tags endpoint
- [x] Auto-suggest shows p90 value as placeholder
- [x] TypeScript compiles without errors
- [x] Commit af4542d exists
- [x] Commit 9250613 exists

---
*Phase: 03-sla-cost-visibility*
*Completed: 2026-02-24*
