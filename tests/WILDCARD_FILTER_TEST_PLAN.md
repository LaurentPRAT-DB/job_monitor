# Wildcard Filter & Preset Edit Test Plan

## Overview
This test plan validates the job name wildcard filtering feature and preset edit functionality.

**Test Environment**: https://job-monitor-2556758628403379.aws.databricksapps.com (DEMO WEST)
**Tester Role**: Administrator
**Date**: 2026-02-26

---

## Pre-Test Setup

1. Open Chrome and navigate to the app URL
2. Authenticate with Databricks SSO
3. Navigate to any page with the global filter bar (Dashboard, Job Health, etc.)
4. Expand the Filters panel by clicking "Filters"

---

## Test Suite 1: Wildcard Pattern Syntax

### TC1.1: Asterisk (*) Matches Any Characters
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In pattern input, type `ETL-*` | Input shows "ETL-*" |
| 2 | Click + button or press Enter | Pattern chip "ETL-*" appears |
| 3 | Observe filtered results | Jobs matching "ETL-daily", "ETL-weekly", "ETL-hourly", "ETL-anything" shown |
| 4 | Verify non-matches hidden | Jobs like "daily-ETL", "MyETL" should NOT match |

### TC1.2: Asterisk at Start
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear existing patterns | All patterns removed |
| 2 | Add pattern `*-daily` | Pattern chip "*-daily" appears |
| 3 | Observe filtered results | Jobs ending in "-daily" shown (e.g., "ETL-daily", "reports-daily") |
| 4 | Verify non-matches hidden | Jobs like "daily-report", "dailyETL" should NOT match |

### TC1.3: Asterisk in Middle
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear existing patterns | All patterns removed |
| 2 | Add pattern `data*pipeline` | Pattern chip appears |
| 3 | Observe filtered results | Jobs like "data-pipeline", "data_etl_pipeline", "datapipeline" shown |

### TC1.4: Question Mark (?) Matches Single Character
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear existing patterns | All patterns removed |
| 2 | Add pattern `job-?` | Pattern chip "job-?" appears |
| 3 | Observe filtered results | Jobs like "job-1", "job-a", "job-X" shown |
| 4 | Verify non-matches hidden | Jobs like "job-12", "job-abc", "job-" should NOT match |

### TC1.5: Multiple Question Marks
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear existing patterns | All patterns removed |
| 2 | Add pattern `task-??` | Pattern chip appears |
| 3 | Observe filtered results | Jobs with exactly 2 chars after "task-" shown (e.g., "task-01", "task-AB") |
| 4 | Verify non-matches | "task-1", "task-123" should NOT match |

### TC1.6: Combined Wildcards
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear existing patterns | All patterns removed |
| 2 | Add pattern `*-v?` | Pattern chip appears |
| 3 | Observe filtered results | Jobs like "etl-v1", "pipeline-v2", "job-vA" shown |
| 4 | Verify non-matches | "etl-v12", "pipeline-version" should NOT match |

---

## Test Suite 2: Case-Insensitive Matching

### TC2.1: Lowercase Pattern Matches Uppercase Job
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add pattern `etl-*` (lowercase) | Pattern chip appears |
| 2 | Observe results | Jobs "ETL-daily", "Etl-Weekly", "etl-hourly" all match |

### TC2.2: Uppercase Pattern Matches Lowercase Job
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear and add pattern `DAILY-*` | Pattern chip appears |
| 2 | Observe results | Jobs "daily-report", "Daily-ETL", "DAILY-sync" all match |

### TC2.3: Mixed Case Pattern
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear and add pattern `DaTa-*` | Pattern chip appears |
| 2 | Observe results | All variations match regardless of case |

---

## Test Suite 3: Multiple Patterns (OR Logic)

### TC3.1: Two Patterns
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear all patterns | Clean state |
| 2 | Add pattern `ETL-*` | First chip appears |
| 3 | Add pattern `*-daily` | Second chip appears |
| 4 | Observe results | Jobs matching EITHER pattern shown |
| 5 | Verify OR logic | "ETL-weekly" shown (matches first), "reports-daily" shown (matches second) |

### TC3.2: Three or More Patterns
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add patterns: `ETL-*`, `*-sync`, `backup-?` | Three chips visible |
| 2 | Observe results | All jobs matching ANY of the three patterns shown |

### TC3.3: Remove One Pattern
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With multiple patterns active, click X on one chip | Pattern removed |
| 2 | Observe results | Results update to only match remaining patterns |

