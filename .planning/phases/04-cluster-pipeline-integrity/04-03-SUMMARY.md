---
phase: 04-cluster-pipeline-integrity
plan: 03
subsystem: ui
tags: [react, tanstack-query, recharts, pipeline, schema-drift, row-count]

# Dependency graph
requires:
  - phase: 04-01
    provides: Pipeline integrity backend API endpoints for row counts and schema drift
provides:
  - Row count delta visualization with trend sparklines
  - Schema drift alerts showing column changes
  - Pipeline integrity section in expanded job details
  - Pipeline utility types and formatting functions
affects: [05-alerting, future-dashboard-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nested component composition (Section -> Card/Alert -> Icon)"
    - "TanStack Query parallel fetching for multiple data sources"
    - "Anomaly highlighting with amber/red color scheme"

key-files:
  created:
    - job_monitor/ui/lib/pipeline-utils.ts
    - job_monitor/ui/components/row-count-delta.tsx
    - job_monitor/ui/components/schema-drift-alert.tsx
    - job_monitor/ui/components/pipeline-integrity-section.tsx
  modified:
    - job_monitor/ui/components/job-expanded-details.tsx

key-decisions:
  - "Schema drift shown first (more urgent than row count anomalies)"
  - "Mini sparkline hidden when trend has <2 data points"
  - "Table name truncated to last segment with full path in subtitle"

patterns-established:
  - "Alert component pattern: amber background, triangle icon, badge for count"
  - "Data card pattern: title + subtitle + metrics + optional sparkline"

requirements-completed: [PIPE-01, PIPE-02]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 04 Plan 03: Pipeline Integrity UI Summary

**Row count delta visualization with anomaly detection and schema drift alerts integrated into expanded job details**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T21:30:09Z
- **Completed:** 2026-02-24T21:33:00Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments
- Pipeline utility types (RowCountDelta, SchemaDrift, ColumnChange) and formatting helpers
- RowCountDeltaCard showing current vs baseline with trend sparkline and anomaly badge
- SchemaDriftAlert displaying added/removed/type-changed columns with icons
- PipelineIntegritySection fetching and combining row counts and schema drift data

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pipeline utility types and functions** - `2975ab8` (feat)
2. **Task 2: Create RowCountDelta component** - `933d543` (feat)
3. **Task 3: Create SchemaDriftAlert component** - `7d97d46` (feat)
4. **Task 4: Create PipelineIntegritySection and integrate into expanded details** - `d5a44df` (feat)

## Files Created/Modified
- `job_monitor/ui/lib/pipeline-utils.ts` - Types and formatting helpers for pipeline data
- `job_monitor/ui/components/row-count-delta.tsx` - Card showing row count delta with trend
- `job_monitor/ui/components/schema-drift-alert.tsx` - Alert for column changes
- `job_monitor/ui/components/pipeline-integrity-section.tsx` - Combined section with API fetching
- `job_monitor/ui/components/job-expanded-details.tsx` - Added PipelineIntegritySection import and render

## Decisions Made
- Schema drift alerts displayed before row counts (more actionable)
- Used arrow entity for type change visualization (old_type -> new_type)
- Empty state shows instructions for enabling tracking via output_tables tag

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pipeline integrity UI complete with row count and schema drift visualization
- Ready for Phase 5 alerting integration
- API endpoints from 04-01 provide mock data for development testing

---
*Phase: 04-cluster-pipeline-integrity*
*Completed: 2026-02-24*
