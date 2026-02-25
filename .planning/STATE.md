# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Platform team can proactively identify job failures, SLA breaches, and cost anomalies before business users report them
**Current focus:** Phase 5 - Alerting & Remediation

## Current Position

Phase: 5 of 6 (Alerting & Remediation)
Plan: 3 of 3 in current phase
Status: Phase Complete
Last activity: 2026-02-25 -- Plan 05-03 complete (Alerts Page & Job Row Indicators)

Progress: [########..] 88%

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: 4m
- Total execution time: 0.87 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | 7m 56s | 2m 39s |
| 02 | 3 | 21m 33s | 7m 11s |
| 03 | 3 | 14m | 4m 40s |
| 04 | 3 | 9m | 3m |
| 05 | 3 | 12m | 4m |

**Recent Trend:**
- Last 5 plans: 04-02 (3m), 04-03 (3m), 05-01 (3m), 05-02 (4m), 05-03 (5m)
- Trend: Progressing

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- 01-01: Used hatchling as build backend for modern Python packaging
- 01-01: JWT token decoded client-side to extract user email from OBO token
- 01-01: OAuth scopes: sql:* and compute.clusters:read for system table access
- 01-02: SCD2 pattern uses ROW_NUMBER OVER PARTITION BY workspace_id, job_id ORDER BY change_time DESC
- 01-02: RETRACTION handling via HAVING SUM(usage_quantity) != 0 excludes fully retracted billing items
- 01-03: Jobs API endpoints provide real-time data supplementing 5-15min latency system tables
- 02-01: P3 priority assigned to jobs in yellow zone (70-89% success rate)
- 02-01: Retry detection uses same-day multiple runs as heuristic
- 02-01: Status computed from success_rate using Pydantic computed_field
- 02-02: PERCENTILE_CONT(0.5) and PERCENTILE_CONT(0.9) for median/p90 calculations
- 02-02: Anomaly threshold: duration > 2x 30-day median baseline
- 02-02: asyncio.gather for parallel SQL queries in expanded details endpoint
- 02-03: STATUS_THRESHOLDS: green >= 90%, yellow 70-89%, red < 70%
- 02-03: 5-minute stale time for health metrics queries (matches system table latency)
- 02-03: Problem-first sorting: P1 > P2 > P3 > healthy jobs
- 02-03: Traffic light pattern: colored dot + percentage for status visualization
- 03-01: SLA targets stored in Databricks job tags (native key-value on job settings)
- 03-01: SKU categorization: Jobs Compute, All-Purpose, SQL Warehouse, Serverless, Other
- 03-01: Cost spike threshold: >2x p90 baseline for anomaly flagging
- 03-01: Zombie job detection: >10 DBUs with <100 rows over 30 days
- 03-02: Recharts LineChart with stepAfter type for breach visualization
- 03-02: Breach sparkline hidden on mobile for responsive design
- 03-02: Red indicator dot shown when last run breached SLA
- 03-02: P90 suggestion shown as placeholder in edit mode, not pre-populated
- 03-03: SKU breakdown shown as mini horizontal bar with tooltip for details
- 03-03: Untagged teams/jobs highlighted with amber warning color
- 03-03: Dollar toggle disabled when dbu_rate not configured
- 04-01: DBU consumption proxy for utilization metrics (direct CPU/memory not in system tables)
- 04-01: Heuristic mapping: <1 DBU/hr = ~20%, 1-2 = ~40%, 2-4 = ~60%, >4 = ~80% utilization
- 04-01: Over-provisioned flag only when ALL analyzed runs show <40% utilization
- 04-01: output_tables job tag for job-to-table mapping in pipeline integrity
- 04-01: 20% threshold for row count anomaly detection
- [Phase 04]: 04-02: Inverted traffic light coloring (Green >= 60% efficient, Red < 40% wasteful)
- [Phase 04]: 04-02: 4 separate gauges for Driver CPU, Driver Memory, Worker CPU, Worker Memory
- [Phase 04]: 04-02: OverProvisionedBadge uses orange color scheme distinct from P1/P2/P3 badges
- [Phase 04]: 04-03: Schema drift shown first in pipeline section (more urgent than row counts)
- [Phase 04]: 04-03: Mini sparkline hidden when trend has <2 data points
- [Phase 04]: 04-03: Table name truncated to last segment with full path in subtitle
- [Phase 05]: 05-01: In-memory acknowledgment with 24h TTL (no database persistence needed)
- [Phase 05]: 05-01: Alert ID format: {category}_{job_id}_{type} for uniqueness
- [Phase 05]: 05-01: asyncio.gather for parallel alert generation from all 4 sources
- [Phase 05]: 05-01: Severity-based deduplication when same condition generates multiple alerts
- [Phase 05]: 05-02: 60-second polling interval for alert refresh
- [Phase 05]: 05-02: Toast notifications only on subsequent fetches (not initial load)
- [Phase 05]: 05-02: P1/P2 toast durations: 10s/5s respectively
- [Phase 05]: 05-02: Optimistic UI updates for acknowledge action
- [Phase 05]: 05-03: Alerts page shows severity sections (Critical/Warning/Info) for visual hierarchy
- [Phase 05]: 05-03: Category filter tabs allow focused view by alert type
- [Phase 05]: 05-03: AlertIndicator uses bell icon with count, colored by highest severity
- [Phase 05]: 05-03: Alerts fetched at table level (not per-row) to avoid N+1 queries

### Pending Todos

None yet.

### Blockers/Concerns

Research flags from .planning/research/SUMMARY.md:
- Phase 1: System table schema verification required (run SHOW TABLES IN system.lakeflow)
- Phase 4: Jobs API rate limits need verification for hybrid alert approach
- Phase 5: Node timeline limitations for short-running clusters need documentation review

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 05-03-PLAN.md (Alerts Page & Job Row Indicators) - Phase 5 Complete
Resume file: .planning/phases/05-alerting-remediation/05-03-SUMMARY.md
