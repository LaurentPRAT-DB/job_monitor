# Stack Research: Databricks Job Monitoring & Optimization Framework

**Domain:** Enterprise Databricks Monitoring (Platform Operations)
**Researched:** 2026-02-18
**Confidence:** MEDIUM (training data based — verify current versions against docs.databricks.com)

## Executive Stack Recommendation

**Use Databricks-native stack exclusively:** Delta tables for storage, SQL for analytics, Databricks SQL dashboards for visualization, native alerts for notifications. Avoid external tools (Datadog, Grafana) that require data export and add operational complexity.

## Recommended Stack

### Core Data Layer

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Delta Lake | 3.x (bundled with DBR) | All metric storage | ACID transactions, time travel for historical analysis, optimized for Spark. Native to Databricks — zero config. |
| Unity Catalog System Tables | N/A (platform feature) | Primary data source | `system.billing`, `system.compute`, `system.access` provide job/cluster/cost metrics without API polling. Managed retention. |
| Databricks SQL | Serverless recommended | Query engine | Sub-second queries on Delta tables, warehouse isolation, auto-scaling for dashboard load. |

### System Tables (Data Sources)

| Schema | Tables | Purpose | Confidence |
|--------|--------|---------|------------|
| `system.billing` | `usage`, `list_prices` | DBU consumption, cost calculation | HIGH — well documented |
| `system.compute` | `clusters`, `node_types` | Cluster configs, utilization | HIGH — well documented |
| `system.lakeflow` | `job_runs`, `job_tasks`, `pipelines` | Job execution history, task metrics | MEDIUM — verify current schema |
| `system.access` | `audit` | User activity, job triggers | HIGH — well documented |
| `system.storage` | `predictive_optimization_operations_history` | Delta optimization tracking | MEDIUM — verify availability |

**Note:** System table schemas evolve. Run `SHOW TABLES IN system.<schema>` to verify current availability.

### Visualization & Alerting

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Databricks SQL Dashboards | Current | All visualization | Native integration with SQL warehouse, no data export, scheduled refresh, shareable URLs. |
| Databricks SQL Alerts | Current | Threshold-based notifications | Direct Slack/Email integration, SQL-based conditions, no external webhook infrastructure. |
| Databricks Workflows Notifications | Current | Job-level alerts | Native failure/success notifications per job, complement SQL Alerts for pattern detection. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Databricks Repos | Version control | Connect to Git, PR workflows for SQL/Python changes |
| Databricks Asset Bundles (DABs) | Deployment automation | YAML-based config for jobs, queries, dashboards. CI/CD native. |
| Databricks CLI | Local development | `databricks bundle deploy` for environment promotion |
| VS Code + Databricks Extension | IDE | Notebook editing, cluster attachment, query testing |

### SQL/Python Libraries

| Library | Purpose | When to Use |
|---------|---------|-------------|
| PySpark (bundled) | Data transformation | Complex aggregations, ML-based anomaly detection |
| Databricks SDK for Python | API access | Gaps not covered by system tables (real-time job status) |
| pandas (bundled) | Small data manipulation | Dashboard data prep, report generation |
| requests (bundled) | Webhook integration | Slack/Email via HTTP when native alerts insufficient |

## Installation / Setup

```sql
-- No installation required for system tables
-- Enable system tables in your workspace (admin action):
-- Account Console > Workspace Settings > System Tables > Enable

-- Verify system tables access:
SELECT * FROM system.billing.usage LIMIT 10;
SELECT * FROM system.compute.clusters LIMIT 10;
SELECT * FROM system.lakeflow.job_runs LIMIT 10;

-- Grant access to monitoring service principal or team:
GRANT SELECT ON SCHEMA system.billing TO `monitoring-team`;
GRANT SELECT ON SCHEMA system.compute TO `monitoring-team`;
GRANT SELECT ON SCHEMA system.lakeflow TO `monitoring-team`;
```

