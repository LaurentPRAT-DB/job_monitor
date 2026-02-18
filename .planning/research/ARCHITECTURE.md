# Architecture Research

**Domain:** Databricks Job Monitoring & Optimization
**Researched:** 2026-02-18
**Confidence:** MEDIUM (based on training data - unable to verify with live sources)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Dashboards  │  │    Alerts    │  │   Reports    │  │  API Access  │     │
│  │  (DB SQL)    │  │  (DB Alerts) │  │   (Email)    │  │  (Optional)  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │                 │              │
├─────────┴─────────────────┴─────────────────┴─────────────────┴──────────────┤
│                           SEMANTIC LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    Gold Tables (Reporting Views)                    │     │
│  │  • job_summary_daily    • cost_by_workspace    • sla_compliance    │     │
│  │  • cluster_efficiency   • failure_analysis     • trend_metrics     │     │
│  └────────────────────────────────┬───────────────────────────────────┘     │
│                                   │                                          │
├───────────────────────────────────┴──────────────────────────────────────────┤
│                           TRANSFORMATION LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    Silver Tables (Cleaned/Enriched)                 │     │
│  │  • job_runs_enriched    • cluster_usage_hourly  • billing_enriched │     │
│  │  • task_metrics         • failure_classified    • cost_allocated   │     │
│  └────────────────────────────────┬───────────────────────────────────┘     │
│                                   │                                          │
├───────────────────────────────────┴──────────────────────────────────────────┤
│                           INGESTION LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │   Bronze Tables  │  │   Bronze Tables  │  │   Bronze Tables  │           │
│  │ (System Tables)  │  │   (Jobs API)     │  │  (External APIs) │           │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘           │
│           │                     │                     │                      │
├───────────┴─────────────────────┴─────────────────────┴──────────────────────┤
│                           DATA SOURCES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │  Unity Catalog   │  │   Databricks     │  │   Cluster        │           │
│  │  System Tables   │  │   Jobs API       │  │   APIs           │           │
│  │  • system.billing│  │   /api/2.1/jobs  │  │   /api/2.0/      │           │
│  │  • system.compute│  │   /runs/list     │  │   clusters       │           │
│  │  • system.access │  │   /runs/get      │  │                  │           │
│  │  • system.lakeflow│ │                  │  │                  │           │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **System Tables (Bronze)** | Raw source of truth for billing, compute, access | Direct SELECT from `system.*` catalogs; no ETL needed |
| **Jobs API Ingestion** | Capture data not in system tables (task details, params, repair history) | Scheduled notebook calling REST API, writing to Delta |
| **Silver Layer** | Clean, dedupe, enrich raw data; add business context | SQL transforms with incremental merge patterns |
| **Gold Layer** | Pre-aggregated metrics for dashboard performance | Materialized views or scheduled aggregation jobs |
| **Dashboards** | User-facing visualizations | Databricks SQL Dashboard with auto-refresh |
| **Alerts** | Proactive notifications for anomalies/SLAs | Databricks SQL Alerts with Slack/PagerDuty integration |
| **Orchestration** | Schedule all pipeline stages | Databricks Workflows with dependencies |

## Recommended Project Structure

```
monitoring/
├── src/
│   ├── ingestion/                    # Bronze layer - data capture
│   │   ├── jobs_api_collector.py     # REST API polling for job runs
│   │   ├── cluster_api_collector.py  # Cluster details not in system tables
│   │   └── system_table_sync.sql     # Views/copies of system tables if needed
│   │
│   ├── transformation/               # Silver layer - cleaning & enrichment
│   │   ├── job_runs_enriched.sql     # Join job runs with metadata
│   │   ├── cost_allocation.sql       # Map costs to teams/projects
│   │   ├── failure_classification.sql # Categorize failures
│   │   └── cluster_efficiency.sql    # Compute utilization metrics
│   │
│   ├── aggregation/                  # Gold layer - reporting metrics
│   │   ├── daily_job_summary.sql     # Daily rollups
│   │   ├── weekly_cost_report.sql    # Cost analysis
│   │   ├── sla_compliance.sql        # SLA tracking
│   │   └── trend_analysis.sql        # Historical trends
│   │
│   ├── alerts/                       # Alert definitions
│   │   ├── job_failure_alert.sql     # Immediate failure notification
│   │   ├── cost_anomaly_alert.sql    # Unusual spending
│   │   ├── sla_breach_alert.sql      # SLA violations
│   │   └── cluster_idle_alert.sql    # Wasted compute
│   │
│   └── dashboards/                   # Dashboard definitions (JSON or DBSQL)
│       ├── executive_overview.json   # High-level KPIs
│       ├── job_operations.json       # Operational details
│       ├── cost_analysis.json        # Financial insights
│       └── failure_analysis.json     # Debugging views
│
├── config/
│   ├── tables.yml                    # Table schemas and properties
│   ├── jobs.yml                      # Job definitions for Workflows
│   └── alerts.yml                    # Alert thresholds and recipients
│
├── tests/
│   ├── data_quality/                 # Data validation tests
│   └── transformation/               # SQL logic tests
│
└── docs/
    ├── data_dictionary.md            # Table and column definitions
    └── runbook.md                    # Operational procedures
```

