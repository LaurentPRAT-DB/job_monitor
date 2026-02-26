# Job Monitor Comprehensive UI Test Plan

**Application URL**: https://job-monitor-2556758628403379.aws.databricksapps.com
**Test Duration**: 30 minutes minimum
**Test Date**: 2026-02-26

## Test Overview

This test validates all clickable elements across all pages and verifies the TanStack Query caching behavior to ensure optimal performance.

## Caching Strategy Summary

The application uses TanStack Query with tiered caching:

| Data Type | staleTime | gcTime | refetchOnFocus | Example |
|-----------|-----------|--------|----------------|---------|
| **Static** | Infinity | 30 min | false | Historical data |
| **Semi-live** | 5 min | 15 min | true | Job health, costs |
| **Live** | 1 min | 5 min | true | Alerts, running jobs |
| **Session** | 30 min | 60 min | false | User info |

## Expected Cache Behavior

1. **First visit to page**: API call made, data cached
2. **Return within staleTime**: No API call (cache hit)
3. **Return after staleTime but within gcTime**: Background refetch
4. **Return after gcTime**: Fresh API call
5. **Window focus (for semi-live/live)**: Background refetch

---

## Page-by-Page Click Map

### Page 1: Dashboard (`/dashboard`)

**API Endpoints Called**:
- `GET /api/auth/user` - User info (session preset)
- `GET /api/health-metrics?days=7` - Job health (semi-live preset)
- `GET /api/alerts` - Alerts (live preset)
- `GET /api/costs/summary` - Cost summary (semi-live preset)

**Clickable Elements**:

| Element | Type | Expected Behavior | Cache Impact |
|---------|------|-------------------|--------------|
| **Total Jobs card** | Link | Navigate to `/job-health` | No new fetch (shared cache key) |
| **Active Alerts card** | Link | Navigate to `/alerts` | No new fetch (shared cache key) |
| **Success Rate card** | Display | No navigation | None |
| **DBU Cost card** | Link | Navigate to `/historical` | Triggers historical API calls |
| **"View all" link** | Link | Navigate to `/alerts` | No new fetch |
| **Refresh button** | Button | Refetch all data | Forces API calls |
| **Dark mode toggle** | Switch | Toggle theme | Local state only |
| **Sidebar: Dashboard** | Link | Stay on page | None |
| **Sidebar: Running Jobs** | Link | Navigate | New fetch for running jobs |
| **Sidebar: Job Health** | Link | Navigate | Cache hit expected |
| **Sidebar: Alerts** | Link | Navigate | Cache hit expected |
| **Sidebar: Historical** | Link | Navigate | New historical fetches |

---

### Page 2: Job Health (`/job-health`)

**API Endpoints Called**:
- `GET /api/health-metrics?days=7` - Default 7-day view
- `GET /api/alerts` - For inline alert indicators

**Clickable Elements**:

| Element | Type | Expected Behavior | Cache Impact |
|---------|------|-------------------|--------------|
| **7 Days tab** | Tab | Filter to 7-day data | Cache hit if previously loaded |
| **30 Days tab** | Tab | Filter to 30-day data | API call: `/api/health-metrics?days=30` |
| **Total Jobs card** | Button | Filter table to all | Local state only |
| **Critical (P1) card** | Button | Filter table to P1 | Local state only |
| **Failing (P2) card** | Button | Filter table to P2 | Local state only |
| **Warning (P3) card** | Button | Filter table to P3 | Local state only |
| **Search input** | Input | Filter by job name/ID | Local state only |
| **Time filter dropdown** | Select | All/1h/6h/24h filter | Local state only |
| **Job row (expand)** | Row click | Expand row details | May fetch job history |
| **Column headers** | Header click | Sort by column | Local state only |
| **First page** | Button | Go to page 1 | Local state only |
| **Prev page** | Button | Go to previous page | Local state only |
| **Next page** | Button | Go to next page | Local state only |
| **Last page** | Button | Go to last page | Local state only |
| **Rows per page** | Select | Change page size | Local state only |
| **Refresh button** | Button | Force refetch | API call |
| **Clear filter** | Link | Clear priority filter | Local state only |

---

### Page 3: Running Jobs (`/running-jobs`)

**API Endpoints Called**:
- `GET /api/jobs-api/active` - Active runs (live, 30s refresh)
- `GET /api/jobs-api/runs/{jobId}?limit=6` - Per-row history (lazy)

**Clickable Elements**:

