# Alerts Page Test Plan

**App URL**: https://job-monitor-2556758628403379.aws.databricksapps.com/alerts
**Date**: 2026-02-26
**Version**: 1.0

---

## 1. Backend API Endpoints

### 1.1 GET /api/alerts

| Test ID | Test Case | Request | Expected Response |
|---------|-----------|---------|-------------------|
| API-01 | Fetch all alerts | `GET /api/alerts` | 200, `{ alerts: [], total: N, by_severity: {P1, P2, P3} }` |
| API-02 | Filter by severity P1 | `GET /api/alerts?severity=P1` | 200, only P1 alerts |
| API-03 | Filter by severity P2 | `GET /api/alerts?severity=P2` | 200, only P2 alerts |
| API-04 | Filter by severity P3 | `GET /api/alerts?severity=P3` | 200, only P3 alerts |
| API-05 | Filter by category failure | `GET /api/alerts?category=failure` | 200, only failure alerts |
| API-06 | Filter by category sla | `GET /api/alerts?category=sla` | 200, only SLA alerts |
| API-07 | Filter by category cost | `GET /api/alerts?category=cost` | 200, only cost alerts |
| API-08 | Filter by category cluster | `GET /api/alerts?category=cluster` | 200, only cluster alerts |
| API-09 | Filter acknowledged=true | `GET /api/alerts?acknowledged=true` | 200, only acknowledged |
| API-10 | Filter acknowledged=false | `GET /api/alerts?acknowledged=false` | 200, only unacknowledged |
| API-11 | Combined filters | `GET /api/alerts?severity=P1&category=failure` | 200, P1 failure alerts |

### 1.2 POST /api/alerts/{id}/acknowledge

| Test ID | Test Case | Request | Expected Response |
|---------|-----------|---------|-------------------|
| API-12 | Acknowledge valid alert | `POST /api/alerts/{valid_id}/acknowledge` | 200, updated alert with `acknowledged: true` |
| API-13 | Acknowledge invalid ID | `POST /api/alerts/invalid/acknowledge` | 404 or 400 |
| API-14 | Re-acknowledge already ack'd | `POST /api/alerts/{acked_id}/acknowledge` | 200 (idempotent) |

### 1.3 Related Endpoints

| Test ID | Test Case | Request | Expected Response |
|---------|-----------|---------|-------------------|
| API-15 | User info | `GET /api/me` | 200, user details |
| API-16 | Health metrics | `GET /api/health-metrics` | 200, job health data |

---

## 2. UI Click Zones

### 2.1 Header Section

| Test ID | Element | Location | Action | Expected Result |
|---------|---------|----------|--------|-----------------|
| UI-01 | Page title "Alerts" | Top left | Display | Shows "Alerts" heading |
| UI-02 | Refresh button | Next to title | Click | Spinner animates, data refetches, API call to /api/alerts |
| UI-03 | Category tab "All" | Top right tabs | Click | Shows all alerts, tab highlighted |
| UI-04 | Category tab "Failure" | Top right tabs | Click | Filters to failure category, API call with ?category=failure |
| UI-05 | Category tab "SLA" | Top right tabs | Click | Filters to SLA category |
| UI-06 | Category tab "Cost" | Top right tabs | Click | Filters to cost category |
| UI-07 | Category tab "Cluster" | Top right tabs | Click | Filters to cluster category |

### 2.2 Summary Badges

| Test ID | Element | Location | Action | Expected Result |
|---------|---------|----------|--------|-----------------|
| UI-08 | Critical badge (red) | Below header | Click | Filters to P1, ring highlight appears |
| UI-09 | Critical badge | Below header | Click again | Filter cleared |
| UI-10 | Warning badge (orange) | Below header | Click | Filters to P2, ring highlight appears |
| UI-11 | Warning badge | Below header | Click again | Filter cleared |
| UI-12 | Info badge (yellow) | Below header | Click | Filters to P3, ring highlight appears |
| UI-13 | Info badge | Below header | Click again | Filter cleared |
| UI-14 | Total badge | Below header | Click | Shows all alerts, ring highlight |
| UI-15 | Clear filter button | Next to badges | Click | Removes severity filter, button disappears |

### 2.3 Search Bar

| Test ID | Element | Location | Action | Expected Result |
|---------|---------|----------|--------|-----------------|
| UI-16 | Search input | Above table | Type "job name" | Table filters to matching alerts |
| UI-17 | Search input | Above table | Type partial match | Shows partial matches |
| UI-18 | Search input | Above table | Clear text | Shows all alerts again |
| UI-19 | Search input | Above table | Type non-existent | Shows "No alerts match your search" |

### 2.4 Table Header (Sorting)

| Test ID | Element | Location | Action | Expected Result |
|---------|---------|----------|--------|-----------------|
| UI-20 | Severity column header | Table header | Click | Sorts by severity DESC (P1 first) |
| UI-21 | Severity column header | Table header | Click again | Sorts ASC (P3 first) |
| UI-22 | Job Name column header | Table header | Click | Sorts alphabetically A-Z |
| UI-23 | Job Name column header | Table header | Click again | Sorts Z-A |
| UI-24 | Category column header | Table header | Click | Sorts by category |
| UI-25 | Title column header | Table header | Click | Sorts by title |
| UI-26 | Time column header | Table header | Click | Sorts by newest first |
| UI-27 | Time column header | Table header | Click again | Sorts oldest first |