### Structure Rationale

- **src/ organized by layer:** Medallion architecture (bronze/silver/gold) is the standard Databricks pattern; folder structure mirrors data flow for clarity
- **Separate alerts/ folder:** Alerts are distinct from dashboards - different lifecycle and ownership
- **config/ for declarative definitions:** Enables version control and environment promotion
- **No notebooks at root:** Production code in `.sql` and `.py` files, not notebooks (notebooks for exploration only)

## Architectural Patterns

### Pattern 1: Medallion Architecture (Bronze/Silver/Gold)

**What:** Three-layer data architecture where each layer refines data progressively
**When to use:** Always for Databricks analytics workloads - this is the canonical pattern
**Trade-offs:**
- Pro: Clear separation of concerns, easy debugging, incremental processing
- Con: Storage overhead (3x data), latency between layers

**Example:**
```sql
-- Bronze: Raw from system tables (no transformation)
CREATE OR REFRESH STREAMING TABLE bronze_job_runs AS
SELECT * FROM system.lakeflow.job_run_timeline;

-- Silver: Cleaned and enriched
CREATE OR REFRESH STREAMING TABLE silver_job_runs AS
SELECT
    jr.*,
    jm.job_name,
    jm.owner_email,
    tm.team_name,
    CASE
        WHEN jr.result_state = 'SUCCESS' THEN 'success'
        WHEN jr.result_state IN ('FAILED', 'TIMEDOUT') THEN 'failure'
        ELSE 'other'
    END as result_category
FROM STREAM(bronze_job_runs) jr
LEFT JOIN job_metadata jm ON jr.job_id = jm.job_id
LEFT JOIN team_mapping tm ON jm.owner_email = tm.email;

-- Gold: Aggregated for dashboards
CREATE OR REFRESH MATERIALIZED VIEW gold_daily_job_summary AS
SELECT
    DATE(start_time) as run_date,
    team_name,
    COUNT(*) as total_runs,
    SUM(CASE WHEN result_category = 'success' THEN 1 ELSE 0 END) as successful_runs,
    AVG(duration_seconds) as avg_duration_seconds
FROM silver_job_runs
WHERE start_time >= CURRENT_DATE - INTERVAL 90 DAYS
GROUP BY 1, 2;
```

### Pattern 2: Incremental Processing with Change Data Feed

**What:** Process only new/changed records using Delta Lake Change Data Feed
**When to use:** For large tables where full refresh is expensive; critical for scaling to 1000+ jobs
**Trade-offs:**
- Pro: Efficient processing, low latency, cost-effective
- Con: More complex logic, requires careful handling of late-arriving data

**Example:**
```sql
-- Enable CDF on source tables
ALTER TABLE bronze_job_runs SET TBLPROPERTIES (delta.enableChangeDataFeed = true);

-- Incremental merge pattern
MERGE INTO silver_job_runs target
USING (
    SELECT * FROM table_changes('bronze_job_runs', @last_processed_version)
    WHERE _change_type != 'delete'
) source
ON target.run_id = source.run_id
WHEN MATCHED AND source._change_type = 'update_postimage'
    THEN UPDATE SET *
WHEN NOT MATCHED
    THEN INSERT *;
```

### Pattern 3: Hub-and-Spoke for Multi-Workspace

**What:** Central monitoring workspace pulls data from multiple production workspaces
**When to use:** Enterprise deployments with workspace isolation requirements
**Trade-offs:**
- Pro: Unified view, single pane of glass, separated concerns
- Con: Cross-workspace complexity, potential latency, Unity Catalog metastore sharing required

