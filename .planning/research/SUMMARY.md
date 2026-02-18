# Project Research Summary

**Project:** Databricks Job Monitoring & Optimization Framework
**Domain:** Enterprise Platform Operations / Observability
**Researched:** 2026-02-18
**Confidence:** MEDIUM

## Executive Summary

This is a Databricks-native monitoring and optimization framework designed for platform teams managing 1000+ jobs. The expert approach is clear: use Unity Catalog system tables as the primary data source (not API polling), implement a medallion architecture (bronze/silver/gold Delta layers), and leverage Databricks SQL Dashboards and Alerts for visualization and notification. External tools like Grafana or Datadog add unnecessary complexity since all data already lives in Databricks.

The recommended approach prioritizes foundation over features. Start by validating system table access and establishing correct query patterns (especially for SCD2 tables and billing record corrections). Build the transformation layer before any dashboards. This sequence prevents the most common pitfall: building dashboards that query system tables directly, which fails catastrophically at scale. The medallion architecture with pre-aggregated Gold tables is non-negotiable for 1000+ jobs.

Key risks center on data quality blind spots, not technical complexity. Cost attribution fails silently for jobs on all-purpose clusters (job_id is only populated for job compute). System table latency (5-15 minutes) means alerts fire on stale data unless explicitly designed for this. Static thresholds generate alert fatigue at scale; implement tiered alerting with per-job baselines from the start. Billing queries must handle RETRACTION records to avoid inflated cost reports. These are not edge cases; they affect most enterprise deployments.

## Key Findings

### Recommended Stack

Use Databricks-native stack exclusively. Delta Lake for storage provides ACID transactions and time travel. Unity Catalog system tables (`system.billing`, `system.compute`, `system.lakeflow`) provide job, cluster, and cost metrics without API polling. Databricks SQL (Serverless recommended) for queries. Databricks SQL Dashboards and Alerts for visualization and notifications.

**Core technologies:**
- **Delta Lake**: All metric storage — ACID transactions, time travel, optimized for Spark. Native to Databricks.
- **Unity Catalog System Tables**: Primary data source — job runs, billing, cluster data without API polling.
- **Databricks SQL Serverless**: Query engine — sub-second queries on Delta tables, auto-scaling.
- **Databricks SQL Dashboards**: Visualization — native integration, no data export, scheduled refresh.
- **Databricks SQL Alerts**: Notifications — direct Slack/Email integration, SQL-based conditions.
- **Databricks Asset Bundles (DABs)**: CI/CD — YAML-based config for jobs, queries, dashboards.

**What NOT to use:**
- All-purpose clusters for queries (10x cost vs SQL Warehouse)
- External ETL tools (data already in Databricks)
- External dashboards (adds latency and cost)
- Jobs API as primary data source (use system tables; API for gaps only)

### Expected Features

**Must have (table stakes):**
- Job success/failure tracking — foundation for all monitoring
- Alert on job failure (Slack integration) — core value proposition
- Consecutive failure detection — 2+ failures = real problem, reduces noise
- Job duration metrics + SLA adherence — key requirement for platform teams
- Basic cost per job — always requested
- Historical dashboard (7/30 day) — need trends, not just current state
- Filtering by team/owner — multi-team environments require scoping

**Should have (competitive):**
- Proactive SLA breach prediction — alert at 80% of window, not after breach
- Cluster utilization + right-sizing recommendations — high value optimization
- Cost attribution by business unit — chargeback/showback for finance
- Anomaly detection (statistical) — catch issues without manual threshold tuning
- Weekly/monthly reports — after daily operations working

**Defer (v2+):**
- Data pipeline integrity (schema drift, row counts) — requires additional Delta table access
- Cross-job dependency visualization — complex DAG extraction
- Photon/GPU upgrade recommendations — specialized analysis
- Real-time streaming metrics — 5-15 minute batch covers 95% of use cases at 10% complexity
- Custom ML for anomalies — simple statistical methods are sufficient and interpretable

### Architecture Approach

Implement a four-layer medallion architecture: System Tables (raw data source) to Bronze (copies/views if needed) to Silver (cleaned, enriched, deduplicated) to Gold (pre-aggregated for dashboard performance). Dashboards and alerts consume only from Gold layer. This is the canonical Databricks pattern and non-negotiable for scale.

