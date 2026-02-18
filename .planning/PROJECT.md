# Databricks Job Health & Monitoring Framework

## What This Is

An enterprise-grade monitoring and optimization framework for Databricks jobs that provides proactive visibility into job health, cost attribution, cluster efficiency, and data pipeline integrity. Built for a platform team serving 1000+ jobs across multiple business teams, with automated alerts, remediation suggestions, and tiered reporting.

## Core Value

Platform team can proactively identify job failures, SLA breaches, and cost anomalies before business users report them — shifting from reactive firefighting to proactive operations.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Job Execution Health:**
- [ ] Track success/failure rates per job over rolling 7/30-day windows
- [ ] Alert on consecutive failures (2+ in a row triggers P1)
- [ ] Monitor job duration trends for sudden increases
- [ ] Track retry counts to surface silent cost inflation
- [ ] Define expected completion windows per job (SLA targets)
- [ ] Alert on SLA breach risk when job exceeds 80% of allowed window
- [ ] Track SLA breach history for optimization prioritization

**Cluster & Resource Efficiency:**
- [ ] Monitor driver/worker CPU/memory utilization (flag <40% sustained)
- [ ] Track shuffle read/write ratios for inefficient joins/partitioning
- [ ] Flag jobs on all-purpose clusters that should use job clusters
- [ ] Verify autoscaling is enabled and exercised (min ≠ max usage)
- [ ] Detect jobs maxing out cluster ceiling (resize candidates)
- [ ] Monitor spot/preemptible interruption rates (>10% = instability risk)
- [ ] Identify Standard cluster jobs that could use Photon
- [ ] Flag long-running ML jobs as GPU candidates
- [ ] Track DBU consumption per job run for cost outliers

**Data Pipeline Integrity:**
- [ ] Validate input data arrival before job starts
- [ ] Check row count deltas vs historical baseline (±20% threshold)
- [ ] Monitor for schema drift on source data
- [ ] Track OPTIMIZE and VACUUM frequency per Delta table
- [ ] Monitor file count growth (small files detection)
- [ ] Alert on Z-ORDER skew or missing partitioning on high-scan tables

**Cost Attribution & Anomaly Detection:**
- [ ] Calculate DBU cost per job per run
- [ ] Set budget thresholds per job with breach alerts
- [ ] Compare cost per unit of output over time
- [ ] Detect sudden DBU spikes (>2x p90 baseline)
- [ ] Identify zombie jobs (scheduled but minimal work)
- [ ] Flag orphaned clusters (manual start, never terminated)

**Alerting & Reporting:**
- [ ] Slack integration for alerts (channel per team or centralized)
- [ ] Email alerts direct to job owners
- [ ] Daily health summary report (overnight failures, SLA breaches, actions needed)
- [ ] Weekly cost report (per-team/job spend, trends, anomalies)
- [ ] Monthly executive report (TCO, reliability metrics, optimization ROI)

**Remediation Suggestions:**
- [ ] Surface actionable recommendations with alerts (not just problems)
- [ ] Prioritize suggestions by cost/reliability impact

### Out of Scope

- PagerDuty/OpsGenie integration — Slack/Email sufficient for v1
- Automated remediation execution — suggestions only, human-in-loop
- External visualization (Datadog/Grafana) — Databricks-native only
- Real-time streaming metrics — batch analysis sufficient for v1
- Mobile app — web dashboards only

## Context

**Scale:** 1000+ jobs across organization
**Current state:** Basic dashboards exist but coverage is incomplete, team is reactive
**Environment:** Unity Catalog enabled workspace

**Data sources:**
- Unity Catalog system tables: `system.billing`, `system.compute`, job run history
- Databricks Jobs API for gaps not covered by system tables

**Consumers:**
- Platform team: Primary operators, need full visibility and drill-down
- Business teams: Job owners receiving alerts and weekly reports
- Leadership: Monthly executive summaries

## Constraints

- **Tech stack:** Databricks App (full-stack web application deployed on Databricks)
- **App framework:** APX (FastAPI backend + React frontend) — https://github.com/databricks-solutions/apx
- **Data layer:** Delta tables, Unity Catalog system tables
- **Data access:** Unity Catalog system tables enabled
- **Authentication:** Databricks workspace OAuth (via Databricks Apps)
- **Alerting:** Slack webhooks + Email (no PagerDuty/OpsGenie for v1)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Databricks App vs SQL Dashboards | Full-stack app provides richer UX, custom interactions, better filtering/drill-down than SQL dashboards alone | — Pending |
| Databricks-native vs external stack | Simplifies deployment, uses existing compute, no data export needed | — Pending |
| System tables + API hybrid | System tables for standard metrics, API for gaps and real-time needs | — Pending |
| Job Health as Phase 1 priority | Foundation for all other monitoring, highest immediate value | — Pending |
| Full automation for v1 | Platform team needs alerts + suggestions, not just dashboards | — Pending |

---
*Last updated: 2026-02-18 after initialization*