**Example Architecture:**
```
Production Workspaces                 Central Monitoring Workspace
┌─────────────────────┐              ┌─────────────────────────────┐
│  Workspace A        │              │                             │
│  └─ system.* tables │──────────────│  Combined Views             │
└─────────────────────┘      ╲       │  ├─ all_jobs_combined       │
                              ╲      │  ├─ all_costs_combined      │
┌─────────────────────┐        ──────│  └─ all_clusters_combined   │
│  Workspace B        │       ╱      │                             │
│  └─ system.* tables │──────╱       │  Dashboards & Alerts        │
└─────────────────────┘              └─────────────────────────────┘
```

### Pattern 4: Slowly Changing Dimensions (SCD Type 2) for Metadata

**What:** Track historical changes to job configurations, team assignments, etc.
**When to use:** When you need to analyze "what was the configuration when this job failed?"
**Trade-offs:**
- Pro: Historical accuracy, audit trail
- Con: Storage growth, query complexity

## Data Flow

### Primary Data Flow

```
Unity Catalog System Tables                Jobs REST API
        │                                        │
        │ (Direct Query)                         │ (Scheduled Polling)
        ▼                                        ▼
┌───────────────┐                      ┌───────────────┐
│ system.billing│                      │ API Response  │
│ system.compute│                      │ (JSON)        │
│ system.access │                      └───────┬───────┘
│ system.lakeflow                              │
└───────┬───────┘                              │ (Parse & Write)
        │                                      ▼
        │                              ┌───────────────┐
        │                              │ bronze_api_*  │
        │                              │ (Delta Tables)│
        │                              └───────┬───────┘
        │                                      │
        └──────────────┬───────────────────────┘
                       │
                       │ (JOIN, ENRICH, CLEAN)
                       ▼
              ┌────────────────┐
              │  Silver Layer  │
              │ (Delta Tables) │
              └───────┬────────┘
                      │
                      │ (AGGREGATE, SUMMARIZE)
                      ▼
              ┌────────────────┐
              │   Gold Layer   │
              │ (Materialized  │
              │    Views)      │
              └───────┬────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │Dashboards│  │  Alerts  │  │  Reports │
  └──────────┘  └──────────┘  └──────────┘
```

### Key Data Flows

1. **System Tables to Silver:** Direct SQL transforms - no API calls needed, highly efficient
2. **Jobs API to Bronze:** Python/Scala notebook polls API, handles pagination, writes to Delta
3. **Silver to Gold:** Scheduled SQL aggregations, typically hourly/daily depending on SLA
4. **Gold to Presentation:** Dashboards query Gold directly for performance; some drill-downs may hit Silver
5. **Alerts trigger on Gold:** SQL queries with thresholds, evaluated on schedule (every 5-15 minutes)

### Critical Data Entities

| Entity | Source | Update Frequency | Key Fields |
|--------|--------|------------------|------------|
| Job Runs | system.lakeflow.job_run_timeline | Near real-time | job_id, run_id, start_time, result_state, duration |
| Task Runs | Jobs API (2.1) | Polled (5-15 min) | task_key, attempt_number, error_message |
| Billing | system.billing.usage | ~1 hour lag | sku_name, usage_quantity, usage_date |
| Cluster Events | system.compute.clusters | Near real-time | cluster_id, event_type, timestamp |
| Cluster Utilization | Metrics API / system tables | ~15 min lag | cluster_id, cpu_percent, memory_percent |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 jobs | Single workflow, hourly refresh, basic dashboards. System tables handle all queries directly. |
| 100-500 jobs | Implement Silver/Gold layers for query performance. Add incremental processing. |
| 500-1000 jobs | Partition tables by date. Consider Delta Live Tables for automation. Add data quality checks. |
| 1000+ jobs | Mandatory: materialized Gold layer, aggressive partitioning, consider streaming for alerts. Multi-workspace hub-and-spoke if needed. |

### Scaling Priorities for 1000+ Jobs

1. **First bottleneck - Query Performance:**
   - System tables are append-only and can grow large
   - Solution: Create filtered/aggregated Gold tables; never query Bronze directly from dashboards
   - Implement partition pruning (by date) on all analytical queries

2. **Second bottleneck - API Rate Limits:**
   - Jobs API has rate limits (exact limits vary by account tier)
   - Solution: Batch API calls, implement exponential backoff, cache responses in Delta
   - Consider polling less frequently for historical data vs near-real-time

3. **Third bottleneck - Dashboard Responsiveness:**
   - Complex dashboards with many panels can be slow
   - Solution: Pre-aggregate all dashboard metrics in Gold layer, use Materialized Views
   - Consider caching at dashboard level (Databricks SQL supports this)

## Anti-Patterns

### Anti-Pattern 1: Querying System Tables Directly from Dashboards