| Element | Type | Expected Behavior | Cache Impact |
|---------|------|-------------------|--------------|
| **Total Active card** | Button | Filter to all | Local state only |
| **Running card** | Button | Filter to RUNNING | Local state only |
| **Pending/Queued card** | Button | Filter to PENDING | Local state only |
| **Terminating card** | Button | Filter to TERMINATING | Local state only |
| **Job row (expand)** | Row click | Show expanded details | Fetch job history (cached 1min) |
| **Column: Job Name** | Header click | Sort by name | Local state only |
| **Column: State** | Header click | Sort by state | Local state only |
| **Column: Started** | Header click | Sort by start time | Local state only |
| **Column: Duration** | Header click | Sort by duration | Local state only |
| **View link** | External link | Open Databricks UI | None |
| **Refresh button** | Button | Force refetch | API call |
| **Clear filter** | Link | Clear state filter | Local state only |

---

### Page 4: Alerts (`/alerts`)

**API Endpoints Called**:
- `GET /api/alerts` - All alerts (live, 60s polling)
- `GET /api/alerts?category={category}` - Filtered alerts

**Clickable Elements**:

| Element | Type | Expected Behavior | Cache Impact |
|---------|------|-------------------|--------------|
| **All tab** | Tab | Show all alerts | Cache hit (same key as dashboard) |
| **Failure tab** | Tab | Filter to failures | API: `/api/alerts?category=failure` |
| **SLA tab** | Tab | Filter to SLA | API: `/api/alerts?category=sla` |
| **Cost tab** | Tab | Filter to cost | API: `/api/alerts?category=cost` |
| **Cluster tab** | Tab | Filter to cluster | API: `/api/alerts?category=cluster` |
| **Acknowledge button** | Button | Acknowledge alert | POST to API, invalidates cache |
| **View job link** | Link | Navigate to job health | May add query params |

---

### Page 5: Historical (`/historical`)

**API Endpoints Called**:
- `GET /api/historical/costs?days=X` - Cost trends (static preset)
- `GET /api/historical/success-rate?days=X` - Success trends (static preset)
- `GET /api/historical/sla-breaches?days=X` - SLA trends (static preset)

**Clickable Elements**:

| Element | Type | Expected Behavior | Cache Impact |
|---------|------|-------------------|--------------|
| **Cost Trends tab** | Tab | Show cost chart | Local state (data pre-loaded) |
| **Success Rate tab** | Tab | Show success chart | Local state (data pre-loaded) |
| **Failures tab** | Tab | Show failures chart | Local state (data pre-loaded) |

Note: Historical page uses global filters (from filter context) for time range.

---

### Global Elements (All Pages)

**Sidebar (Desktop)**:
| Element | Type | Cache Impact |
|---------|------|--------------|
| Dashboard link | Link | Cache hit on return |
| Running Jobs link | Link | Fresh or stale check |
| Job Health link | Link | Cache hit on return |
| Alerts link | Link | Cache hit on return |
| Historical link | Link | Cache hit on return |
| Dark mode toggle | Switch | Local storage only |

**Mobile Navigation**:
| Element | Type | Cache Impact |
|---------|------|--------------|
| Hamburger menu | Button | Opens sheet |
| All sidebar links | Links | Same as desktop |
| Close sheet | X button | None |

---

## Test Execution Plan

### Cycle 1: Initial Load (0-10 minutes)

**Objective**: Verify all pages load correctly and baseline API calls

1. **Dashboard** (2 min)
   - Open Chrome DevTools > Network tab
   - Navigate to `/dashboard`
   - Record all API calls (expect 4: user, health-metrics, alerts, costs)
   - Click Total Jobs card > verify navigation
   - Click back > verify no duplicate API calls (cache hit)
   - Click Active Alerts card > verify navigation
   - Click Refresh button > verify refetch

2. **Job Health** (3 min)
   - Navigate to `/job-health`
   - Verify cache hit for health-metrics (no new call if < 5 min)
   - Click 30 Days tab > expect new API call
   - Click 7 Days tab > should use cache
   - Click P1 filter card > no API call
   - Type in search > no API call
   - Expand first job row > may trigger detail fetch
   - Click pagination controls > no API calls
   - Click column headers to sort > no API calls

3. **Running Jobs** (2 min)
   - Navigate to `/running-jobs`
   - Verify API call for active runs
   - Click filter cards > no API calls
   - Expand job row > verify history fetch
   - Wait 30s > verify auto-refresh
   - Click external View link > opens new tab

