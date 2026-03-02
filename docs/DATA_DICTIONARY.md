# Data Dictionary

**Version:** 1.3.2
**Last Updated:** March 2, 2026

This document defines the data structures used by the Databricks Job Monitor, including Unity Catalog system tables, pre-computed cache tables, and API response models.

---

## Table of Contents

1. [System Tables](#system-tables)
   - [system.lakeflow.job_run_timeline](#systemlakeflowjob_run_timeline)
   - [system.lakeflow.jobs](#systemlakeflowjobs)
   - [system.billing.usage](#systembillingusage)
2. [Cache Tables](#cache-tables)
   - [job_health_cache](#job_health_cache)
   - [cost_cache](#cost_cache)
   - [alerts_cache](#alerts_cache)
3. [API Response Models](#api-response-models)
4. [Data Quality Rules](#data-quality-rules)
5. [Common Patterns](#common-patterns)

---

## System Tables

### system.lakeflow.job_run_timeline

**Description:** Contains one row per job run with execution details, timing, and result states. This is the primary data source for job health monitoring.

**Source:** Unity Catalog System Tables (auto-populated by Databricks)

**Refresh Frequency:** Near real-time (5-15 minute latency)

**Retention:** 365 days

**Key Constraints:** Composite key on (workspace_id, job_id, run_id)

#### Schema

| Column Name | Data Type | Nullable | Description | Example Values |
|-------------|-----------|----------|-------------|----------------|
| `workspace_id` | BIGINT | NOT NULL | Numeric workspace identifier | `1234567890123456` |
| `job_id` | BIGINT | NOT NULL | Job identifier | `468386370679810` |
| `run_id` | BIGINT | NOT NULL | Unique run identifier | `123456789` |
| `run_name` | STRING | NULL | Optional run name | `"Daily ETL Run"` |
| `period_start_time` | TIMESTAMP | NOT NULL | Run start timestamp (UTC) | `2026-03-01 10:30:00` |
| `period_end_time` | TIMESTAMP | NULL | Run end timestamp (NULL if running) | `2026-03-01 11:15:00` |
| `run_duration_seconds` | INT | NULL | Total run duration in seconds (may be 0 for serverless) | `2700` |
| `result_state` | STRING | NULL | Final run result (NULL if running) | `SUCCESS`, `FAILED`, `CANCELED`, `SKIPPED` |
| `termination_code` | STRING | NULL | Error code for failed runs | `DRIVER_ERROR`, `TIMEOUT` |
| `run_type` | STRING | NULL | Type of run | `JOB_RUN`, `WORKFLOW_RUN` |
| `run_count` | INT | NULL | Number of task runs in the job | `1`, `5` |

#### Important Notes

- **Result State Values:** Use `SUCCESS` or `SUCCEEDED` (both may appear). Always use `UPPER()` for comparisons.
- **Duration for Serverless:** `run_duration_seconds` may be 0 for serverless jobs. Calculate from `period_end_time - period_start_time` as fallback.
- **Workspace ID Type:** BIGINT, not STRING. Do not quote in WHERE clauses: `WHERE workspace_id = 123456`

---

### system.lakeflow.jobs

**Description:** SCD Type 2 table containing job definitions. Multiple rows per job_id with `change_time` tracking configuration changes.

**Source:** Unity Catalog System Tables

**Refresh Frequency:** Near real-time

**Retention:** Full history

#### Schema

| Column Name | Data Type | Nullable | Description | Example Values |
|-------------|-----------|----------|-------------|----------------|
| `workspace_id` | BIGINT | NOT NULL | Numeric workspace identifier | `1234567890123456` |
| `job_id` | BIGINT | NOT NULL | Job identifier | `468386370679810` |
| `name` | STRING | NOT NULL | Job name | `"prod-etl-daily"` |
| `creator_user_name` | STRING | NULL | User who created the job | `"user@company.com"` |
| `run_as_user_name` | STRING | NULL | User context for job execution | `"service-account@company.com"` |
| `change_time` | TIMESTAMP | NOT NULL | When this version became active | `2026-02-15 09:00:00` |
| `delete_time` | TIMESTAMP | NULL | When job was deleted (NULL if active) | `NULL` |

#### SCD2 Pattern for Latest Version

```sql
-- Get latest version of each job
WITH latest_jobs AS (
    SELECT *,
        ROW_NUMBER() OVER(
            PARTITION BY workspace_id, job_id
            ORDER BY change_time DESC
        ) as rn
    FROM system.lakeflow.jobs
    WHERE delete_time IS NULL
)
SELECT * FROM latest_jobs WHERE rn = 1
```

---

### system.billing.usage

**Description:** Billing records with DBU consumption per resource. Used for cost analysis and anomaly detection.

**Source:** Unity Catalog System Tables

**Refresh Frequency:** Daily (end-of-day aggregation)

**Retention:** 365 days

#### Schema

| Column Name | Data Type | Nullable | Description | Example Values |
|-------------|-----------|----------|-------------|----------------|
| `workspace_id` | BIGINT | NOT NULL | Workspace identifier | `1234567890123456` |
| `usage_date` | DATE | NOT NULL | Date of usage | `2026-03-01` |
| `sku_name` | STRING | NOT NULL | SKU category | `JOBS_COMPUTE`, `SERVERLESS_SQL` |
| `usage_quantity` | DOUBLE | NOT NULL | DBU quantity consumed | `125.5` |
| `usage_metadata` | STRUCT | NULL | Nested metadata about the usage | See below |

#### usage_metadata Structure

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | STRING | Job ID (NULL for all-purpose clusters) |
| `cluster_id` | STRING | Cluster ID |
| `notebook_id` | STRING | Notebook ID (if applicable) |

#### Important Notes

- **job_id Location:** Access via `usage_metadata.job_id`, not a top-level column
- **NULL job_id:** All-purpose compute clusters have NULL job_id
- **Negative Values:** RETRACTION records may have negative `usage_quantity`

---

## Cache Tables

Cache tables are pre-computed aggregations stored in Delta format for fast dashboard loading. Created by the `refresh_metrics_cache` job.

**Location:** `{catalog}.{schema}.{table_name}` (configurable, default: `job_monitor.cache.*`)

**Refresh Frequency:** Every 15 minutes (configurable via `cache_refresh_cron`)

---

### job_health_cache

**Description:** Pre-computed job health metrics with priority flags and duration statistics.

**Purpose:** Fast loading of Job Health page (reduces 10-16s query to <1s)

#### Schema

| Column Name | Data Type | Nullable | Description | Example Values |
|-------------|-----------|----------|-------------|----------------|
| `job_id` | STRING | NOT NULL | Job identifier | `"468386370679810"` |
| `job_name` | STRING | NULL | Job name from latest version | `"prod-etl-daily"` |
| `total_runs_30d` | INT | NOT NULL | Total runs in 30-day window | `120` |
| `success_count_30d` | INT | NOT NULL | Successful runs in 30-day window | `115` |
| `success_rate_30d` | DOUBLE | NULL | Success percentage (30d) | `95.8` |
| `total_runs_7d` | INT | NOT NULL | Total runs in 7-day window | `28` |
| `success_count_7d` | INT | NOT NULL | Successful runs in 7-day window | `27` |
| `success_rate_7d` | DOUBLE | NULL | Success percentage (7d) | `96.4` |
| `last_run_time` | TIMESTAMP | NULL | Most recent run start time | `2026-03-01 14:30:00` |
| `last_duration_seconds` | INT | NULL | Duration of most recent run | `1800` |
| `priority` | STRING | NULL | Computed priority flag | `P1`, `P2`, `P3`, `NULL` |
| `retry_count` | INT | NOT NULL | Retry count in window | `3` |
| `median_duration_seconds` | DOUBLE | NULL | Median duration (30d) | `1750.0` |
| `p90_duration_seconds` | DOUBLE | NULL | P90 duration (30d) | `2100.0` |
| `avg_duration_seconds` | DOUBLE | NULL | Average duration (30d) | `1820.5` |
| `max_duration_seconds` | DOUBLE | NULL | Maximum duration (30d) | `3600.0` |
| `refreshed_at` | TIMESTAMP | NOT NULL | Cache refresh timestamp | `2026-03-01 15:00:00` |

#### Priority Logic

| Priority | Condition | Severity |
|----------|-----------|----------|
| `P1` | Last 2 runs both failed | Critical |
| `P2` | Last run failed (single failure) | Warning |
| `P3` | Success rate 70-89% | Info |
| `NULL` | Success rate >= 90% | Healthy |

---

### cost_cache

**Description:** Pre-computed cost data with per-job and SKU breakdowns.

**Purpose:** Fast loading of cost analysis (reduces 30-40s query to <1s)

#### Schema

| Column Name | Data Type | Nullable | Description | Example Values |
|-------------|-----------|----------|-------------|----------------|
| `job_id` | STRING | NOT NULL | Job identifier | `"468386370679810"` |
| `job_name` | STRING | NULL | Job name | `"prod-etl-daily"` |
| `total_dbus_30d` | DOUBLE | NOT NULL | Total DBUs consumed (30d) | `1250.5` |
| `current_7d_dbus` | DOUBLE | NOT NULL | DBUs in current 7-day period | `312.5` |
| `prev_7d_dbus` | DOUBLE | NOT NULL | DBUs in previous 7-day period | `298.0` |
| `trend_7d_percent` | DOUBLE | NULL | Week-over-week change % | `4.9` |
| `sku_breakdown` | STRING | NULL | Comma-separated SKU:DBU pairs | `"JOBS_COMPUTE:1000.0,SERVERLESS:250.5"` |
| `baseline_p90_dbus` | DOUBLE | NULL | P90 daily DBU baseline | `50.0` |
| `is_anomaly` | BOOLEAN | NOT NULL | True if current > 2x baseline | `false` |
| `refreshed_at` | TIMESTAMP | NOT NULL | Cache refresh timestamp | `2026-03-01 15:00:00` |

---

### alerts_cache

**Description:** Pre-computed alert conditions for fast alert loading.

**Purpose:** Fast loading of Alerts page with workspace filtering (reduces 46s to <1.5s)

#### Schema

| Column Name | Data Type | Nullable | Description | Example Values |
|-------------|-----------|----------|-------------|----------------|
| `alert_id` | STRING | NOT NULL | Unique alert identifier | `"failure_123_p1"` |
| `workspace_id` | BIGINT | NOT NULL | Workspace ID for filtering | `1234567890123456` |
| `job_id` | STRING | NOT NULL | Affected job ID | `"468386370679810"` |
| `job_name` | STRING | NULL | Job name | `"prod-etl-daily"` |
| `category` | STRING | NOT NULL | Alert category | `failure`, `cost`, `sla`, `cluster` |
| `severity` | STRING | NOT NULL | Alert severity | `P1`, `P2`, `P3` |
| `title` | STRING | NOT NULL | Alert title | `"2+ consecutive failures"` |
| `description` | STRING | NOT NULL | Detailed description | `"Job failed 2+ times..."` |
| `failure_reasons` | STRING | NULL | Comma-separated error codes | `"DRIVER_ERROR,TIMEOUT"` |
| `current_dbus` | DOUBLE | NULL | Current DBU usage (cost alerts) | `500.0` |
| `baseline_p90_dbus` | DOUBLE | NULL | P90 baseline (cost alerts) | `200.0` |
| `cost_multiplier` | DOUBLE | NULL | Current/baseline ratio | `2.5` |
| `refreshed_at` | TIMESTAMP | NOT NULL | Cache refresh timestamp | `2026-03-01 15:00:00` |

#### Alert Categories

| Category | Source Data | Example Alerts |
|----------|-------------|----------------|
| `failure` | job_run_timeline | Consecutive failures, low success rate |
| `cost` | billing.usage | Cost spike (>2x baseline) |
| `sla` | Jobs API + tags | SLA breach risk |
| `cluster` | billing.usage | Over-provisioned resources |

---

## API Response Models

### JobHealthOut

**Endpoint:** `GET /api/health-metrics`

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string | Job identifier |
| `job_name` | string | Job display name |
| `total_runs` | int | Total runs in window |
| `success_count` | int | Successful runs |
| `success_rate` | float | Percentage (0-100) |
| `last_run_time` | datetime | Most recent run |
| `last_duration_seconds` | int | Last run duration |
| `priority` | string | `P1`, `P2`, `P3`, or null |
| `retry_count` | int | Retry attempts |
| `status` | string | Computed: `green`, `yellow`, `red` |

### Alert

**Endpoint:** `GET /api/alerts`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique alert ID |
| `job_id` | string | Affected job |
| `job_name` | string | Job display name |
| `category` | enum | `failure`, `sla`, `cost`, `cluster` |
| `severity` | enum | `P1`, `P2`, `P3` |
| `title` | string | Short summary |
| `description` | string | Full description |
| `remediation` | string | Actionable suggestion |
| `created_at` | datetime | Alert generation time |
| `acknowledged` | boolean | Acknowledgment status |
| `acknowledged_at` | datetime | When acknowledged |
| `condition_key` | string | Deduplication key |

---

## Data Quality Rules

### System Tables

1. **result_state values:** Always compare using `UPPER()` to handle case variations
2. **workspace_id type:** BIGINT - never quote in WHERE clauses
3. **NULL handling:** `run_duration_seconds` may be NULL or 0 for serverless jobs
4. **Latency:** System tables have 5-15 minute data latency

### Cache Tables

1. **Freshness:** Check `refreshed_at` timestamp; cache is stale if > 30 minutes old
2. **Schema evolution:** Use `.option("overwriteSchema", "true")` when adding columns
3. **Permissions:** Requires `SELECT` on cache schema for OBO users

### API Responses

1. **Pagination:** All list endpoints support `page` and `page_size` parameters
2. **Caching:** Response cache TTL varies by endpoint (60s-600s)
3. **Mock data:** Enabled via `USE_MOCK_DATA=true` or on permission errors

---

## Common Patterns

### Consecutive Failure Detection (P1 Priority)

```sql
WITH consecutive_check AS (
    SELECT
        job_id,
        result_state,
        LAG(result_state) OVER (
            PARTITION BY job_id
            ORDER BY period_start_time DESC
        ) as prev_state,
        ROW_NUMBER() OVER (
            PARTITION BY job_id
            ORDER BY period_start_time DESC
        ) as rn
    FROM system.lakeflow.job_run_timeline
    WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
)
SELECT job_id
FROM consecutive_check
WHERE rn = 1
  AND result_state = 'FAILED'
  AND prev_state = 'FAILED'
```

### Cost Anomaly Detection (>2x P90 Baseline)

```sql
WITH job_p90 AS (
    SELECT job_id,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY daily_dbus) as p90_dbus
    FROM (
        SELECT usage_metadata.job_id as job_id, usage_date,
            SUM(usage_quantity) as daily_dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL 30 DAYS
        GROUP BY usage_metadata.job_id, usage_date
    )
    GROUP BY job_id
    HAVING COUNT(*) >= 5  -- Need at least 5 data points
)
SELECT * FROM current_costs
WHERE current_dbus > (p90_dbus * 2)
```

### Duration Calculation for Serverless Jobs

```sql
CASE
    WHEN run_duration_seconds IS NULL OR run_duration_seconds = 0
    THEN TIMESTAMPDIFF(SECOND, period_start_time, period_end_time)
    ELSE run_duration_seconds
END as effective_duration
```

---

*Generated for Databricks Job Monitor v1.3.2*