### TC3.4: Remove All Patterns
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Remove all pattern chips one by one | All chips removed |
| 2 | Observe results | All jobs shown (no filtering) |

---

## Test Suite 4: Pattern Input Validation

### TC4.1: Empty Pattern Rejected
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click + with empty input | Nothing happens (button disabled) |
| 2 | Type spaces only, click + | Error: "Pattern cannot be empty" |

### TC4.2: Duplicate Pattern Rejected
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add pattern `ETL-*` | Chip appears |
| 2 | Try to add `ETL-*` again | Error: "Pattern already exists" |
| 3 | Try to add `etl-*` (different case) | Error: "Pattern already exists" (case-insensitive check) |

### TC4.3: Invalid Characters Rejected
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Try pattern with `<script>` | Error: "Pattern contains invalid characters" |
| 2 | Try pattern with `; DROP TABLE` | Error: "Pattern contains invalid characters" |

### TC4.4: Long Pattern Rejected
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter pattern > 100 characters | Error: "Pattern is too long (max 100 characters)" |

### TC4.5: Enter Key Adds Pattern
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type `test-*` in input | Text visible |
| 2 | Press Enter key | Pattern chip added (same as clicking +) |

---

## Test Suite 5: URL Persistence

### TC5.1: Patterns Saved to URL
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add pattern `ETL-*` | Chip appears |
| 2 | Check browser URL | URL contains `jobNamePatterns=ETL-*` |
| 3 | Add second pattern `*-daily` | Second chip appears |
| 4 | Check URL | URL contains `jobNamePatterns=ETL-*,*-daily` |

### TC5.2: Page Refresh Preserves Patterns
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With patterns in URL, refresh page (F5) | Page reloads |
| 2 | Expand Filters panel | Same pattern chips restored |

### TC5.3: Direct URL Navigation
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Manually edit URL to add `?jobNamePatterns=backup-*` | Navigate |
| 2 | Open Filters panel | "backup-*" chip present |

### TC5.4: Clear Filters Removes from URL
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With patterns active, click "Clear" button | All filters cleared |
| 2 | Check URL | `jobNamePatterns` parameter removed |

---

## Test Suite 6: Preset Creation with Patterns

### TC6.1: Save Preset with Patterns
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add patterns: `ETL-*`, `*-daily` | Chips visible |
| 2 | Set Team filter to any team | Team selected |
| 3 | Click + button next to Presets dropdown | Save dialog opens |
| 4 | Enter name "ETL & Daily Jobs" | Name entered |
| 5 | Click "Save Preset" | Dialog closes, preset saved |
| 6 | Open Presets dropdown | New preset visible in list |

### TC6.2: Load Preset Restores Patterns
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear all current filters | Clean state |
| 2 | Select preset "ETL & Daily Jobs" from dropdown | Preset applied |
| 3 | Check pattern chips | `ETL-*` and `*-daily` chips restored |
| 4 | Check team filter | Team filter restored |

### TC6.3: Preset Persists After Page Reload
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Refresh page | Page reloads |
| 2 | Open Presets dropdown | "ETL & Daily Jobs" still listed |
| 3 | Select it | All filters including patterns restored |

---

## Test Suite 7: Preset Edit Mode

### TC7.1: Enter Edit Mode
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Presets dropdown | List of presets shown |
| 2 | Click pencil icon next to a preset | Edit dialog opens |
| 3 | Verify dialog title | Shows "Update preset" (not "Save current filters") |
| 4 | Verify preset name pre-filled | Name field shows preset's current name |
| 5 | Verify filters loaded | All preset's filters applied to current view |

### TC7.2: Modify Patterns and Save
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In edit mode, remove one pattern chip | Chip removed |
| 2 | Add a new pattern `backup-*` | New chip appears |
| 3 | Click "Update Preset" | Dialog closes |
| 4 | Clear filters | Clean state |
| 5 | Load the preset again | New pattern set restored (including `backup-*`) |

### TC7.3: Rename Preset
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click pencil to edit preset | Edit dialog opens |
| 2 | Change name to "Updated ETL Jobs" | Name modified |
| 3 | Click "Update Preset" | Saved |
| 4 | Open Presets dropdown | New name shown in list |

### TC7.4: Cancel Edit Mode
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click pencil to edit preset | Edit dialog opens |
| 2 | Make changes to name | Name modified |
| 3 | Click "Cancel" button | Dialog closes |
| 4 | Open preset again | Original values unchanged |

### TC7.5: Close Dialog Without Saving
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click pencil to edit preset | Edit dialog opens |
| 2 | Click outside dialog to close | Dialog closes |
| 3 | Open preset again | Original values unchanged |

