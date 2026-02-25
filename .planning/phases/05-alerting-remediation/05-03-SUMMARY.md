---
phase: 05-alerting-remediation
plan: 03
subsystem: ui
tags: [alerts, react, tanstack-router, tanstack-query, shadcn]

# Dependency graph
requires:
  - phase: 05-alerting-remediation
    provides: GET /api/alerts endpoint and alert utility functions
  - phase: 02-health-metrics
    provides: job-health-table and job-health-row components for integration
provides:
  - /alerts route with severity-grouped sections (P1/P2/P3)
  - Category filter tabs (All/Failure/SLA/Cost/Cluster)
  - AlertIndicator component for job health rows
  - Job-filtered alert drawer via indicator click
affects: [06-dashboards-reporting, ui-components]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dedicated page for aggregate alert view with severity grouping
    - Inline alert indicator pattern with drawer trigger
    - Job-filtered drawer state via context function

key-files:
  created:
    - job_monitor/ui/routes/_sidebar/alerts.tsx
    - job_monitor/ui/components/alert-indicator.tsx
  modified:
    - job_monitor/ui/routeTree.gen.tsx
    - job_monitor/ui/components/job-health-row.tsx
    - job_monitor/ui/components/job-health-table.tsx
    - job_monitor/ui/components/alert-drawer.tsx
    - job_monitor/ui/components/alert-badge.tsx
    - job_monitor/ui/lib/alert-utils.ts

key-decisions:
  - "Alerts page shows severity sections (Critical/Warning/Info) for visual hierarchy"
  - "Category filter tabs allow focused view by alert type"
  - "AlertIndicator uses bell icon with count, colored by highest severity"
  - "Job-filtered drawer triggered by indicator click without row expansion"
  - "Alerts fetched at table level (not per-row) to avoid N+1 queries"

patterns-established:
  - "Severity section pattern: group by P1/P2/P3 with color-coded headers"
  - "Inline indicator pattern: small colored pill that triggers drawer with filter"
  - "Job filter context: setJobFilter function exposed from alert-drawer for external triggers"

requirements-completed: [ALERT-01]

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 05 Plan 03: Alerts Page & Job Row Indicators Summary

**Dedicated alerts page with severity sections and category filtering, plus inline alert indicators on job health rows that open job-filtered drawer**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T08:17:00Z
- **Completed:** 2026-02-25T08:22:54Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Created /alerts page showing alerts grouped by P1 Critical, P2 Warning, P3 Info sections
- Implemented category filter tabs (All/Failure/SLA/Cost/Cluster) for focused alert views
- Added AlertIndicator component displaying bell icon with count on job health rows
- Integrated job-filtered drawer that opens when clicking alert indicator on a job row
- Completed full alerting system verification with user approval

## Task Commits

Each task was committed atomically:

1. **Task 1: Create dedicated Alerts page** - `ef07e59` (feat)
2. **Task 2: Add alert indicator to job health rows** - `88bfecb` (feat)
3. **Task 3: Verify complete alerting system** - Human verification checkpoint (approved)

## Files Created/Modified

- `job_monitor/ui/routes/_sidebar/alerts.tsx` - Dedicated alerts page with severity sections and category tabs
- `job_monitor/ui/routeTree.gen.tsx` - Added /alerts route to router tree
- `job_monitor/ui/components/alert-indicator.tsx` - Bell icon indicator with count and severity coloring
- `job_monitor/ui/components/job-health-row.tsx` - Integrated AlertIndicator into job rows
- `job_monitor/ui/components/job-health-table.tsx` - Added alerts query and pass-through to rows
- `job_monitor/ui/components/alert-drawer.tsx` - Added job filter state and setJobFilter function
- `job_monitor/ui/components/alert-badge.tsx` - Enhanced with setJobFilter context exposure
- `job_monitor/ui/lib/alert-utils.ts` - Added getAlertsForJob and getHighestSeverity helpers

## Decisions Made

- **Severity sections in alerts page:** Visual hierarchy helps users focus on critical issues first
- **Category filter tabs:** Allows operations team to focus on specific alert types (e.g., just cost anomalies)
- **AlertIndicator design:** Small colored pill with bell icon - "subtle but noticeable" per user preference
- **Table-level alert fetch:** Fetching alerts once at job-health-table level prevents N+1 query pattern
- **Job filter via context:** setJobFilter exposed from drawer allows external components to trigger filtered view

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Phase 5 Complete

This plan completes Phase 5: Alerting & Remediation. The complete alerting system now provides:

**Backend (Plan 01):**
- Dynamic alert generation from health metrics, cost anomalies, SLA breaches, and cluster over-provisioning
- Acknowledgment API with 24-hour TTL
- Context-aware remediation suggestions

**UI - Drawer & Notifications (Plan 02):**
- Alert drawer accessible from header bell icon
- Alert badge showing unacknowledged count
- Toast notifications for new P1/P2 alerts
- Alert cards with inline remediation display

**UI - Alerts Page & Indicators (Plan 03):**
- Dedicated /alerts page with severity sections
- Category filter tabs for focused views
- Inline alert indicators on job health rows
- Job-filtered drawer opening from indicators

## Next Phase Readiness

- Alerting system complete and verified by user
- Ready for Phase 6: Dashboards & Reporting
- Alert data available for filtering/drill-down features
- Historical alert patterns can inform reporting

## Self-Check: PASSED

All files verified:
- job_monitor/ui/routes/_sidebar/alerts.tsx: FOUND
- job_monitor/ui/components/alert-indicator.tsx: FOUND
- job_monitor/ui/routeTree.gen.tsx: FOUND
- job_monitor/ui/components/job-health-row.tsx: FOUND
- job_monitor/ui/components/job-health-table.tsx: FOUND
- job_monitor/ui/components/alert-drawer.tsx: FOUND
- Commit ef07e59: FOUND
- Commit 88bfecb: FOUND

---
*Phase: 05-alerting-remediation*
*Completed: 2026-02-25*
