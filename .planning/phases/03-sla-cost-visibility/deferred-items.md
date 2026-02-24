# Deferred Items - Phase 03

Items discovered during execution that are out of scope for the current plan.

## Pre-existing TypeScript Errors

### job-health.tsx type mismatch (Discovered: 2026-02-24)

**File:** `job_monitor/ui/routes/_sidebar/job-health.tsx`
**Error:**
```
routes/_sidebar/job-health.tsx(143,11): error TS2322: Type 'JobHealth[]' is not assignable to type 'JobWithSla[]'.
  Type 'JobHealth' is missing the following properties from type 'JobWithSla': sla_minutes, suggested_p90_minutes, breach_history, breach_count_30d
```

**Context:** The job-health-table component was updated to expect `JobWithSla[]` but the page still provides `JobHealth[]`. This is a Phase 3 SLA integration issue that existed before Plan 03-03 started.

**Impact:** Does not affect costs dashboard functionality.

**Suggested fix:** Update the fetch function in job-health.tsx to fetch the SLA-extended endpoint, or update job-health-table to accept the base JobHealth type.
