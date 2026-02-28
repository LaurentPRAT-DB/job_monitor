# Performance Test Report - E2 Workspace
**Date**: 2026-02-28
**Environment**: E2 Demo Field Eng (job-monitor-1444828305810485.aws.databricksapps.com)
**Version**: v1.3.0
**Tester**: Chrome DevTools MCP automated testing

## Executive Summary

Performance testing revealed **critical bottlenecks** in the alerts and health-metrics endpoints, with response times exceeding 45 seconds in some cases. The application is functional but user experience suffers from long loading times on initial page loads.

## Test Results by Endpoint

### Dashboard Page Load

| Endpoint | Duration | Transfer Size | Decoded Size | Status |
|----------|----------|---------------|--------------|--------|
| `/api/health-metrics/summary` | 841ms | 438 bytes | 138 bytes | ✅ Good |
| `/api/jobs/active` | 217ms | 696 bytes | 396 bytes | ✅ Excellent |
| `/api/alerts?workspace_id=...` | **45,886ms** | 918 bytes | 1,373 bytes | ❌ CRITICAL |

### Running Jobs Page

| Endpoint | Duration | Transfer Size | Decoded Size | Status |
|----------|----------|---------------|--------------|--------|
| `/api/jobs-api/active` | 1,879ms | 2,125 bytes | 15,322 bytes | ⚠️ Acceptable |
| `/api/historical/batch-runs` | 5,749ms | 2,735 bytes | 14,283 bytes | ⚠️ Slow |

### Job Health Page

| Endpoint | Duration | Transfer Size | Decoded Size | Status |
|----------|----------|---------------|--------------|--------|
| `/api/health-metrics` | **10,547ms** | 2,153 bytes | 11,927 bytes | ❌ Very Slow |
| `/api/alerts` | 1,135ms | 3,592 bytes | 28,016 bytes | ✅ Good (cached) |

### Alerts Page

| Endpoint | Duration | Transfer Size | Decoded Size | Status |
|----------|----------|---------------|--------------|--------|
| `/api/alerts` | **10,113ms** | 2,663 bytes | 24,220 bytes | ❌ Very Slow |

### Historical Page

| Endpoint | Duration | Transfer Size | Decoded Size | Status |
|----------|----------|---------------|--------------|--------|
| `/api/health-metrics/summary` | 1,032ms | 438 bytes | 138 bytes | ✅ Good |
| `/api/alerts` | 987ms | 3,585 bytes | 28,016 bytes | ✅ Good (cached) |

## Critical Issues Identified

### 1. Alerts Endpoint - 45.9s Response Time (CRITICAL)

**Problem**: The `/api/alerts?workspace_id=1444828305810485` endpoint took **45.9 seconds** to respond on the Dashboard page.

**Root Cause Analysis**:
- The alerts endpoint runs 4 parallel SQL queries against system tables:
  - Failure alerts query
  - SLA alerts query
  - Cost alerts query
  - Cluster alerts query
- Each query scans `system.lakeflow.job_run_timeline` which contains millions of rows
- Workspace filtering is applied but queries still scan large datasets

**Impact**: Dashboard appears frozen for ~46 seconds on first load before showing alerts count.

### 2. Health Metrics Endpoint - 10.5s Response Time

**Problem**: The `/api/health-metrics` endpoint takes 10+ seconds.

**Root Cause**:
- Complex CTEs with LAG window functions for computing success rates
- Aggregation over 7 days of job run data
- No server-side caching

### 3. Inconsistent Cache Behavior

**Observation**: Second calls to `/api/alerts` returned in 1-1.5s (cache hit), but initial calls took 10-46s.

**Issue**: TanStack Query caching works after first load, but:
- First page load always hits backend
- No backend-side caching for slow queries
- Prefetching helps adjacent pages but not initial load

## Data Volume Analysis

| Endpoint | Compressed | Uncompressed | Compression Ratio |
|----------|------------|--------------|-------------------|
| alerts (full) | 3.6 KB | 28 KB | 7.8x |
| health-metrics | 2.2 KB | 12 KB | 5.5x |
| jobs/active | 0.7 KB | 0.4 KB | 0.6x (small payload) |
| historical/batch-runs | 2.7 KB | 14 KB | 5.2x |

GZip compression is working effectively (5-8x compression ratio).

## User Experience Observations

### Positive
- ✅ Dashboard shows data progressively as endpoints complete
- ✅ Running Jobs page loads quickly (Jobs API is fast)
- ✅ Navigation between pages is snappy after initial load (cache hits)
- ✅ OBO authentication working correctly (laurent.prat@databricks.com)
- ✅ No console errors during normal operation
- ✅ Dark mode toggle works smoothly

### Negative
- ❌ Initial Dashboard load feels stuck for 45+ seconds
- ❌ Job Health page shows loading skeleton for 10+ seconds
- ❌ Alerts page takes 10+ seconds to show data
- ❌ No loading progress indicator for slow endpoints

