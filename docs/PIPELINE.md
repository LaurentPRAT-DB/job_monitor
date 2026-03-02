# Pipeline Documentation

**Version:** 1.3.2
**Last Updated:** March 2, 2026

This document describes the data pipelines that power the Databricks Job Monitor, including data flow, orchestration, caching strategies, and monitoring.

---

## Table of Contents

1. [Pipeline Overview](#pipeline-overview)
2. [Data Flow Architecture](#data-flow-architecture)
3. [Cache Refresh Pipeline](#cache-refresh-pipeline)
4. [API Request Flow](#api-request-flow)
5. [Caching Strategy](#caching-strategy)
6. [Orchestration](#orchestration)
7. [Error Handling](#error-handling)
8. [Monitoring & Alerting](#monitoring--alerting)
9. [Rollback Procedures](#rollback-procedures)

---

## Pipeline Overview

The Job Monitor uses a **multi-tier caching architecture** to provide fast dashboard loading while maintaining data freshness. Data flows from Unity Catalog system tables through pre-computed cache tables to the frontend via a FastAPI backend.

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Source Data | Unity Catalog System Tables | Real-time job runs, billing, job metadata |
| Cache Layer | Delta Tables | Pre-aggregated metrics for fast queries |
| API Backend | FastAPI + Databricks SDK | REST API with response caching |
| Frontend Cache | TanStack Query + IndexedDB | Client-side caching and persistence |
| UI | React + TanStack Router | Interactive dashboard |

---

## Data Flow Architecture

```mermaid
flowchart TB
    subgraph "Unity Catalog System Tables"
        SYS_LF["system.lakeflow.job_run_timeline"]
        SYS_JOBS["system.lakeflow.jobs"]
        SYS_BILL["system.billing.usage"]
    end

    subgraph "Cache Layer (Delta Tables)"
        direction TB
        CACHE_JOB["job_health_cache<br/>Job health metrics"]
        CACHE_COST["cost_cache<br/>Cost breakdown"]
        CACHE_ALERT["alerts_cache<br/>Pre-computed alerts"]
    end

    subgraph "Cache Refresh Job"
        SPARK["Spark Job<br/>(refresh_metrics_cache.py)"]
    end

    subgraph "API Backend (FastAPI)"
        direction TB
        RESP_CACHE["Response Cache<br/>(In-memory, TTL-based)"]
        API_HEALTH["/api/health-metrics"]
        API_COST["/api/costs/*"]
        API_ALERTS["/api/alerts"]
        API_ACTIVE["/api/jobs/active"]
    end

    subgraph "Frontend (React)"
        direction TB
        TQ["TanStack Query<br/>(Client cache)"]
        IDB["IndexedDB<br/>(Persistent cache)"]
        UI["Dashboard UI"]
    end

    %% Source to Cache Job
    SYS_LF --> SPARK
    SYS_JOBS --> SPARK
    SYS_BILL --> SPARK

    %% Cache Job writes to Delta tables
    SPARK --> CACHE_JOB
    SPARK --> CACHE_COST
    SPARK --> CACHE_ALERT

    %% API reads from cache first, then system tables
    CACHE_JOB --> API_HEALTH
    CACHE_COST --> API_COST
    CACHE_ALERT --> API_ALERTS
    SYS_LF -.-> API_HEALTH
    SYS_LF -.-> API_ACTIVE

    %% Response cache layer
    API_HEALTH --> RESP_CACHE
    API_COST --> RESP_CACHE
    API_ALERTS --> RESP_CACHE

    %% Frontend caching
    RESP_CACHE --> TQ
    TQ --> IDB
    TQ --> UI

    %% Styling
    style SPARK fill:#ff9800,color:#000
    style RESP_CACHE fill:#4caf50,color:#fff
    style TQ fill:#2196f3,color:#fff
    style IDB fill:#9c27b0,color:#fff
```

### Data Freshness by Layer

| Layer | Freshness | Latency |
|-------|-----------|---------|
| System Tables | Near real-time | 5-15 minutes |
| Delta Cache | Refreshed every 15 min | 15-30 minutes |
| Response Cache | TTL 60-600 seconds | Milliseconds |
| TanStack Query | TTL 1-30 minutes | Instant |
| IndexedDB | 24 hours max age | Instant |

---

## Cache Refresh Pipeline

The cache refresh pipeline pre-computes aggregations from system tables to enable fast dashboard loading.

### Pipeline: `refresh_metrics_cache.py`

```mermaid
flowchart LR
    subgraph "Input Sources"
        JRT["job_run_timeline"]
        JOBS["jobs"]
        BILL["billing.usage"]
    end

    subgraph "Processing"
        AGG1["Aggregate<br/>health metrics"]
        AGG2["Aggregate<br/>cost data"]
        AGG3["Generate<br/>alerts"]
    end

    subgraph "Output Tables"
        OUT1["job_health_cache"]
        OUT2["cost_cache"]
        OUT3["alerts_cache"]
    end

    JRT --> AGG1
    JOBS --> AGG1
    AGG1 --> OUT1

    JRT --> AGG2
    BILL --> AGG2
    AGG2 --> OUT2

    JRT --> AGG3
    BILL --> AGG3
    AGG3 --> OUT3
```

### Job Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Job ID | `468386370679810` | E2 workspace |
| Schedule | `0 */15 * * * ?` | Every 15 minutes |
| Cluster | Serverless | Auto-scaling |
| Timeout | 30 minutes | Max execution time |

### Output Tables

```
{catalog}.{schema}.job_health_cache   -- ~4000+ rows
{catalog}.{schema}.cost_cache         -- ~2000+ rows
{catalog}.{schema}.alerts_cache       -- ~50-200 rows
```

### Processing Steps

1. **Ensure Schema Exists**
   ```python
   spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
   ```

2. **Refresh Job Health Cache**
   - Aggregate runs by job_id (7-day and 30-day windows)
   - Compute success rates, priority flags
   - Detect consecutive failures using LAG window function
   - Calculate duration statistics (median, p90, avg, max)

3. **Refresh Cost Cache**
   - Aggregate DBU usage by job_id
   - Calculate week-over-week trends
   - Compute P90 baseline for anomaly detection
   - Build SKU breakdown strings

4. **Refresh Alerts Cache**
   - Generate failure alerts from health metrics
   - Generate cost spike alerts (>2x P90 baseline)
   - Include `workspace_id` for filtered queries

### Delta Write Options

```python
df.write.format("delta") \
    .mode("overwrite") \
    .option("overwriteSchema", "true") \  # Enable schema evolution
    .saveAsTable(table_name)
```

---

## API Request Flow

### Cache Hierarchy

The API backend uses a multi-tier cache lookup strategy:

```mermaid
flowchart TD
    REQ["Incoming API Request"]

    subgraph "Cache Lookup (Fastest → Slowest)"
        RC{"Response Cache<br/>(In-memory)"}
        DC{"Delta Cache<br/>(Pre-aggregated)"}
        ST{"System Tables<br/>(Live query)"}
        MOCK{"Mock Data<br/>(Fallback)"}
    end

    RESP["Return Response"]

    REQ --> RC
    RC -->|HIT| RESP
    RC -->|MISS| DC
    DC -->|HIT| RESP
    DC -->|MISS| ST
    ST -->|SUCCESS| RESP
    ST -->|ERROR/TIMEOUT| MOCK
    MOCK --> RESP

    style RC fill:#4caf50,color:#fff
    style DC fill:#2196f3,color:#fff
    style ST fill:#ff9800,color:#000
    style MOCK fill:#9e9e9e,color:#fff
```

### Cache TTLs by Endpoint

| Endpoint | Response Cache TTL | Delta Cache | Fallback |
|----------|-------------------|-------------|----------|
| `/api/health-metrics/summary` | 5 min | Yes | Mock |
| `/api/health-metrics` | 5 min | Yes | Mock |
| `/api/alerts` | 2 min | Yes (with workspace_id) | Mock |
| `/api/costs/summary` | 5 min | Yes | Mock |
| `/api/costs/anomalies` | 10 min | Yes | Mock |
| `/api/jobs/active` | 1 min | No (real-time) | Mock |
| `/api/historical/*` | 10 min | No | Mock |

### Request Processing Example: `/api/alerts`

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant API as FastAPI
    participant RC as Response Cache
    participant DC as Delta Cache
    participant ST as System Tables

    FE->>API: GET /api/alerts?workspace_id=123

    API->>RC: Check cache key "alerts:failure:123:p1:50"
    alt Cache Hit
        RC-->>API: Return cached response
        API-->>FE: 200 OK (cached)
    else Cache Miss
        API->>DC: Query alerts_cache WHERE workspace_id=123
        alt Delta Hit
            DC-->>API: Return pre-computed alerts
            API->>RC: Store in response cache
            API-->>FE: 200 OK (from Delta)
        else Delta Miss
            API->>ST: Execute live SQL query
            alt Query Success
                ST-->>API: Return results
                API->>RC: Store in response cache
                API-->>FE: 200 OK (live)
            else Query Error/Timeout
                API-->>FE: Return mock data
            end
        end
    end
```

---

## Caching Strategy

### Backend Response Cache

**Implementation:** In-memory dict with TTL-based expiration

```python
# response_cache.py
class ResponseCache:
    def __init__(self):
        self._cache: dict[str, tuple[Any, float]] = {}  # key -> (value, expires_at)

    def get(self, key: str) -> Any | None:
        if key in self._cache:
            value, expires_at = self._cache[key]
            if time.time() < expires_at:
                return value
            del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl_seconds: int):
        self._cache[key] = (value, time.time() + ttl_seconds)
```

### Frontend TanStack Query Presets

```typescript
// Cache presets by data volatility
export const queryPresets = {
    static:   { staleTime: Infinity, gcTime: 30min },   // Historical data
    semiLive: { staleTime: 5min,     gcTime: 15min },   // Health metrics
    slow:     { staleTime: 10min,    gcTime: 30min },   // Alerts, costs
    live:     { staleTime: 1min,     gcTime: 5min },    // Running jobs
    session:  { staleTime: 30min,    gcTime: 60min },   // User info
}
```

### IndexedDB Persistence

**Purpose:** Survive page refreshes for instant loading

**Implementation:**
```typescript
// Only persist successful queries with gcTime >= 5 minutes
const shouldDehydrateQuery = (query: Query) => {
    return query.state.status === 'success' &&  // Filter out pending (contain Promises)
           query.state.data !== undefined &&
           query.gcTime >= 5 * 60 * 1000;
};
```

**Constraints:**
- Max age: 24 hours
- Only `status === 'success'` queries (avoid Promise serialization errors)
- Queries with `gcTime >= 5 minutes` only

---

## Orchestration

### Job Schedule

The cache refresh job runs on a cron schedule configured in `config.yaml`:

```yaml
cache:
  catalog: job_monitor
  schema: cache
  refresh_cron: "0 */15 * * * ?"  # Every 15 minutes
```

### Dependencies

```mermaid
graph TD
    subgraph "Required Permissions"
        PERM1["USE CATALOG ON CATALOG system"]
        PERM2["USE SCHEMA ON SCHEMA system.lakeflow"]
        PERM3["USE SCHEMA ON SCHEMA system.billing"]
        PERM4["SELECT ON SCHEMA system.lakeflow"]
        PERM5["SELECT ON SCHEMA system.billing"]
        PERM6["CREATE TABLE ON SCHEMA {catalog}.{schema}"]
    end

    subgraph "Cache Refresh Job"
        JOB["refresh_metrics_cache.py"]
    end

    PERM1 --> JOB
    PERM2 --> JOB
    PERM3 --> JOB
    PERM4 --> JOB
    PERM5 --> JOB
    PERM6 --> JOB
```

### Manual Trigger

```bash
# Trigger cache refresh manually
databricks jobs run-now 468386370679810 --profile DEFAULT
```

---

## Error Handling

### Cache Fallback Chain

```mermaid
flowchart TD
    START["API Request"]

    RC{"Response<br/>Cache?"}
    DC{"Delta<br/>Cache?"}
    ST{"System Table<br/>Query?"}

    HIT1["Return cached response"]
    HIT2["Return from Delta + cache response"]
    HIT3["Return live data + cache response"]
    MOCK["Return mock data"]

    START --> RC
    RC -->|HIT| HIT1
    RC -->|MISS| DC
    DC -->|HIT| HIT2
    DC -->|MISS/SKIP| ST
    ST -->|SUCCESS| HIT3
    ST -->|PERMISSION_ERROR| MOCK
    ST -->|TIMEOUT >45s| MOCK
    ST -->|EXCEPTION| MOCK
```

### Error Types and Responses

| Error | Response | User Impact |
|-------|----------|-------------|
| Permission denied | Mock data | See sample data, no real metrics |
| Query timeout | Cached data or mock | May see stale data |
| Warehouse unavailable | 503 Service Unavailable | Error message |
| Invalid parameters | 422 Unprocessable Entity | Validation error |

### Retry Policy

- **System table queries:** No retry (use cache fallback)
- **Cache refresh job:** Databricks Job retry policy (configurable)
- **Frontend queries:** TanStack Query retry (3 attempts with backoff)

---

## Monitoring & Alerting

### Logging

All API operations are logged with structured context:

```python
logger.info(f"[CACHE_HIT] alerts: returning {len(cached_alerts)} alerts from cache")
logger.info(f"[CACHE_MISS] alerts: falling back to live query")
logger.info(f"[RESPONSE_CACHE] Cached alerts response ({len(alerts)}/{total} alerts)")
logger.warning(f"[TIMEOUT] alerts: live query timed out after 45s")
```

### Log Access

```bash
# View app logs
https://<app-url>/logz

# Or via CLI
databricks apps logs job-monitor --profile DEFAULT
```

### Key Metrics to Monitor

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Health metrics latency | <2s | 2-10s | >10s |
| Alerts latency | <2s | 2-5s | >5s |
| Cache hit rate | >80% | 50-80% | <50% |
| Cache refresh duration | <5min | 5-15min | >15min |

### Cache Staleness Check

```sql
-- Check cache freshness
SELECT
    'job_health_cache' as table_name,
    MAX(refreshed_at) as last_refresh,
    TIMESTAMPDIFF(MINUTE, MAX(refreshed_at), current_timestamp()) as minutes_ago
FROM job_monitor.cache.job_health_cache
UNION ALL
SELECT
    'alerts_cache',
    MAX(refreshed_at),
    TIMESTAMPDIFF(MINUTE, MAX(refreshed_at), current_timestamp())
FROM job_monitor.cache.alerts_cache
```

---

## Rollback Procedures

### Cache Table Issue

If cache tables are corrupted or contain bad data:

1. **Disable cache usage temporarily:**
   ```yaml
   # config.yaml
   use_cache: false
   ```

2. **Redeploy app:**
   ```bash
   ./deploy.sh e2
   ```

3. **Manually refresh cache:**
   ```bash
   databricks jobs run-now 468386370679810 --profile DEFAULT
   ```

4. **Re-enable cache and redeploy**

### Schema Evolution Issue

If schema changes break the cache:

1. **Drop and recreate tables:**
   ```sql
   DROP TABLE IF EXISTS job_monitor.cache.alerts_cache;
   ```

2. **Run cache refresh job** (will recreate tables)

3. **Verify schema:**
   ```sql
   DESCRIBE job_monitor.cache.alerts_cache;
   ```

### App Deployment Rollback

```bash
# List recent deployments
databricks apps list-deployments job-monitor --profile DEFAULT

# Rollback to previous version
databricks apps deploy job-monitor \
  --source-code-path /previous/version/path \
  --profile DEFAULT
```

---

## Performance Benchmarks

| Operation | Before Caching | After Caching | Improvement |
|-----------|---------------|---------------|-------------|
| Health metrics (full list) | 11-16s | <2s | 8x faster |
| Alerts (with workspace filter) | 46s | 1.3s | 35x faster |
| Costs summary | 30-40s | <3s | 10x faster |
| Active jobs | 200ms | 200ms | Real-time |

---

*Generated for Databricks Job Monitor v1.3.2*
