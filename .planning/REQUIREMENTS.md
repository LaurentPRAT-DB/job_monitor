# Requirements: Databricks Job Health & Monitoring Framework

**Defined:** 2026-02-18
**Core Value:** Platform team can proactively identify job failures, SLA breaches, and cost anomalies before business users report them

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Job Health

- [ ] **JOB-01**: Track job success/failure rates over rolling 7-day and 30-day windows
- [ ] **JOB-02**: Alert on consecutive failures (2+ in a row triggers P1 priority)
- [ ] **JOB-03**: Monitor job duration and detect sudden increases vs historical baseline
- [ ] **JOB-04**: Track retry counts per job to surface silent cost inflation

### SLA Monitoring

- [ ] **SLA-01**: Define expected completion windows per job (SLA targets)
- [ ] **SLA-02**: Track SLA breach history for optimization prioritization
- [ ] **SLA-03**: Alert on SLA breach risk when job exceeds 80% of allowed window (proactive prediction)

### Cost Attribution

- [ ] **COST-01**: Calculate DBU cost per job per run using system tables + pricing data
- [ ] **COST-02**: Attribute costs to teams/business units via job metadata mapping
- [ ] **COST-03**: Set budget thresholds per job with breach alerts
- [ ] **COST-04**: Detect sudden DBU spikes (>2x p90 baseline) as anomalies
- [ ] **COST-05**: Identify zombie jobs (scheduled but processing minimal/zero records)

### Cluster Efficiency

- [ ] **CLUST-01**: Monitor driver/worker CPU and memory utilization per job
- [ ] **CLUST-02**: Flag jobs with sustained <40% utilization as over-provisioned

### Data Pipeline Integrity

- [ ] **PIPE-01**: Check row count deltas vs historical baseline (+-20% threshold triggers alert)
- [ ] **PIPE-02**: Monitor for schema drift on source data and alert on detected changes

### Alerting & Delivery

- [ ] **ALERT-01**: Display alerts in-app with severity levels (P1/P2/P3)
- [ ] **ALERT-02**: Include actionable remediation suggestions with each alert
- [ ] **ALERT-03**: Generate daily health summary (overnight failures, SLA breaches, action items)
- [ ] **ALERT-04**: Generate weekly cost report (per-team spend, trends, anomalies)
- [ ] **ALERT-05**: Generate monthly executive report (TCO, reliability metrics, optimization ROI)

### Application Infrastructure

- [ ] **APP-01**: Deploy as Databricks App with web UI
- [ ] **APP-02**: Authenticate users via Databricks workspace OAuth
- [ ] **APP-03**: Support filtering/drill-down by team, job, time range
- [ ] **APP-04**: Historical dashboard with 7/30/90-day views
- [ ] **APP-05**: Ingest data from Unity Catalog system tables (billing, compute, workflow)
- [ ] **APP-06**: Supplement with Jobs API for data not available in system tables

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Cluster Optimization

- **CLUST-V2-01**: Generate specific right-sizing recommendations (e.g., "reduce to 4 workers")
- **CLUST-V2-02**: Flag jobs on all-purpose clusters that should use job clusters
- **CLUST-V2-03**: Verify autoscaling is enabled and exercised (min != max usage)
- **CLUST-V2-04**: Detect jobs maxing out cluster ceiling (resize candidates)
- **CLUST-V2-05**: Monitor spot/preemptible interruption rates (>10% = instability risk)
- **CLUST-V2-06**: Identify Standard cluster jobs that could use Photon
- **CLUST-V2-07**: Flag long-running ML jobs as GPU candidates

### Data Pipeline Advanced

- **PIPE-V2-01**: Validate input data arrival before job starts (prevent empty runs)
- **PIPE-V2-02**: Track OPTIMIZE and VACUUM frequency per Delta table
- **PIPE-V2-03**: Monitor file count growth (small files detection)
- **PIPE-V2-04**: Alert on Z-ORDER skew or missing partitioning on high-scan tables

### External Alerting

- **ALERT-V2-01**: Slack webhook integration for real-time alerts
- **ALERT-V2-02**: Email alerts direct to job owners
- **ALERT-V2-03**: PagerDuty/OpsGenie integration for P1 escalation

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time streaming metrics | Adds complexity; 5-15 min batch latency sufficient for job monitoring |
| Automated remediation execution | Risk of runaway automation; suggestions only, human-in-loop for v1 |
| External visualization (Datadog/Grafana) | Databricks App provides native UI; no data export complexity |
| Mobile app | Web app accessible on mobile; dedicated app not needed |
| Per-minute granularity | Storage explosion; hourly/run-level granularity sufficient |
| ML-based anomaly detection | Statistical methods (percentile deviation) are interpretable and sufficient |
| Historical retention beyond 90 days | Diminishing returns; 90-day detailed + monthly aggregates for trends |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| JOB-01 | Phase 2 | Pending |
| JOB-02 | Phase 2 | Pending |
| JOB-03 | Phase 2 | Pending |
| JOB-04 | Phase 2 | Pending |
| SLA-01 | Phase 3 | Pending |
| SLA-02 | Phase 3 | Pending |
| SLA-03 | Phase 5 | Pending |
| COST-01 | Phase 3 | Pending |
| COST-02 | Phase 3 | Pending |
| COST-03 | Phase 5 | Pending |
| COST-04 | Phase 3 | Pending |
| COST-05 | Phase 3 | Pending |
| CLUST-01 | Phase 4 | Pending |
| CLUST-02 | Phase 4 | Pending |
| PIPE-01 | Phase 4 | Pending |
| PIPE-02 | Phase 4 | Pending |
| ALERT-01 | Phase 5 | Pending |
| ALERT-02 | Phase 5 | Pending |
| ALERT-03 | Phase 6 | Pending |
| ALERT-04 | Phase 6 | Pending |
| ALERT-05 | Phase 6 | Pending |
| APP-01 | Phase 1 | Pending |
| APP-02 | Phase 1 | Pending |
| APP-03 | Phase 6 | Pending |
| APP-04 | Phase 6 | Pending |
| APP-05 | Phase 1 | Pending |
| APP-06 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after roadmap creation*