```bash
# For Databricks Asset Bundles (CI/CD)
pip install databricks-cli

# Initialize bundle structure
databricks bundle init

# Deploy to workspace
databricks bundle deploy -t dev
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| System Tables | Jobs API polling | Real-time status (<1 min latency), current run progress. System tables have ~15 min delay. |
| SQL Dashboards | Grafana | Already have Grafana org-wide, need unified multi-platform view |
| SQL Alerts | PagerDuty | 24/7 on-call rotation, escalation policies, incident management required |
| Delta Lake | Time series DB (InfluxDB) | Sub-second granularity needed, which is rare for job monitoring |
| Databricks SQL Serverless | Classic SQL Warehouse | Cost control via fixed allocation, predictable billing |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| All-Purpose Clusters for queries | 10x cost vs SQL Warehouse for analytics workloads | Databricks SQL (Serverless or Classic) |
| External ETL (Airbyte, Fivetran) | Unnecessary — data already in Databricks | Direct system table queries |
| External dashboards (Tableau, Looker) | Adds data export, latency, cost | Databricks SQL Dashboards |
| Custom Spark Streaming for alerts | Over-engineered for batch monitoring | SQL Alerts with scheduled queries |
| Hive Metastore tables | Legacy — missing governance, lineage | Unity Catalog managed tables |
| Jobs API as primary data source | Rate limits, requires polling infrastructure | System tables (API for gaps only) |

## Stack Patterns by Variant

**If real-time job status needed (<1 minute):**
- Use Databricks SDK for Python to poll Jobs API
- Cache in Delta table with 1-minute refresh
- Because system tables have ~15 minute lag

**If cost anomaly detection needed:**
- Use `system.billing.usage` joined with `system.lakeflow.job_runs`
- Calculate DBU per job with window functions
- Apply statistical thresholds (p90 baseline comparison)

**If ML-based anomaly detection:**
- Use PySpark for feature engineering on job metrics
- Train with MLflow, deploy as SQL function (UDF)
- Because complex patterns (seasonality, multi-factor) exceed SQL thresholds

**If cross-workspace monitoring:**
- System tables are workspace-scoped
- Use Account-level system tables (if available) or federate via Delta Sharing
- Verify current cross-workspace support in documentation

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| Databricks Runtime 14.x+ | Unity Catalog, System Tables | Minimum for full system table support |
| Databricks SQL Serverless | Unity Catalog required | Cannot use with HMS-only workspaces |
| Asset Bundles | CLI 0.200+ | YAML schema changes between versions — pin CLI version |

## Architecture Notes

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA SOURCES                               │
├─────────────────┬─────────────────┬─────────────────────────────┤
│ system.billing  │ system.compute  │ system.lakeflow             │
│ (usage, costs)  │ (clusters)      │ (job_runs, tasks)           │
└────────┬────────┴────────┬────────┴────────┬────────────────────┘
         │                 │                 │
         └────────────────┬┴─────────────────┘
                          │
                          ▼
         ┌────────────────────────────────┐
         │     AGGREGATION LAYER          │
         │  (Delta Tables - Gold Zone)    │
         │  - job_health_metrics          │
         │  - cost_attribution            │
         │  - cluster_efficiency          │
         │  - sla_tracking                │
         └───────────────┬────────────────┘
                         │
           ┌─────────────┴─────────────┐
           │                           │
           ▼                           ▼
┌─────────────────────┐    ┌─────────────────────┐
│  SQL DASHBOARDS     │    │  SQL ALERTS         │
│  - Platform ops     │    │  - Slack webhooks   │
│  - Team reports     │    │  - Email            │
│  - Executive views  │    │  - Threshold-based  │
└─────────────────────┘    └─────────────────────┘
```

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Delta Lake as storage | HIGH | Databricks-native, well-documented, production-proven |
| System tables availability | MEDIUM | Schema names based on training data — verify `SHOW SCHEMAS IN system` |
| SQL Dashboards/Alerts | HIGH | Core Databricks SQL feature, stable |
| Asset Bundles for CI/CD | MEDIUM | Rapidly evolving — verify current YAML schema |
| Serverless SQL pricing | LOW | Pricing models change — verify current rates |

## Validation Checklist

Before implementation, verify:

- [ ] Run `SHOW SCHEMAS IN system` — confirm all expected schemas exist
- [ ] Run `SHOW TABLES IN system.lakeflow` — confirm job_runs, job_tasks available
- [ ] Check system table retention policies (default 365 days, varies by table)
- [ ] Confirm SQL Serverless is enabled for your workspace
- [ ] Test Slack webhook integration from SQL Alert

## Sources

- Databricks documentation (training data, May 2025 cutoff)
- System tables schema based on `system.billing`, `system.compute` documentation
- Asset Bundles based on Databricks CLI documentation

**Verification needed:**
- Current system table schemas at https://docs.databricks.com/en/admin/system-tables/
- Current SQL dashboard capabilities at https://docs.databricks.com/en/sql/user/dashboards/
- Current Asset Bundles schema at https://docs.databricks.com/en/dev-tools/bundles/

---
*Stack research for: Databricks Job Monitoring & Optimization Framework*
*Researched: 2026-02-18*
*Note: WebSearch/WebFetch tools unavailable during research — recommendations based on training data. Flag all version-specific claims for validation.*