**Major components:**
1. **Ingestion Layer (Bronze)** — System table access, Jobs API collector for gaps, raw data capture
2. **Transformation Layer (Silver)** — Job runs enriched with metadata, cost allocation to teams, failure classification, cluster efficiency calculations
3. **Aggregation Layer (Gold)** — Daily/weekly rollups, SLA compliance metrics, trend analysis, materialized views for dashboard performance
4. **Presentation Layer** — Dashboards (platform ops, team reports, executive views), Alerts (Slack webhooks, email), Reports (scheduled delivery)

**Key patterns:**
- Incremental processing with Change Data Feed (not full table refresh)
- Partition by date on all tables for query performance
- Use Databricks Workflows for orchestration with task dependencies
- Separate jobs/tasks for each transformation stage (not monolithic scripts)

### Critical Pitfalls

1. **Cost attribution blindspot for all-purpose compute** — `usage_metadata.job_id` only populated for job compute and serverless. Enforce dedicated job clusters for production via workspace policies. Track "cost-attributable coverage" as an SLA metric.

2. **System table data latency mismatch** — System tables have 5-15 minute lag. Design alerts with explicit latency acknowledgment. Use Jobs API for time-sensitive alerting on critical jobs only. Monitor streaming queries to prevent falling behind 7-day VACUUM window.

3. **Alert fatigue from static thresholds** — Universal thresholds fail at 1000+ jobs. Implement tiered alerting (P1/P2/P3 job classification), per-job baseline comparisons (alert when duration > p90 of last 7 days), and consecutive failure requirements for non-critical jobs.

4. **Incorrect DBU cost calculations** — `system.billing.usage` has RETRACTION records with negative values. Always use `SUM(usage_quantity)` with `HAVING SUM(usage_quantity) != 0`. Cross-validate against actual billing monthly.

5. **SCD2 table semantics misunderstanding** — `system.lakeflow.jobs` emits new rows on config changes. Always use `ROW_NUMBER() OVER(PARTITION BY workspace_id, job_id ORDER BY change_time DESC) ... QUALIFY rn=1` pattern. Jobs not modified in 365 days disappear.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation & Data Layer
**Rationale:** Everything depends on data access. Validate assumptions early. Correct query patterns must be established before anything is built on top.
**Delivers:** Verified system table access, Bronze layer setup, correct SCD2 query patterns, billing aggregation patterns with RETRACTION handling, Jobs API collector for gap data.
**Addresses:** Job success/failure tracking foundation, basic data ingestion
**Avoids:** Cost attribution blindspot, SCD2 semantics errors, billing calculation errors
**Research needed:** Verify current system table schemas with `SHOW TABLES IN system.lakeflow`

### Phase 2: Core Transformation (Silver Layer)
**Rationale:** Silver layer provides the cleaned, enriched data that all analytics depend on. Cannot build reliable dashboards or alerts without this foundation.
**Delivers:** Job runs enriched with metadata, cost allocation to teams/projects, failure classification, cluster efficiency calculations.
**Uses:** Delta Lake with Change Data Feed, incremental merge patterns
**Implements:** Silver transformation layer from architecture
**Avoids:** Full table refresh anti-pattern, performance issues at scale

### Phase 3: Analytics Layer (Gold) & Core Dashboards
**Rationale:** Gold layer enables dashboard performance. Build dashboards and core metrics together so they're tested as a unit.
**Delivers:** Daily/weekly job summary aggregations, SLA compliance calculations, trend analysis tables, core platform ops dashboard, job details drill-down.
**Addresses:** Historical run dashboard, per-job status view, filtering by team/owner, basic cost visibility
**Avoids:** Querying system tables directly from dashboards (critical anti-pattern)

### Phase 4: Alerting & Notifications
**Rationale:** Alerts must consume from stable Gold layer. Building alerts before dashboards risks alert fatigue without visibility into what's being alerted on.
**Delivers:** Job failure alerts (Slack), consecutive failure detection, SLA breach alerts, cost anomaly alerts.
**Addresses:** Alert on job failure, consecutive failure detection, Slack integration
**Avoids:** Alert fatigue from static thresholds (build tiered alerting from start), system table latency mismatch (document expected latency in alert design)

