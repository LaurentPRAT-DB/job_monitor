# Performance Recommendations

## Current Status (2026-02-27)

### What's Working Well

| Endpoint | Response Size | Change |
|----------|--------------|--------|
| `/api/health-metrics` | 12KB (50 jobs) | ✅ **Paginated** - was 500KB |
| `/api/jobs-api/active` | 15KB (50 jobs) | ✅ **Paginated** - was 889KB |
| `/api/me` | 200B | ✅ Fast |
| `/api/alerts?category=X` | 1-15KB | ✅ Selective queries |

### Issues Requiring Attention

| Endpoint | Response Size | Issue |
|----------|--------------|-------|
| `/api/costs/summary` | 206KB | No pagination, full dataset |
| `/api/alerts` (global) | 141KB | 267 alerts, no pagination |

---

## ✅ DONE: Pagination for `/api/jobs-api/active`

**Problem**: Returned 889KB of data with 2,928+ running jobs.

**Solution**: Added `page` and `page_size` parameters.

**Impact**: 889KB → 15KB per page (**98% reduction**)

---

## Priority 2: Add Pagination to `/api/costs/summary`

**Problem**: Returns 206KB with ~5000 job cost records.

**Solution**: Paginate the jobs list in cost summary.

```python
# cost.py - add pagination
@router.get("/costs/summary")
async def get_cost_summary(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
) -> CostSummaryOut:
    # Keep team totals, paginate jobs
    return {
        "jobs": paginated_jobs,
        "teams": team_totals,  # Keep full list (small)
        "anomalies": anomalies,  # Keep full list (small)
        "total_dbus": total,
        "page": page,
        "page_size": page_size,
        "has_more": has_more
    }
```

**Impact**: 206KB → ~25KB per page (88% reduction)

---

## Priority 3: Add Pagination to `/api/alerts`

**Problem**: Returns 141KB with 267 alerts.

**Solution**: Add server-side pagination.

```python
# alerts.py - add pagination
@router.get("/alerts")
async def get_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    category: str | None = None,
    severity: str | None = None,
) -> AlertListOut:
    # Filter then paginate
    filtered = filter_alerts(all_alerts, category, severity)
    paginated = filtered[start:end]
    return {
        "alerts": paginated,
        "total": len(filtered),
        "by_severity": compute_severity_counts(filtered),
        "page": page,
        "has_more": end < len(filtered)
    }
```

**Impact**: 141KB → ~15KB per page (89% reduction)

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
| `/api/costs/summary` | 206KB | ~25KB | 88% smaller |
| `/api/alerts` | 141KB | ~15KB | 89% smaller |

**Total initial page load**: ~1.8MB → ~75KB (96% reduction)

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
