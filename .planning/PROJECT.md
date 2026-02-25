# Databricks Job Health & Monitoring Framework

## What This Is

An enterprise-grade monitoring and optimization framework for Databricks jobs that provides proactive visibility into job health, cost attribution, cluster efficiency, and data pipeline integrity. Built for a platform team serving 1000+ jobs across multiple business teams, with automated alerts, remediation suggestions, and tiered reporting.

**v1.0 shipped 2026-02-25** — Full-stack Databricks App with job health dashboard, cost attribution, alerting system, and scheduled reports.

## Core Value

Platform team can proactively identify job failures, SLA breaches, and cost anomalies before business users report them — shifting from reactive firefighting to proactive operations.

## Requirements

### Validated

**v1.0 (shipped 2026-02-25):**
- ✓ JOB-01: Track job success/failure rates over rolling 7-day and 30-day windows
- ✓ JOB-02: Alert on consecutive failures (2+ in a row triggers P1 priority)
- ✓ JOB-03: Monitor job duration and detect sudden increases vs historical baseline
- ✓ JOB-04: Track retry counts per job to surface silent cost inflation
- ✓ SLA-01: Define expected completion windows per job (SLA targets)
- ✓ SLA-02: Track SLA breach history for optimization prioritization
- ✓ SLA-03: Alert on SLA breach risk when job exceeds 80% of allowed window
- ✓ COST-01: Calculate DBU cost per job per run using system tables + pricing data
- ✓ COST-02: Attribute costs to teams/business units via job metadata mapping
- ✓ COST-03: Set budget thresholds per job with breach alerts
- ✓ COST-04: Detect sudden DBU spikes (>2x p90 baseline) as anomalies
- ✓ COST-05: Identify zombie jobs (scheduled but processing minimal/zero records)
- ✓ CLUST-01: Monitor driver/worker CPU and memory utilization per job
- ✓ CLUST-02: Flag jobs with sustained <40% utilization as over-provisioned
- ✓ PIPE-01: Check row count deltas vs historical baseline (+-20% threshold triggers alert)
- ✓ PIPE-02: Monitor for schema drift on source data and alert on detected changes
- ✓ ALERT-01: Display alerts in-app with severity levels (P1/P2/P3)
- ✓ ALERT-02: Include actionable remediation suggestions with each alert
- ✓ ALERT-03: Generate daily health summary (overnight failures, SLA breaches, action items)
- ✓ ALERT-04: Generate weekly cost report (per-team spend, trends, anomalies)
- ✓ ALERT-05: Generate monthly executive report (TCO, reliability metrics, optimization ROI)
- ✓ APP-01: Deploy as Databricks App with web UI
- ✓ APP-02: Authenticate users via Databricks workspace OAuth
- ✓ APP-03: Support filtering/drill-down by team, job, time range
- ✓ APP-04: Historical dashboard with 7/30/90-day views
- ✓ APP-05: Ingest data from Unity Catalog system tables (billing, compute, workflow)
- ✓ APP-06: Supplement with Jobs API for data not available in system tables

### Active

**v2 candidates (not yet prioritized):**
- [ ] CLUST-V2-01: Generate specific right-sizing recommendations (e.g., "reduce to 4 workers")
- [ ] CLUST-V2-02: Flag jobs on all-purpose clusters that should use job clusters
- [ ] ALERT-V2-01: Slack webhook integration for real-time alerts
- [ ] ALERT-V2-02: Email alerts direct to job owners (personalized)
- [ ] ALERT-V2-03: PagerDuty/OpsGenie integration for P1 escalation
- [ ] PIPE-V2-01: Validate input data arrival before job starts (prevent empty runs)

### Out of Scope

- PagerDuty/OpsGenie integration — Slack/Email sufficient for v1
- Automated remediation execution — suggestions only, human-in-loop
- External visualization (Datadog/Grafana) — Databricks-native only
- Real-time streaming metrics — batch analysis sufficient
- Mobile app — web dashboards only
- Per-minute granularity — hourly/run-level sufficient
- ML-based anomaly detection — statistical methods interpretable and sufficient
- Historical retention beyond 90 days — diminishing returns

## Context

**Current state (post v1.0):**
- ~10,500 LOC (TypeScript + Python)
- Tech stack: APX (FastAPI + React), TanStack Router/Query, Recharts, APScheduler
- 9 backend routers, 20+ UI components
- Deployed as Databricks App with OAuth

**Scale:** 1000+ jobs across organization

**Data sources:**
- Unity Catalog system tables: `system.billing`, `system.compute`, job run history
- Databricks Jobs API for real-time data and gaps not in system tables

**Consumers:**
- Platform team: Primary operators, full visibility and drill-down
- Business teams: Job owners receiving alerts and weekly reports
- Leadership: Monthly executive summaries

## Constraints

- **Tech stack:** Databricks App (full-stack web application deployed on Databricks)
- **App framework:** APX (FastAPI backend + React frontend)
- **Data layer:** Delta tables, Unity Catalog system tables
- **Authentication:** Databricks workspace OAuth (via Databricks Apps)
- **Alerting:** In-app + scheduled email (Slack/PagerDuty deferred to v2)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Databricks App vs SQL Dashboards | Full-stack app provides richer UX, custom interactions, better filtering/drill-down | ✓ Good — flexible UI enabled complex features |
| Databricks-native vs external stack | Simplifies deployment, uses existing compute, no data export needed | ✓ Good — zero external dependencies |
| System tables + API hybrid | System tables for standard metrics, API for gaps and real-time needs | ✓ Good — 5-15min latency acceptable |
| APX framework | FastAPI + React stack with OAuth built-in | ✓ Good — rapid development, type-safe |
| DBU consumption as utilization proxy | Direct CPU/memory not in system tables | ⚠️ Revisit — approximation, not precise |
| In-memory acknowledgments | No database persistence for alert acks (24h TTL) | ✓ Good — simple, sufficient for v1 |
| In-memory filter presets | MVP without Delta table storage | ⚠️ Revisit — persistence needed for production |
| APScheduler for reports | Async scheduler integrated with FastAPI lifespan | ✓ Good — reliable cron execution |

---
*Last updated: 2026-02-25 after v1.0 milestone*
