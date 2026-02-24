---
phase: 04-cluster-pipeline-integrity
plan: 01
subsystem: api
tags: [fastapi, pydantic, cluster-metrics, pipeline-integrity, billing-proxy]

# Dependency graph
requires:
  - phase: 03-sla-cost-visibility
    provides: Cost router patterns, billing system table queries
provides:
  - ClusterUtilization model with proxy-based metrics
  - RowCountDelta model with anomaly detection
  - SchemaDrift model with column change tracking
  - GET /api/cluster-metrics/{job_id} endpoint
  - GET /api/pipeline/{job_id}/row-counts endpoint
  - GET /api/pipeline/{job_id}/schema-drift endpoint
affects: [04-02, 04-03, cluster-ui, pipeline-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Proxy-based utilization calculation from billing DBU data
    - Schema drift detection via information_schema comparison
    - Job-to-table mapping via output_tables job tag

key-files:
  created:
    - job_monitor/backend/routers/cluster_metrics.py
    - job_monitor/backend/routers/pipeline.py
  modified:
    - job_monitor/backend/models.py
    - job_monitor/backend/app.py

key-decisions:
  - "DBU consumption proxy for utilization metrics since direct CPU/memory not in system tables"
  - "Heuristic mapping: <1 DBU/hr = ~20%, 1-2 = ~40%, 2-4 = ~60%, >4 = ~80% utilization"
  - "Over-provisioned flag only when ALL analyzed runs show <40% utilization"
  - "output_tables job tag for job-to-table mapping in pipeline integrity"
  - "In-memory schema baseline cache (production would use Delta table)"
  - "20% threshold for row count anomaly detection"

patterns-established:
  - "Proxy utilization pattern: billing DBU data normalized to percentages"
  - "Schema drift detection: information_schema.columns comparison with baseline cache"
  - "Right-sizing recommendations based on utilization bands"

requirements-completed: [CLUST-01, CLUST-02, PIPE-01, PIPE-02]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 04 Plan 01: Backend APIs Summary

**Cluster utilization proxy from billing DBU data with pipeline integrity endpoints for row count deltas and schema drift detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T21:25:00Z
- **Completed:** 2026-02-24T21:28:00Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- ClusterUtilization model with 4 metric percentages, over-provisioning flag, and recommendation field
- Proxy-based utilization calculation from billing DBU consumption patterns
- Row count delta tracking with 20% anomaly threshold
- Schema drift detection with added/removed/type-changed column tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Pydantic models for cluster and pipeline data** - `a95c9eb` (feat)
2. **Task 2: Create cluster metrics router with utilization endpoint** - `42e368d` (feat)
3. **Task 3: Create pipeline router with row count and schema drift endpoints** - `3338190` (feat)
4. **Task 4: Register new routers in app.py** - `9bd066e` (feat)

## Files Created/Modified
- `job_monitor/backend/models.py` - Added ClusterUtilization, RowCountDelta, ColumnChange, SchemaDrift models
- `job_monitor/backend/routers/cluster_metrics.py` - New router with GET /api/cluster-metrics/{job_id}
- `job_monitor/backend/routers/pipeline.py` - New router with row-counts and schema-drift endpoints
- `job_monitor/backend/app.py` - Registered cluster_metrics and pipeline routers

## Decisions Made
- Used DBU consumption as proxy for utilization since direct CPU/memory metrics not available in system tables
- Heuristic for DBU-to-utilization mapping: <1 DBU/hr = ~20%, 1-2 = ~40%, 2-4 = ~60%, >4 = ~80%
- Driver utilization estimated at 85% of worker utilization (typical Spark workload pattern)
- Over-provisioning requires sustained low utilization across ALL analyzed runs (not single occurrences)
- Job-to-table mapping via `output_tables` job tag (comma-separated fully qualified names)
- In-memory cache for schema baseline (production would persist to Delta table)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend APIs ready for UI component development
- Endpoints available: cluster-metrics, row-counts, schema-drift
- Plan 04-02 can proceed with UI gauge components

## Self-Check: PASSED

All files verified:
- FOUND: job_monitor/backend/models.py
- FOUND: job_monitor/backend/routers/cluster_metrics.py
- FOUND: job_monitor/backend/routers/pipeline.py
- FOUND: job_monitor/backend/app.py

All commits verified:
- FOUND: a95c9eb
- FOUND: 42e368d
- FOUND: 3338190
- FOUND: 9bd066e

---
*Phase: 04-cluster-pipeline-integrity*
*Completed: 2026-02-24*