---

## Test Suite 8: Delete Preset

### TC8.1: Delete Preset with Patterns
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Presets dropdown | List shown |
| 2 | Click trash icon next to preset | Preset deleted |
| 3 | Verify removal | Preset no longer in dropdown |
| 4 | Refresh page | Preset still gone (persisted) |

---

## Test Suite 9: Integration with Other Filters

### TC9.1: Pattern + Team Filter
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Team to "DataEngineering" | Team filtered |
| 2 | Add pattern `ETL-*` | Pattern added |
| 3 | Observe results | Only jobs matching BOTH team AND pattern shown |

### TC9.2: Pattern + Single Job Selection
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add pattern `ETL-*` | Pattern active |
| 2 | Select specific job from Job dropdown | Single job selected |
| 3 | Observe results | Only the selected job shown (single job takes precedence) |

### TC9.3: Pattern + Time Range
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add pattern `*-daily` | Pattern active |
| 2 | Change time range to 30D | Time range changed |
| 3 | Observe results | Filtered jobs shown with 30-day data |

### TC9.4: Active Filter Count Badge
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear all filters | Badge shows 0 or hidden |
| 2 | Add one pattern | Badge shows 1 |
| 3 | Add team filter | Badge shows 2 |
| 4 | Add another pattern | Badge still shows 2 (patterns count as 1) |

---

## Test Suite 10: Edge Cases

### TC10.1: Pattern with Only Wildcards
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add pattern `*` | Pattern accepted |
| 2 | Observe results | All jobs match |
| 3 | Add pattern `???` | Pattern accepted |
| 4 | Observe results | Only jobs with exactly 3 characters match |

### TC10.2: Escaped Special Characters
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add pattern `job.name-*` | Pattern accepted |
| 2 | Observe results | Literal `.` matched (not regex any char) |

### TC10.3: Empty Job List
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add very specific pattern `zzz-nonexistent-xyz` | Pattern added |
| 2 | Observe results | Empty state shown (no matching jobs) |
| 3 | UI handles gracefully | No errors, clear message |

### TC10.4: Special Characters in Job Names
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | If jobs exist with underscores, add `*_prod` | Pattern added |
| 2 | Observe results | Jobs like "etl_prod", "sync_prod" match |

---

## Test Results Summary

| Suite | Tests | Pass | Fail | Blocked | Notes |
|-------|-------|------|------|---------|-------|
| 1. Wildcard Syntax | 6 | 3 | | 3 | TC1.1, TC1.2, TC1.3 tested |
| 2. Case-Insensitive | 3 | | | 3 | Not tested yet |
| 3. Multiple Patterns | 4 | 2 | | 2 | TC3.1, TC3.3 passed |
| 4. Input Validation | 5 | | | 5 | Not tested yet |
| 5. URL Persistence | 4 | 2 | | 2 | TC5.1, TC5.2 passed |
| 6. Preset Creation | 3 | | | 3 | Dialog interaction issues |
| 7. Preset Edit | 5 | | | 5 | Not tested yet |
| 8. Delete Preset | 1 | | | 1 | Not tested yet |
| 9. Integration | 4 | | | 4 | Not tested yet |
| 10. Edge Cases | 4 | | | 4 | Not tested yet |
| **TOTAL** | **39** | **7** | **0** | **32** | Core filtering works |

### Test Session 2026-02-26

**Bug Found & Fixed**: Job Health page was not applying wildcard patterns from global filter.
- Root cause: `job-health.tsx` did not consume `filters.jobNamePatterns` from context
- Fix: Added `useFilters()` hook and `matchesJobPatterns()` client-side filtering
- Commit: `20c2aaf`

**Verified Working**:
- `aurora*` pattern → 3 matching jobs (aurora_ingestion_demo, aurora_ingestion_pipeline, aurora_lakehouse)
- `*_demo*` pattern → 108 matching jobs
- Multiple patterns (`*_demo*` + `*sync*`) → 122 jobs (OR logic)
- Pattern removal updates filter correctly
- URL persistence across page reload

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tester | | | |
| Developer | | | |
| Product Owner | | | |

---

## Notes & Observations

_Record any bugs, observations, or improvement suggestions during testing:_

1. **BUG FIXED**: Job Health page was not filtering by wildcard patterns (commit 20c2aaf)
2. **Save Preset dialog**: Has timing issues with button clicks - may need investigation
3. **Performance**: Client-side filtering with 3800+ jobs is fast and responsive
4. **URL encoding**: Multiple patterns use comma separation, URL-encoded as `%2C`