4. **Alerts** (2 min)
   - Navigate to `/alerts`
   - Verify cache hit for alerts (same key as dashboard)
   - Click category tabs > verify filtered fetches
   - Click Acknowledge on an alert > verify POST + cache invalidation
   - Click View job link > navigate with filter

5. **Historical** (1 min)
   - Navigate to `/historical`
   - Verify 3 API calls (costs, success, sla)
   - Click between chart tabs > no new API calls

### Cycle 2: Cache Validation (10-20 minutes)

**Objective**: Verify cache behavior on repeated navigation

1. **Rapid Navigation** (5 min)
   - Navigate: Dashboard > Job Health > Alerts > Dashboard
   - Record which requests use cache vs fresh fetch
   - Expected: Most should be cache hits

2. **Wait 5 minutes** (5 min)
   - Stay on Dashboard
   - After 5 min, navigate to Job Health
   - Expected: Background refetch (staleTime exceeded)

3. **Window Focus Test** (2 min)
   - While on Job Health, switch to another tab
   - Wait 1 minute
   - Switch back
   - Expected: Background refetch for semi-live data

4. **Filter Panel Test** (3 min)
   - Open global filters (if present)
   - Select team filter > verify API calls include team param
   - Select job filter > verify API calls include job_id param
   - Clear filters > verify return to base queries

### Cycle 3: Stress Test (20-30 minutes)

**Objective**: Validate behavior under repeated interactions

1. **Pagination Stress** (3 min)
   - On Job Health, click through all pages
   - Verify no API calls for pagination
   - Change page size multiple times

2. **Sort Stress** (2 min)
   - Click each sortable column multiple times
   - Verify no API calls

3. **Expand/Collapse Stress** (3 min)
   - Expand and collapse multiple job rows rapidly
   - Verify reasonable caching of detail fetches

4. **Cross-page Cache Validation** (5 min)
   - Navigate: Dashboard > Alerts > Dashboard > Alerts
   - Verify consistent cache behavior
   - Check for any memory leaks (DevTools > Performance)

5. **Final Full Navigation** (7 min)
   - Complete one final navigation through all pages
   - Record all network activity
   - Compare to Cycle 1 baseline

---

## Expected Results

### Cache Efficiency Targets

| Metric | Target | Description |
|--------|--------|-------------|
| Cache hit rate | > 70% | Most navigations should hit cache |
| Duplicate requests | 0 | No identical requests within staleTime |
| Memory leaks | 0 | No growing memory usage |

### API Call Patterns

**First Navigation (cold cache)**:
- Dashboard: 4 calls
- Job Health: 0-1 calls (health-metrics cached from dashboard)
- Running Jobs: 1 call
- Alerts: 0 calls (cached from dashboard)
- Historical: 3 calls

**Repeat Navigation (warm cache, < 5 min)**:
- Dashboard: 0 calls
- Job Health: 0 calls
- Running Jobs: 0-1 calls (30s stale)
- Alerts: 0-1 calls (1 min stale)
- Historical: 0 calls (static data)

---

## Test Report Template

```
## Test Report - Job Monitor UI Test
Date: YYYY-MM-DD
Tester: [Name]
Duration: [X] minutes

### Summary
- Total clicks performed: [X]
- Total API calls: [X]
- Cache hits: [X] ([Y]%)
- Cache misses: [X] ([Y]%)
- Errors encountered: [X]

### Page-by-Page Results

#### Dashboard
- API calls on first load: [X]
- Refresh button calls: [X]
- Navigation cache hits: [X/X]

#### Job Health
- 7 Days tab cache behavior: [hit/miss]
- 30 Days tab cache behavior: [hit/miss]
- Filter operations (no API): [pass/fail]
- Pagination (no API): [pass/fail]

#### Running Jobs
- Auto-refresh at 30s: [observed/not observed]
- Per-row history caching: [pass/fail]

#### Alerts
- Shared cache with Dashboard: [pass/fail]
- Category filter fetches: [expected/unexpected]
- Acknowledge POST works: [pass/fail]

#### Historical
- Static data caching (Infinity): [pass/fail]
- Tab switching (no API): [pass/fail]

### Cache Efficiency
- Overall cache hit rate: [X]%
- Best performing page: [page]
- Needs improvement: [page]

### Console Errors
[List any errors]

### Recommendations
[List any improvements needed]
```

---

## Automated Test Script

For automated testing with Puppeteer or Playwright, see `comprehensive-ui-test.js` in this directory.