**What people do:** Build dashboards that SELECT directly from `system.billing.usage` or `system.lakeflow.job_run_timeline`
**Why it's wrong:** System tables are large, append-only, and not optimized for analytical queries. Dashboard latency becomes unacceptable at scale.
**Do this instead:** Create materialized Gold layer tables with appropriate aggregations and filters. Dashboards query Gold only.

### Anti-Pattern 2: Full Table Refresh for Large Tables

**What people do:** Run `INSERT OVERWRITE` or `CREATE OR REPLACE` for Silver tables on every run
**Why it's wrong:** Wastes compute, increases latency, doesn't scale past ~100 jobs
**Do this instead:** Use MERGE with Change Data Feed or watermark-based incremental loads

### Anti-Pattern 3: Polling Jobs API Too Frequently

**What people do:** Poll Jobs API every 1 minute for "real-time" monitoring
**Why it's wrong:** Hits rate limits, wastes API quota, system tables are better for most use cases anyway
**Do this instead:** Use system tables for core metrics (they update near real-time). Use Jobs API only for data not in system tables (task-level details, parameters). Poll API every 5-15 minutes max.

### Anti-Pattern 4: Monolithic Transformation Jobs

**What people do:** Single massive SQL script or notebook that does all bronze-to-gold transformations
**Why it's wrong:** Hard to debug, can't retry individual stages, no parallelism
**Do this instead:** Separate jobs/tasks for each transformation stage. Use Databricks Workflows with task dependencies.

### Anti-Pattern 5: Ignoring Historical Data Retention

**What people do:** Keep all data forever without partitioning or archival strategy
**Why it's wrong:** Query performance degrades, storage costs grow unbounded
**Do this instead:** Implement time-based partitioning. Define retention policies (e.g., detailed data for 90 days, aggregates for 2 years). Use OPTIMIZE and VACUUM regularly.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Slack | Webhook from SQL Alerts | Native support in Databricks SQL Alerts |
| PagerDuty | Webhook integration | For critical SLA breaches |
| Email | SMTP via Alerts | Built-in to Databricks SQL |
| JIRA | API call from notebook | For automated ticket creation on failures |
| ServiceNow | API integration | Enterprise incident management |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Ingestion to Transformation | Delta tables | Bronze tables are the contract; no direct API coupling |
| Transformation to Aggregation | Delta tables | Silver tables are the contract |
| Aggregation to Presentation | Delta tables / Materialized Views | Gold layer is the contract; dashboards never query upstream |
| Alerting to Notification | SQL Alert queries Gold | Alerts are downstream consumers, not producers |

## Build Order Recommendations

Based on architectural dependencies, recommended implementation order:

### Phase 1: Foundation (Must Build First)
1. **System table access verification** - Confirm Unity Catalog system tables are enabled
2. **Bronze layer setup** - Views or copies of system tables
3. **Jobs API ingestion** - Basic collector for data not in system tables

**Why first:** Everything depends on data access; validate assumptions early

### Phase 2: Core Transformation
1. **Silver layer - job runs** - Cleaned, enriched job run data
2. **Silver layer - cost allocation** - Map billing to teams/projects
3. **Silver layer - cluster metrics** - Utilization calculations

**Why second:** These are the building blocks for all analytics

### Phase 3: Analytics Layer
1. **Gold layer aggregations** - Daily/weekly rollups
2. **SLA calculations** - Define and compute SLA metrics
3. **Trend analysis tables** - Historical comparisons

**Why third:** Requires Silver layer to be stable

### Phase 4: Presentation
1. **Core dashboards** - Job health, cost overview
2. **Alert definitions** - Critical failure, SLA breach
3. **Detailed drill-down views** - Failure analysis, cost deep-dive

**Why fourth:** Requires Gold layer for performance

### Phase 5: Optimization & Scale
1. **Incremental processing** - Convert to CDC/streaming
2. **Performance tuning** - Partitioning, caching, optimization
3. **Advanced features** - Anomaly detection, forecasting

**Why last:** Optimization should follow working baseline

## Sources

- Databricks Unity Catalog System Tables documentation (training data - MEDIUM confidence)
- Databricks Jobs API 2.1 reference (training data - MEDIUM confidence)
- Delta Lake best practices for medallion architecture (training data - MEDIUM confidence)
- Databricks SQL Alerts documentation (training data - MEDIUM confidence)

**Note:** Unable to verify with live sources during research. Recommend validating system table schemas and API endpoints against current Databricks documentation before implementation.

---
*Architecture research for: Databricks Job Monitoring & Optimization*
*Researched: 2026-02-18*
