# Manual Testing Checklist - Job Monitor

**URL**: https://job-monitor-2556758628403379.aws.databricksapps.com

## Quick Setup

1. Open Chrome and navigate to the app URL
2. Open DevTools (F12 or Cmd+Opt+I)
3. Go to Network tab
4. Enable "Preserve log" checkbox
5. Filter by "Fetch/XHR" to see only API calls

---

## Cycle 1: Initial Load Test (10 minutes)

### Dashboard (/dashboard)
Start Time: _______

| Action | API Calls Expected | API Calls Observed | Pass |
|--------|-------------------|-------------------|------|
| Navigate to /dashboard | 4 (user, health-metrics, alerts, costs) | | |
| Click "Total Jobs" card | 0-1 (cache hit expected) | | |
| Click browser back | 0 (cache hit) | | |
| Click "Active Alerts" card | 0 (cache hit) | | |
| Click browser back | 0 (cache hit) | | |
| Click "DBU Cost" card | 3 (historical data) | | |
| Click browser back | 0 (cache hit) | | |
| Click "View all" link | 0 (cache hit) | | |
| Click "Refresh" button | 3 (refetch) | | |
| Toggle dark mode | 0 | | |
| Click sidebar links | varies | | |

### Job Health (/job-health)
Start Time: _______

| Action | API Calls Expected | API Calls Observed | Pass |
|--------|-------------------|-------------------|------|
| Navigate to /job-health | 0-2 (alerts + maybe health) | | |
| Click "30 Days" tab | 1 (new time window) | | |
| Click "7 Days" tab | 0 (cached) | | |
| Click P1 filter card | 0 (client filter) | | |
| Click P2 filter card | 0 (client filter) | | |
| Click P3 filter card | 0 (client filter) | | |
| Click "Clear filter" | 0 | | |
| Type in search box | 0 (client filter) | | |
| Select time filter dropdown | 0 (client filter) | | |
| Click column headers (sort) | 0 (client sort) | | |
| Click pagination buttons | 0 (client pagination) | | |
| Change rows per page | 0 | | |
| Expand a job row | 0-1 (detail fetch) | | |
| Collapse the row | 0 | | |
| Click "Refresh" | 1-2 | | |

### Running Jobs (/running-jobs)
Start Time: _______

| Action | API Calls Expected | API Calls Observed | Pass |
|--------|-------------------|-------------------|------|
| Navigate to /running-jobs | 1 (active runs) | | |
| Click "Running" filter card | 0 (client filter) | | |
| Click "Pending" filter card | 0 (client filter) | | |
| Click "Terminating" filter card | 0 (client filter) | | |
| Click "Total Active" | 0 | | |
| Sort by columns | 0 (client sort) | | |
| Expand a job row | 1 (job history) | | |
| Wait 30+ seconds | 1 (auto-refresh) | | |
| Click "Refresh" | 1 | | |

### Alerts (/alerts)
Start Time: _______

| Action | API Calls Expected | API Calls Observed | Pass |
|--------|-------------------|-------------------|------|
| Navigate to /alerts | 0 (shared cache key) | | |
| Click "Failure" tab | 1 (filtered query) | | |
| Click "SLA" tab | 1 | | |
| Click "Cost" tab | 1 | | |
| Click "Cluster" tab | 1 | | |
| Click "All" tab | 0 (cached) | | |
| Click "Acknowledge" | 1 POST + invalidation | | |

### Historical (/historical)
Start Time: _______

| Action | API Calls Expected | API Calls Observed | Pass |
|--------|-------------------|-------------------|------|
| Navigate to /historical | 3 (costs, success, sla) | | |
| Click "Success Rate" tab | 0 (data pre-loaded) | | |
| Click "Failures" tab | 0 (data pre-loaded) | | |
| Click "Cost Trends" tab | 0 | | |

---

## Cycle 2: Cache Validation (5 minutes wait + 5 minutes test)

**Wait 5 minutes, then repeat navigation**

| Navigation | Expected Behavior | Observed | Pass |
|------------|-------------------|----------|------|
| Dashboard to Job Health | Background refetch (stale) | | |
| Job Health to Alerts | Fresh fetch or stale check | | |
| Alerts to Dashboard | Background refetch | | |
| Dashboard to Historical | No refetch (static data) | | |

---

## Cycle 3: Stress Test (10 minutes)

### Pagination Stress (Job Health)
- [ ] Click through 5+ pages rapidly
- [ ] API calls made: _______ (should be 0)

### Sort Stress (Job Health)
- [ ] Click each column header 3 times
- [ ] API calls made: _______ (should be 0)

### Expand/Collapse Stress
- [ ] Expand 5 different job rows
- [ ] Collapse all
- [ ] API calls for details: _______ (1 per unique job)

### Rapid Navigation
- [ ] Navigate: Dashboard > Job Health > Alerts > Running > Historical
- [ ] Repeat 3 times
- [ ] API calls: _______ vs expected: _______

---

## Final Summary

| Metric | Value |
|--------|-------|
| Total Test Duration | ______ minutes |
| Total API Calls Made | ______ |
| Expected API Calls | ~25-35 for full test |
| Cache Hit Rate | ______% |
| Console Errors | ______ |

### Cache Efficiency Assessment

- [ ] PASS: Cache hit rate >= 70%
- [ ] PASS: No duplicate requests within staleTime
- [ ] PASS: Background refetches only on stale data
- [ ] PASS: Static data never refetched

### Issues Found

1. ________________________________
2. ________________________________
3. ________________________________

---

## Quick DevTools Commands

Paste in Console to track API calls:

```javascript
// Log all API calls
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const url = typeof args[0] === 'string' ? args[0] : args[0].url;
  if (url.includes('/api/')) {
    console.log(`[API] ${new Date().toISOString()} - ${url}`);
  }
  return originalFetch.apply(window, args);
};
```

Reset Network tab tracking:
- Right-click > Clear
- Or press Cmd+K (Mac) / Ctrl+K (Windows)

Check TanStack Query cache:
```javascript
// View cache contents (if queryClient exposed)
window.__REACT_QUERY_DEVTOOLS__?.client.getQueryCache().getAll().map(q => ({
  key: q.queryKey,
  state: q.state.status,
  staleTime: q.options?.staleTime,
  dataUpdatedAt: new Date(q.state.dataUpdatedAt).toISOString()
}));
```