### Phase 5: Optimization & Advanced Features
**Rationale:** Optimization should follow working baseline. Advanced features require stable data and user adoption of core features.
**Delivers:** Cluster utilization reporting, right-sizing recommendations, proactive SLA prediction, anomaly detection.
**Addresses:** Cluster utilization summary, right-sizing recommendations, proactive SLA breach prediction, anomaly detection
**Avoids:** Node timeline gaps for short-running nodes (acknowledge limitation in utilization metrics)

### Phase 6: Cost Attribution & Reporting
**Rationale:** Cost attribution requires organizational work (team mapping metadata) that can proceed in parallel with core feature adoption.
**Delivers:** Cost attribution by business unit, executive cost reporting, budget threshold alerts, weekly/monthly automated reports.
**Addresses:** Cost attribution by team, executive cost reporting, budget thresholds
**Avoids:** Cost attribution blindspot (track coverage metric, flag unattributable spend)

### Phase Ordering Rationale

- **Data foundation before features:** Research shows most pitfalls are data quality issues (SCD2, RETRACTION records, cost attribution). Fix these in the data layer before building anything visible.
- **Gold layer before dashboards:** Architecture research is emphatic: querying system tables directly from dashboards is an anti-pattern that breaks at scale. Build aggregation first.
- **Dashboards before alerts:** Alerts without dashboard visibility leads to alert fatigue because teams can't see context. Build visibility first.
- **Optimization after baseline:** Right-sizing and anomaly detection require historical data and stable baselines. These features improve over time with data accumulation.
- **Cost attribution can be delayed:** While important, cost attribution requires organizational metadata (team mapping) that takes time. Core monitoring delivers value without it.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Foundation):** System table schema verification required — run `SHOW TABLES IN system.lakeflow` and `SHOW SCHEMAS IN system` to confirm current availability. Schema names may have evolved.
- **Phase 4 (Alerting):** Jobs API rate limits and latency characteristics for hybrid alert approach. Exact limits vary by account tier.
- **Phase 5 (Optimization):** Node timeline limitations need documentation review for short-running cluster behavior.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Silver Layer):** Medallion architecture is well-documented Databricks pattern with extensive examples.
- **Phase 3 (Gold/Dashboards):** SQL aggregations and dashboard creation are standard Databricks SQL workflows.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Databricks-native stack is clearly the right choice; well-documented, no external dependencies |
| Features | MEDIUM | Feature prioritization based on training data; verify actual user needs during requirements |
| Architecture | MEDIUM | Medallion architecture is canonical, but system table schemas should be verified against current docs |
| Pitfalls | HIGH | Pitfalls verified against official Databricks documentation (Feb 2026); limitations are explicitly documented |

**Overall confidence:** MEDIUM

### Gaps to Address

- **System table schema verification:** Run `SHOW SCHEMAS IN system` and `SHOW TABLES IN system.lakeflow` before implementation. Schema names based on training data.
- **SQL Serverless availability:** Confirm enabled for target workspace. Cannot use with HMS-only workspaces.
- **Multi-region scope:** If deployment spans regions, most system tables are regional. Need explicit handling.
- **Asset Bundles YAML schema:** Rapidly evolving. Verify current schema at docs.databricks.com before CI/CD implementation.
- **Slack webhook integration:** Test native SQL Alert Slack integration before building custom webhook infrastructure.

## Sources

### Primary (HIGH confidence)
- Databricks Official Documentation - System Tables Overview — billing, compute, access table schemas
- Databricks Official Documentation - Billable Usage System Table Reference — RETRACTION handling, job_id attribution
- Databricks Official Documentation - Jobs System Table Reference — SCD2 semantics, 365-day retention
- Databricks Official Documentation - Compute System Tables Reference — node timeline limitations

### Secondary (MEDIUM confidence)
- Databricks documentation (training data, May 2025 cutoff) — stack recommendations, medallion architecture patterns
- Delta Lake best practices — incremental processing, Change Data Feed patterns

### Tertiary (LOW confidence)
- SQL Serverless pricing — verify current rates, pricing models change
- Asset Bundles YAML schema — rapidly evolving, verify current documentation

---
*Research completed: 2026-02-18*
*Ready for roadmap: yes*