### 2.5 Table Rows (Expansion)

| Test ID | Element | Location | Action | Expected Result |
|---------|---------|----------|--------|-----------------|
| UI-28 | Expand chevron | Row left | Click | Row expands, chevron rotates up |
| UI-29 | Any cell in row | Table row | Click | Row expands/collapses |
| UI-30 | Expanded row | Expanded area | View | Shows Description section |
| UI-31 | Expanded row | Expanded area | View | Shows "Recommended Action" blue box |
| UI-32 | Acknowledge button | Expanded row | Click | Alert marked acknowledged, button disappears |
| UI-33 | View Job Details link | Expanded row | Click | Navigates to /job-health?job={id} |
| UI-34 | Collapse chevron | Row left | Click | Row collapses |

### 2.6 Pagination

| Test ID | Element | Location | Action | Expected Result |
|---------|---------|----------|--------|-----------------|
| UI-35 | Rows per page dropdown | Bottom left | Click | Shows 10, 25, 50, 100 options |
| UI-36 | Select 25 rows | Dropdown | Click | Table shows 25 rows per page |
| UI-37 | Select 50 rows | Dropdown | Click | Table shows 50 rows per page |
| UI-38 | First page button | Bottom right | Click | Goes to page 1 |
| UI-39 | Previous page button | Bottom right | Click | Goes to previous page |
| UI-40 | Next page button | Bottom right | Click | Goes to next page |
| UI-41 | Last page button | Bottom right | Click | Goes to last page |
| UI-42 | Page indicator | Bottom center | View | Shows "Page X of Y" |

### 2.7 Row Visual States

| Test ID | Element | State | Expected Result |
|---------|---------|-------|-----------------|
| UI-43 | P1 row | Default | Red background (bg-red-50) |
| UI-44 | P2 row | Default | Orange background (bg-orange-50) |
| UI-45 | P3 row | Default | Yellow background (bg-yellow-50) |
| UI-46 | Acknowledged row | Default | Reduced opacity (opacity-60) |
| UI-47 | Row | Hover | Slightly darker background |
| UI-48 | Severity badge | P1 | Red badge with "P1 - Critical" |
| UI-49 | Severity badge | P2 | Orange badge with "P2 - Warning" |
| UI-50 | Severity badge | P3 | Yellow badge with "P3 - Info" |

---

## 3. Navigation Tests

| Test ID | Test Case | Action | Expected Result |
|---------|-----------|--------|-----------------|
| NAV-01 | View Job Details | Click link in expanded row | URL: /job-health?job={job_id} |
| NAV-02 | Job Health filter | After NAV-01 | Blue banner shows "Filtering by Job ID: {id}" |
| NAV-03 | Job Health search | After NAV-01 | Search field pre-filled with job ID |
| NAV-04 | Clear job filter | Click "Clear" on banner | Filter removed, URL becomes /job-health |
| NAV-05 | Back to Alerts | Browser back button | Returns to Alerts page, state preserved |
| NAV-06 | Sidebar navigation | Click "Alerts" in sidebar | SPA navigation (no full reload) |

---

## 4. Data Refresh Tests

| Test ID | Test Case | Action | Expected Result |
|---------|-----------|--------|-----------------|
| REF-01 | Manual refresh | Click Refresh button | New API call, data updated |
| REF-02 | Auto-refresh | Wait 60 seconds | Background API call (refetchInterval) |
| REF-03 | Cache hit | Navigate away and back | Instant load from cache |
| REF-04 | Stale data | After 1 min staleTime | Background refetch on focus |

---

## 5. Error Handling Tests

| Test ID | Test Case | Condition | Expected Result |
|---------|-----------|-----------|-----------------|
| ERR-01 | API timeout | Slow network | Loading state, then error message |
| ERR-02 | API error | 500 response | Error displayed, retry option |
| ERR-03 | No alerts | Empty response | "No active alerts. All systems healthy." |
| ERR-04 | Search no results | No matches | "No alerts match your search" |

---

## 6. Responsive Design Tests

| Test ID | Test Case | Viewport | Expected Result |
|---------|-----------|----------|-----------------|
| RES-01 | Desktop | 1400x900 | Full table with all columns |
| RES-02 | Tablet | 768x1024 | Table scrollable, badges wrap |
| RES-03 | Mobile | 390x844 | Hamburger menu, table horizontal scroll |
| RES-04 | Badge wrap | < 600px | Badges wrap to multiple lines |

---

## 7. Test Execution Script

```bash
# Quick API test (requires auth token)
BASE_URL="https://job-monitor-2556758628403379.aws.databricksapps.com"

# Test all endpoints
curl -s "$BASE_URL/api/alerts" | jq '.total, .by_severity'
curl -s "$BASE_URL/api/alerts?category=failure" | jq '.total'
curl -s "$BASE_URL/api/alerts?severity=P1" | jq '.total'
```

---

## 8. Test Results Template

| Test ID | Pass/Fail | Notes | Date | Tester |
|---------|-----------|-------|------|--------|
| API-01 | | | | |
| API-02 | | | | |
| ... | | | | |

---

## 9. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Product Owner | | | |
