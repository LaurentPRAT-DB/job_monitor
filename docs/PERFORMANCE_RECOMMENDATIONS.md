# Performance Recommendations

## Current Status (2026-03-01)

### What's Working Well

| Endpoint | Response Size | Change |
|----------|--------------|--------|
| `/api/health-metrics` | 12KB (50 jobs) | ✅ **Paginated** - was 500KB |
| `/api/jobs-api/active` | 15KB (50 jobs) | ✅ **Paginated** - was 889KB |
| `/api/costs/summary` | 55KB (50 jobs) | ✅ **Paginated** - was 206KB |
| `/api/me` | 200B | ✅ Fast |
| `/api/alerts?category=X` | 1-15KB | ✅ Selective queries |

### Issues Requiring Attention

All major endpoints are now paginated.

---

## ✅ DONE: Pagination for `/api/jobs-api/active`

**Problem**: Returned 889KB of data with 2,928+ running jobs.

**Solution**: Added `page` and `page_size` parameters.

**Impact**: 889KB → 15KB per page (**98% reduction**)

---

## ✅ DONE: Pagination for `/api/costs/summary`

**Problem**: Returned 206KB with ~500 job cost records.

**Solution**: Added `page` and `page_size` parameters. Jobs list is paginated, teams and anomalies remain full (small lists).

**Impact**: 206KB → 55KB per page (**73% reduction**)

---

## ✅ DONE: Pagination for `/api/alerts`

**Problem**: Returned 141KB with 267 alerts.

**Solution**: Added `page` and `page_size` parameters. Alerts are filtered, sorted, then paginated.

**Impact**: 141KB → ~15KB per page (**89% reduction**)

---

## Frontend Changes Required

For each paginated endpoint, update the frontend to use `useInfiniteQuery`:

```typescript
// Example: Running Jobs page
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: ['active-jobs'],
  queryFn: ({ pageParam = 1 }) =>
    fetch(`/api/jobs-api/active?page=${pageParam}&page_size=50`).then(r => r.json()),
  getNextPageParam: (last) => last.has_more ? last.page + 1 : undefined,
});

// Flatten pages
const allRuns = data?.pages.flatMap(p => p.runs) ?? [];
```

---

## Summary of Expected Improvements

| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| `/api/health-metrics` | 500KB | **12KB** | ✅ **Done** |
| `/api/jobs-api/active` | 889KB | **15KB** | ✅ **Done** (98% smaller) |
| `/api/costs/summary` | 206KB | **55KB** | ✅ **Done** (73% smaller) |
| `/api/alerts` | 141KB | **~15KB** | ✅ **Done** (89% smaller) |

**Total initial page load**: ~1.8MB → ~100KB (94% reduction)

---

## Quick Wins Already Implemented

1. ✅ **Health Metrics Pagination** (commit 811cc27)
   - 50 jobs per page with "Load More" button
   - Priority counts computed server-side

2. ✅ **Cost Summary Team Skip** (commit d4d8a9e)
   - `include_teams=false` saves 20-30s per request

3. ✅ **Alerts Selective Queries** (commit 9c94a27)
   - Single category: 24x faster (19s → 0.8s)

4. ✅ **Frontend Caching** (query-config.ts)
   - `slow` preset: 10 min staleTime for heavy endpoints

5. ✅ **workspace_id in alerts_cache** (commit f8745cb)
   - Delta cache table now includes workspace_id column
   - Alerts with workspace filter: 46s → 1.3s (**35x faster**)

6. ✅ **IndexedDB Persistence** (commit 7f6afd6)
   - Query cache persisted to IndexedDB
   - Survives page refreshes for instant loading
   - Fixed DataCloneError by filtering pending queries

7. ✅ **Cost Anomalies Caching** (commit 21d4adc)
   - `/api/costs/anomalies` now cached for 10 minutes
   - First load: 13s, cached: <1s

8. ✅ **Delta Schema Evolution** (commit f8745cb)
   - Use `.option("overwriteSchema", "true")` for cache table updates
   - Allows adding columns without manual schema migration
