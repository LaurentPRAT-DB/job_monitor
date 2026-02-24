---
phase: 03-sla-cost-visibility
verified: 2026-02-24T21:15:00Z
status: passed
score: 6/6 must-haves verified
requirements_coverage:
  satisfied: [SLA-01, SLA-02, COST-01, COST-02, COST-04, COST-05]
  blocked: []
  orphaned: []
---

# Phase 3: SLA & Cost Visibility Verification Report

**Phase Goal:** Platform team can define SLA targets per job, track breach history, and see cost attribution by job and team
**Verified:** 2026-02-24T21:15:00Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Platform user can define expected completion window (SLA target) for any job | VERIFIED | `InlineSlaEdit` component in `job-health-row.tsx` with PATCH to `/api/jobs/{job_id}/tags` |
| 2 | SLA breach history is visible per job for optimization prioritization | VERIFIED | `SlaSparkline` component renders breach history in job health table |
| 3 | DBU cost per job per run is calculated and displayed | VERIFIED | `/api/costs/summary` endpoint in `cost.py` with RETRACTION handling |
| 4 | Costs are attributed to teams/business units via job metadata mapping | VERIFIED | Team rollup table in `costs.tsx`, team tags via Jobs API lookup |
| 5 | Jobs with sudden DBU spikes (>2x p90 baseline) are flagged as anomalies | VERIFIED | `is_anomaly` flag in `_parse_job_costs()`, anomalies tab in costs dashboard |
| 6 | Zombie jobs (scheduled but processing minimal records) are identified | VERIFIED | Zombie query in `/api/costs/anomalies` endpoint with run count thresholds |

**Score:** 6/6 truths verified

### Required Artifacts

#### Plan 03-01: Backend APIs

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `job_monitor/backend/routers/job_tags.py` | Job tag CRUD via Databricks Jobs API | VERIFIED | 200 lines, GET/PATCH endpoints, ws.jobs.get/update calls |
| `job_monitor/backend/routers/cost.py` | Cost aggregation with SKU breakdown | VERIFIED | 500 lines, summary/by-team/anomalies endpoints |
| `job_monitor/backend/config.py` | Tag key configuration and DBU rate | VERIFIED | Contains sla_tag_key, team_tag_key, owner_tag_key, dbu_rate |
| `job_monitor/backend/models.py` | Pydantic models for tags and costs | VERIFIED | TagUpdateRequest, JobCostOut, TeamCostOut, CostAnomalyOut present |

#### Plan 03-02: SLA UI Components

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `job_monitor/ui/components/sla-sparkline.tsx` | Compact breach history visualization | VERIFIED | 71 lines, Recharts LineChart with stepAfter type |
| `job_monitor/ui/components/inline-sla-edit.tsx` | Click-to-edit SLA target component | VERIFIED | 146 lines, useMutation with updateJobTags |
| `job_monitor/ui/components/job-health-row.tsx` | Updated row with SLA column | VERIFIED | Contains InlineSlaEdit and SlaSparkline imports |
| `job_monitor/ui/components/job-health-table.tsx` | SLA Target and Breach History columns | VERIFIED | Headers for SLA Target and Breach History present |

