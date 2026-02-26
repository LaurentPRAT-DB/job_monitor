# Performance Optimization Plan

**Date**: 2026-02-26
**Tested on**: DEMO WEST (prod) - https://job-monitor-2556758628403379.aws.databricksapps.com

## Current Performance Metrics (Uncached)

| Endpoint | Response Time | Status | Root Cause |
|----------|--------------|--------|------------|
| `/api/me` | **723ms** | ✅ Fast | Simple API call |
| `/api/costs/summary` | **8.6s** | ✅ Improved | Billing table query (was 37s before team lookup skip) |
| `/api/alerts` | **14.8s** | ⚠️ Slow | 4 parallel SQL queries (failure, SLA, cost, cluster) |
| `/api/health-metrics?days=7` | **14.8s** | ⚠️ Slow | Complex CTEs with LAG window functions |
| `/api/historical/*` | **3-5s** | ⚠️ OK | System table queries |

## Key Finding: Cache Infrastructure Exists But Not Deployed

```json
{
  "available": false,
  "reason": "Cache tables not found. Run the refresh-metrics-cache job to create them.",
  "cache_enabled": true,
  "cache_table_prefix": "main.job_monitor_cache"
}
```

**The cache system is ready but the refresh job hasn't been deployed!**

---

## Optimization Plan

### Phase 1: Deploy Cache Refresh Job (HIGH IMPACT)

**Expected improvement**: Health/Alerts from 15s → <1s

1. **Create cache catalog and schema**
   ```sql
   CREATE CATALOG IF NOT EXISTS job_monitor;
   CREATE SCHEMA IF NOT EXISTS job_monitor.cache;
   ```

2. **Deploy the refresh-metrics-cache job** via DABs
   - Job file: `job_monitor/jobs/refresh_metrics_cache.py`
   - Schedule: Every 10 minutes (`0 */10 * * * ?`)
   - Creates 3 cache tables:
     - `job_health_cache`: Pre-computed health metrics
     - `cost_cache`: Pre-computed cost data
     - `alerts_cache`: Pre-computed alert conditions

3. **Update app.yaml** to set cache table prefix
   ```yaml
   env:
     - name: CACHE_CATALOG
       value: "job_monitor"
     - name: CACHE_SCHEMA
       value: "cache"
   ```

### Phase 2: In-Memory API Caching (MEDIUM IMPACT)

**Expected improvement**: Reduce repeat query load by 80%

Add TTL-based in-memory caching using `cachetools`:

```python
from cachetools import TTLCache
from functools import wraps

# 5-minute TTL cache for expensive queries
_query_cache = TTLCache(maxsize=100, ttl=300)

def cached_query(key_func):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = key_func(*args, **kwargs)
            if key in _query_cache:
                return _query_cache[key]
            result = await func(*args, **kwargs)
            _query_cache[key] = result
            return result
        return wrapper
    return decorator
```

Apply to:
- `_generate_failure_alerts()` - cache for 5 min
- `_generate_cost_alerts()` - cache for 5 min
- `get_health_metrics()` - cache for 5 min

### Phase 3: Query Optimizations (LOW IMPACT)

**Expected improvement**: 10-20% per query

1. **Simplify health metrics query**
   - Make retry detection optional (add `include_retries=false` param)
   - Remove LAG window function when not needed

2. **Alerts query batching**
   - Batch the SLA check Jobs API calls
   - Use `asyncio.gather` with semaphore to limit concurrent API calls

3. **Add query hints**
   ```sql
   SELECT /*+ BROADCAST(job_names) */
   ```

---

## Implementation Priority

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| Phase 1: Cache Job | 2-4 hours | **15s → <1s** | 🔴 HIGH |
| Phase 2: In-Memory Cache | 1-2 hours | **30-50% reduction** | 🟡 MEDIUM |
| Phase 3: Query Optimization | 2-4 hours | **10-20% per query** | 🟢 LOW |

## Recommended Next Steps

1. **Immediate**: Deploy cache refresh job (Phase 1)
   - This is the biggest win: 15s → <1s for health/alerts
   - Infrastructure already exists, just needs job deployment

2. **Short-term**: Add in-memory caching (Phase 2)
   - Quick win for reducing repeated query load
   - Helps with burst traffic scenarios

3. **Future**: Query optimizations (Phase 3)
   - Only needed if cache isn't sufficient
   - Lower priority since cache handles most cases

---

## Files to Modify

### Phase 1
- `databricks.prod.yml` - Add cache refresh job definition
- `app.prod.yaml` - Add CACHE_CATALOG/CACHE_SCHEMA env vars

### Phase 2
- `job_monitor/backend/routers/alerts.py` - Add in-memory cache
- `job_monitor/backend/routers/health_metrics.py` - Add in-memory cache

### Phase 3
- `job_monitor/backend/routers/health_metrics.py` - Simplify query
- `job_monitor/backend/routers/alerts.py` - Batch API calls
