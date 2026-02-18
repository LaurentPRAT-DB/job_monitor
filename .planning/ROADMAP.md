# Roadmap: Databricks Job Health & Monitoring Framework

## Overview

This roadmap transforms requirements into a monitoring framework that shifts platform operations from reactive to proactive. We start by establishing the Databricks App foundation and data ingestion from Unity Catalog system tables (Phase 1), then build job health tracking as the core monitoring capability (Phase 2). SLA and cost visibility follow (Phase 3), enabling business-relevant metrics. Cluster efficiency and data pipeline integrity add advanced monitoring (Phase 4). Alerting and remediation suggestions make the system proactive rather than passive (Phase 5). Finally, dashboards and reporting deliver the polished user experience with filtering, drill-down, and scheduled reports (Phase 6).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Data Ingestion** - Databricks App scaffold with APX, OAuth auth, system table access
- [ ] **Phase 2: Job Health Monitoring** - Success/failure tracking, duration analysis, retry detection
- [ ] **Phase 3: SLA & Cost Visibility** - SLA target definition, breach history, cost per job, team attribution
- [ ] **Phase 4: Cluster & Pipeline Integrity** - Resource utilization monitoring, row count validation, schema drift detection
- [ ] **Phase 5: Alerting & Remediation** - In-app alerts with severity levels, actionable suggestions, proactive warnings
- [ ] **Phase 6: Dashboards & Reporting** - Filtering/drill-down, historical views, daily/weekly/monthly reports

## Phase Details

### Phase 1: Foundation & Data Ingestion
**Goal**: Platform team can access a running Databricks App that authenticates users and ingests data from Unity Catalog system tables
**Depends on**: Nothing (first phase)
**Requirements**: APP-01, APP-02, APP-05, APP-06
**Success Criteria** (what must be TRUE):
  1. App deploys successfully to Databricks workspace and is accessible via URL
  2. User authenticates via Databricks OAuth and sees their identity displayed
  3. App queries system.billing and system.lakeflow tables and returns data
  4. App calls Jobs API and retrieves job metadata not available in system tables
  5. Data ingestion handles SCD2 semantics correctly (latest record per job)
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — APX scaffold with OAuth authentication and user identity display
- [ ] 01-02-PLAN.md — System tables ingestion (jobs, billing) with SCD2/RETRACTION handling
- [ ] 01-03-PLAN.md — Jobs API integration for real-time data + deployment verification

### Phase 2: Job Health Monitoring
**Goal**: Platform team can view job success/failure rates, duration trends, and retry patterns for all monitored jobs
**Depends on**: Phase 1
**Requirements**: JOB-01, JOB-02, JOB-03, JOB-04
**Success Criteria** (what must be TRUE):
  1. Platform user can view success/failure rate for any job over 7-day and 30-day windows
  2. Jobs with 2+ consecutive failures are flagged with P1 priority indicator
  3. Platform user can see job duration trend and identify sudden increases vs baseline
  4. Retry counts per job are visible, highlighting jobs with silent cost inflation
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: SLA & Cost Visibility
**Goal**: Platform team can define SLA targets per job, track breach history, and see cost attribution by job and team
**Depends on**: Phase 2
**Requirements**: SLA-01, SLA-02, COST-01, COST-02, COST-04, COST-05
**Success Criteria** (what must be TRUE):
  1. Platform user can define expected completion window (SLA target) for any job
  2. SLA breach history is visible per job for optimization prioritization
  3. DBU cost per job per run is calculated and displayed (handles RETRACTION records)
  4. Costs are attributed to teams/business units via job metadata mapping
  5. Jobs with sudden DBU spikes (>2x p90 baseline) are flagged as anomalies
  6. Zombie jobs (scheduled but processing minimal records) are identified
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: Cluster & Pipeline Integrity
**Goal**: Platform team can identify over-provisioned clusters and detect data quality issues before they cascade
**Depends on**: Phase 3
**Requirements**: CLUST-01, CLUST-02, PIPE-01, PIPE-02
**Success Criteria** (what must be TRUE):
  1. Driver and worker CPU/memory utilization is visible per job run
  2. Jobs with sustained <40% utilization are flagged as over-provisioned candidates
  3. Row count deltas vs historical baseline are tracked (alert on +/-20% deviation)
  4. Schema drift on source data is detected and alerts are generated
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Alerting & Remediation
**Goal**: Platform team receives proactive alerts with actionable recommendations before issues impact business users
**Depends on**: Phase 4
**Requirements**: ALERT-01, ALERT-02, SLA-03, COST-03
**Success Criteria** (what must be TRUE):
  1. Alerts display in-app with severity levels (P1/P2/P3) and clear categorization
  2. Each alert includes actionable remediation suggestions (not just problem statement)
  3. SLA breach risk alert fires when job exceeds 80% of allowed window (proactive)
  4. Budget threshold alerts fire when job cost approaches or exceeds defined limit
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Dashboards & Reporting
**Goal**: All user personas (platform ops, business teams, leadership) can access tailored views with appropriate filtering and scheduled reports
**Depends on**: Phase 5
**Requirements**: APP-03, APP-04, ALERT-03, ALERT-04, ALERT-05
**Success Criteria** (what must be TRUE):
  1. Platform user can filter/drill-down by team, job, and time range
  2. Historical dashboard shows 7/30/90-day views with trend visualization
  3. Daily health summary report generates automatically (overnight failures, SLA breaches, actions)
  4. Weekly cost report generates automatically (per-team spend, trends, anomalies)
  5. Monthly executive report generates automatically (TCO, reliability metrics, optimization ROI)
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Data Ingestion | 0/3 | Planned | - |
| 2. Job Health Monitoring | 0/3 | Not started | - |
| 3. SLA & Cost Visibility | 0/3 | Not started | - |
| 4. Cluster & Pipeline Integrity | 0/2 | Not started | - |
| 5. Alerting & Remediation | 0/3 | Not started | - |
| 6. Dashboards & Reporting | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-18*
*Last updated: 2026-02-18*
