# Test Coverage & Performance Analysis

## Test Summary

| Suite | Tests | Coverage | Duration |
|-------|-------|----------|----------|
| **Frontend (vitest)** | 202 | 100% lib, 22% overall | 2.5s |
| **Backend (pytest)** | 105 | 41% overall | 1.1s |
| **Total** | **307** | - | **3.6s** |

---

## Frontend Coverage (lib/)

All utility modules at **100% coverage**:

| Module | Functions | Tests |
|--------|-----------|-------|
| `alert-utils.ts` | getUnacknowledgedCount, groupAlertsBySeverity, fetchAlerts, acknowledgeAlert | 29 |
| `api.ts` | fetchApi, getCurrentUser, getHealth, updateJobTags | 7 |
| `cluster-utils.ts` | getUtilizationColor, getUtilizationLabel, formatPercentage | 11 |
| `cost-utils.ts` | formatDBUs, formatCostDollars, formatTrend, getTrendColor, SKU_COLORS | 37 |
| `filter-utils.ts` | wildcardToRegex, matchesJobPatterns, validateWildcardPattern, getGranularity | 37 |
| `health-utils.ts` | getStatusColor, formatDuration, formatTimeAgo, isAnomalousDuration | 30 |
| `pipeline-utils.ts` | formatRowCount, formatDeltaPercent, getDeltaColor, getChangeTypeLabel | 16 |
| `query-config.ts` | queryPresets, queryKeys, withPreset, defaultQueryClientOptions | 28 |
| `utils.ts` | cn (className merging) | 7 |

### Uncovered (Components)
- React components (0% coverage) - require component testing with React Testing Library
- Would add ~50 more tests to achieve full component coverage

---

## Backend Coverage

| Module | Coverage | Key Functions |
|--------|----------|---------------|
| `models.py` | 100% | All Pydantic models |
| `config.py` | 91% | Settings loading |
| `cache.py` | 82% | Cache queries |
| `app.py` | 74% | FastAPI app setup |
| `mock_data.py` | 68% | Test data generation |
| `routers/alerts.py` | 22% | Alert CRUD, filtering |
| `routers/cost.py` | 33% | Cost calculations |
| `routers/health_metrics.py` | 34% | Job health queries |

---

## Performance Analysis

### Measured Response Times (from load tests)

| Endpoint | Avg | P95 | Status |
|----------|-----|-----|--------|
| `/api/me` (User Info) | 195ms | 290ms | ✅ Good |
| `/api/jobs-api/active` | 378ms | 456ms | ✅ Good |
| `/api/filters/presets` | 1.9s | 2.0s | ⚠️ OK |
| `/api/historical/runs?days=7` | 3.5s | 8.3s | ⚠️ Slow |
| `/api/health-metrics?days=7` | 11.6s | 16.7s | ❌ Slow |
| `/api/health-metrics?days=30` | 12.4s | 14.6s | ❌ Slow |
| `/api/alerts` (All categories) | 19.3s | 31.4s | ❌ Very Slow |
| `/api/alerts?category=sla` | 0.8s | 1.2s | ✅ Good (optimized) |
| `/api/costs/summary` | 7.8s | 12s | ⚠️ Slow (optimized from 37s) |

### Data Volume

| Endpoint | Typical Response Size | Records |
|----------|----------------------|---------|
| Health Metrics | ~500KB | 5,000-10,000 jobs |
| Cost Summary | ~200KB | 5,000 jobs |
| Alerts | ~50KB | 200-500 alerts |
| Active Jobs | ~10KB | 50-100 jobs |

---

## Performance Optimization Suggestions

### 1. Backend Query Optimization

#### Health Metrics (Currently 11-12s)
**Problem**: Complex CTEs with LAG window functions scanning large job run history.

**Solutions**:
- [ ] **Pre-compute metrics in cache tables** - Run hourly refresh job
- [ ] **Add composite indexes** on `(job_id, run_start_time)`
- [ ] **Partition by date** for time-range queries
- [ ] **Limit window function scope** - Only compute for jobs with runs in period

```sql
-- Current (slow): LAG over all history
LAG(run_duration) OVER (PARTITION BY job_id ORDER BY run_start_time)

-- Optimized: Pre-filtered subquery
WITH recent_runs AS (
  SELECT * FROM job_runs WHERE run_start_time > DATE_SUB(NOW(), 30)
)
SELECT LAG(run_duration) OVER (...) FROM recent_runs
```