#### Plan 03-03: Costs Dashboard

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `job_monitor/ui/routes/_sidebar/costs.tsx` | Main costs dashboard page | VERIFIED | 248 lines, tabs for By Team/By Job/Anomalies |
| `job_monitor/ui/components/team-cost-table.tsx` | Sortable team cost rollup table | VERIFIED | 195 lines, sortable columns, Untagged highlighting |
| `job_monitor/ui/components/cost-breakdown.tsx` | Per-job costs with SKU visualization | VERIFIED | 254 lines, SkuBreakdownBar with tooltips |
| `job_monitor/ui/components/anomalies-tab.tsx` | Cost anomalies and zombie jobs display | VERIFIED | 175 lines, AnomalyTypeBadge, external link to job settings |
| `job_monitor/ui/lib/cost-utils.ts` | DBU/dollar formatting utilities | VERIFIED | Exports formatDBUs, formatCost, formatTrend, getTrendColor, SKU_COLORS |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `job_tags.py` | `databricks.sdk.service.jobs` | ws.jobs.get() and ws.jobs.update() | WIRED | Lines 100, 157, 183 confirm SDK calls |
| `cost.py` | `system.billing.usage` | SQL with RETRACTION handling | WIRED | `HAVING SUM(usage_quantity) != 0` at lines 207, 233 |
| `inline-sla-edit.tsx` | `/api/jobs/{job_id}/tags` | PATCH via TanStack Query | WIRED | useMutation at line 48 with updateJobTags |
| `sla-sparkline.tsx` | `recharts` | LineChart with stepAfter | WIRED | type="stepAfter" at line 53 |
| `costs.tsx` | `/api/costs/summary` | TanStack Query useQuery | WIRED | fetch('/api/costs/summary') at line 31 |
| `anomalies-tab.tsx` | `/api/costs/anomalies` | TanStack Query useQuery | WIRED | fetch('/api/costs/anomalies') at line 39 |
| Both routers | `app.py` | Router registration | WIRED | Lines 58-59 register job_tags and cost routers |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SLA-01 | 03-01, 03-02 | Define expected completion windows per job | SATISFIED | GET/PATCH `/api/jobs/{job_id}/tags`, InlineSlaEdit component |
| SLA-02 | 03-02 | Track SLA breach history for optimization prioritization | SATISFIED | SlaSparkline component shows breach history |
| COST-01 | 03-01, 03-03 | Calculate DBU cost per job using system tables + pricing data | SATISFIED | `/api/costs/summary` with SKU breakdown |
| COST-02 | 03-01, 03-03 | Attribute costs to teams via job metadata mapping | SATISFIED | Team rollup table, `_get_job_teams()` function |
| COST-04 | 03-01, 03-03 | Detect sudden DBU spikes (>2x p90 baseline) as anomalies | SATISFIED | `is_anomaly` flag, anomalies tab |
| COST-05 | 03-01, 03-03 | Identify zombie jobs (scheduled but processing minimal records) | SATISFIED | Zombie query in `/api/costs/anomalies` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | - | - | - |

No blocking anti-patterns found. The `return null` patterns in UI components are legitimate conditional rendering, not stubs.

### Human Verification Required

#### 1. SLA Inline Edit Flow

**Test:** Click the pencil icon next to a job's SLA value, enter a new SLA target, and save
**Expected:** Value updates, job tags are modified in Databricks, refetch shows new SLA
**Why human:** Requires live Databricks workspace connection and visual confirmation

#### 2. Cost Dashboard DBU/Dollar Toggle

**Test:** Click "Show $" button on costs page (requires dbu_rate > 0 in config)
**Expected:** All cost values switch from DBU to dollar format
**Why human:** Requires configured dbu_rate and visual confirmation of format change

#### 3. Anomaly Link Navigation

**Test:** Click "View Settings" button on a cost anomaly row
**Expected:** Opens Databricks job settings page in new tab
**Why human:** Requires valid Databricks session and external navigation

#### 4. Breach Sparkline Visualization

**Test:** View a job with SLA breaches in the job health table
**Expected:** Red sparkline showing step pattern, breach count badge
**Why human:** Requires jobs with breach history and visual pattern confirmation

### Gaps Summary

No gaps found. All success criteria from ROADMAP.md are satisfied:

1. Platform user can define expected completion window (SLA target) for any job - **InlineSlaEdit component**
2. SLA breach history is visible per job for optimization prioritization - **SlaSparkline component**
3. DBU cost per job per run is calculated and displayed - **costs/summary endpoint**
4. Costs are attributed to teams/business units via job metadata mapping - **team rollup in costs dashboard**
5. Jobs with sudden DBU spikes (>2x p90 baseline) are flagged as anomalies - **anomalies tab**
6. Zombie jobs (scheduled but processing minimal records) are identified - **zombie query in anomalies**

---

_Verified: 2026-02-24T21:15:00Z_
_Verifier: Claude (gsd-verifier)_