## Optimization Recommendations

### Already Implemented (Not Applicable)
These optimizations are already in place:
- ✅ GZip compression (GZipMiddleware)
- ✅ Frontend caching with TanStack Query presets (slow, semiLive, live)
- ✅ Route prefetching for adjacent pages
- ✅ Table virtualization for large datasets
- ✅ Jobs API timeout (30s)
- ✅ Alert cache sharing between badge and job-health-table
- ✅ Selective alert queries by category

### NEW Recommendations

#### 1. Server-Side Response Caching for Alerts (HIGH PRIORITY)

**Problem**: Alerts endpoint runs 4 expensive SQL queries on every request.

**Solution**: Implement in-memory caching with TTL for alerts data.

```python
# job_monitor/backend/routers/alerts.py
from functools import lru_cache
from datetime import datetime, timedelta

# Cache alerts for 5 minutes
_alerts_cache = {}
_alerts_cache_time = {}
CACHE_TTL = timedelta(minutes=5)

async def get_alerts_cached(workspace_id: str, days: int = 7):
    cache_key = f"{workspace_id}:{days}"
    now = datetime.utcnow()

    if cache_key in _alerts_cache:
        if now - _alerts_cache_time[cache_key] < CACHE_TTL:
            return _alerts_cache[cache_key]

    # Run expensive queries
    result = await _fetch_alerts_from_db(workspace_id, days)
    _alerts_cache[cache_key] = result
    _alerts_cache_time[cache_key] = now
    return result
```

**Expected Impact**: Reduce 45s → <1s for subsequent requests within 5-minute window.

#### 2. Async Background Refresh for Slow Endpoints (HIGH PRIORITY)

**Problem**: Users wait for slow queries to complete before seeing any data.

**Solution**: Return stale data immediately, refresh in background.

```python
# Return cached data immediately, trigger background refresh
@router.get("/api/alerts")
async def get_alerts(background_tasks: BackgroundTasks, ...):
    cached = get_from_cache()
    if cached:
        background_tasks.add_task(refresh_alerts_cache, workspace_id, days)
        return cached  # Return stale data immediately
    return await fetch_fresh_alerts()  # Only block on first request
```

**Expected Impact**: <100ms response time for cached endpoints.

#### 3. Materialized View / Delta Cache Table (MEDIUM PRIORITY)

**Problem**: SQL queries against system tables are inherently slow.

**Solution**: Create pre-aggregated cache tables refreshed by scheduled job.

The infrastructure already exists in `job_monitor/jobs/refresh_metrics_cache.py` but is not deployed. Deploy the refresh job to populate:
- `main.job_monitor_cache.alerts_cache`
- `main.job_monitor_cache.health_metrics_cache`

**Expected Impact**: Reduce query time from 10-45s to 1-2s by querying smaller cache tables.

#### 4. Loading State Improvements (MEDIUM PRIORITY)

**Problem**: Users don't know why the page appears frozen.

**Solution**: Add progress indicators for slow endpoints.

```tsx
// Show "Loading alerts... (this may take up to 30 seconds)" message
// Add skeleton with pulsing animation
// Show which data is still loading vs. loaded
```

#### 5. Limit Default Alert Query Scope (LOW PRIORITY)

**Problem**: Alerts endpoint queries all 4 categories by default.

**Solution**: Dashboard only needs alert count, not full details. Create a lightweight `/api/alerts/count` endpoint that returns just the count without running all queries.

```python
@router.get("/api/alerts/count")
async def get_alerts_count(workspace_id: str, days: int = 7):
    # Single fast query for just the count
    return {"total": count, "by_severity": {...}}
```

**Expected Impact**: Dashboard loads 10x faster with counts-only endpoint.

#### 6. IndexedDB Cache Persistence Fix (LOW PRIORITY)

**Observation**: Console warning about IndexedDB cache persistence failure.
```
Failed to persist query cache: DataCloneError: Failed to execute 'put' on 'IDBObjectStore': #<Promise> could not be cloned.
```

**Solution**: Ensure TanStack Query persister doesn't try to store Promise objects.

## Performance Targets

| Endpoint | Current | Target | Improvement Needed |
|----------|---------|--------|-------------------|
| Dashboard (total) | 46s | <3s | 15x faster |
| /api/alerts | 45.9s | <2s | 23x faster |
| /api/health-metrics | 10.5s | <2s | 5x faster |
| Job Health page | 10s | <3s | 3x faster |
| Alerts page | 10s | <3s | 3x faster |

## Conclusion

The Job Monitor app is functionally complete but has significant performance issues on initial page loads due to slow system table queries. The most impactful optimizations are:

1. **Server-side caching** for alerts endpoint (45s → <1s)
2. **Background refresh** with stale-while-revalidate pattern
3. **Deploy cache refresh job** to populate pre-aggregated tables

These changes would transform the user experience from "waiting 45 seconds" to "instant response with fresh data in background."