#### Alerts (Currently 14-19s for all categories)
**Problem**: 4 parallel queries hit 4 different system tables.

**Solutions**:
- [x] **Selective queries** - Only run queries for requested categories (DONE)
- [ ] **Cache alert aggregations** - Refresh every 5 min
- [ ] **Incremental alert generation** - Only compute new alerts since last check

#### Cost Summary (Optimized: 37s → 7.8s)
**Already Done**:
- [x] Skip Jobs API team lookups (`include_teams=false`)
- [x] Aggressive frontend caching (10 min staleTime)

**Further Improvements**:
- [ ] **Materialized cost views** - Pre-aggregate by job/day
- [ ] **Async team resolution** - Load teams lazily on expand

### 2. Frontend Caching Strategy

#### Current Configuration (query-config.ts)
```typescript
queryPresets = {
  static:   { staleTime: Infinity, gcTime: 30min },  // Historical data
  semiLive: { staleTime: 5min, gcTime: 15min },      // Job health
  slow:     { staleTime: 10min, gcTime: 30min },     // Costs, Alerts
  live:     { staleTime: 1min, gcTime: 5min },       // Running jobs
  session:  { staleTime: 30min, gcTime: 60min },     // User info
}
```

#### Recommendations
- [x] Use `slow` preset for expensive endpoints (DONE)
- [ ] **Implement optimistic updates** for alert acknowledgment
- [ ] **Add prefetching** on sidebar hover for predictive loading
- [ ] **Request deduplication** - TanStack Query handles this, but ensure proper query keys

### 3. Data Transfer Optimization

#### Current Issues
- Health metrics sends full job list every request (~500KB)
- Cost data includes all SKU breakdowns even when not displayed

#### Solutions
- [ ] **Pagination with cursor** - Load 50 jobs at a time
- [ ] **Field selection** - Only request needed fields
- [ ] **Response compression** - Enable gzip (should be automatic)
- [ ] **Delta updates** - Only send changes since last fetch

```python
# Example: Pagination endpoint
@router.get("/health-metrics")
async def get_health_metrics(
    cursor: Optional[str] = None,
    limit: int = Query(50, le=200),
    fields: str = Query("job_id,job_name,success_rate,last_run_time")
):
    ...
```

### 4. User Experience Improvements

#### Loading States
- [x] Show stale data while refetching (TanStack Query default)
- [ ] **Skeleton loaders** for initial page load
- [ ] **Progressive loading** - Show fast data first, slow data as it arrives

#### Perceived Performance
- [ ] **Instant navigation** with prefetching
- [ ] **Optimistic UI** for mutations
- [ ] **Background refresh** for non-critical data

### 5. Infrastructure Recommendations

#### SQL Warehouse Sizing
- Current queries may benefit from larger warehouse for complex aggregations
- Consider **Serverless SQL** for auto-scaling during peak usage

#### Cache Tables (Already Deployed)
```
job_monitor.cache.job_health_cache   - 11,053 jobs
job_monitor.cache.cost_cache         - 5,419 records
job_monitor.cache.alerts_cache       - 267 alerts
```

- [ ] **Enable cache fallback** - Use cache when live query fails
- [ ] **Monitor cache staleness** - Alert if refresh job fails

---

## Recommended Implementation Priority

### High Impact / Low Effort
1. ✅ Selective alert queries (DONE - 24x faster for single category)
2. ✅ Skip team lookups in cost summary (DONE - 5x faster)
3. ✅ Aggressive frontend caching (DONE - 10min staleTime)

### High Impact / Medium Effort
4. [ ] Pagination for health metrics
5. [ ] Cache table fallback when queries timeout
6. [ ] Skeleton loaders for better perceived performance

### Medium Impact / High Effort
7. [ ] Materialized views for health metrics aggregation
8. [ ] Delta/incremental alert computation
9. [ ] Field selection in API responses

---

## Test Commands

```bash
# Frontend tests
cd job_monitor/ui
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report

# Backend tests
source .venv/bin/activate
pytest tests/backend -v                    # All tests
pytest tests/backend --cov=job_monitor/backend  # With coverage
pytest tests/backend --durations=10        # Show slowest tests

# Load test (requires Chrome with remote debugging)
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
node tests/load-test.js 0.1   # 6 minute quick test
node tests/load-test.js 1     # 1 hour full test
```
