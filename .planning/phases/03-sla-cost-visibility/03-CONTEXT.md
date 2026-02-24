# Phase 3: SLA & Cost Visibility - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Platform team can define SLA targets per job, track breach history, and see cost attribution by job and team. Includes:
- SLA target definition (expected completion time per job)
- SLA breach tracking and visualization
- DBU cost calculation per job/run with RETRACTION handling
- Cost attribution to teams via job tags
- Cost anomaly detection (>2x p90 baseline flagged)
- Zombie job identification (scheduled but minimal processing)

Out of scope: Alerting/notifications (Phase 5), scheduled reports (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### SLA Target Definition
- Duration-based SLA only (expected completion time in minutes/hours)
- Inline editing in job list table (click to edit pattern)
- Auto-suggest SLA based on p90 historical duration when no SLA defined
- Store SLA targets as Databricks job tags (travels with the job)

### Cost Attribution Mapping
- Use Databricks job tags for team/owner attribution
- Tag keys are configurable in app (admin can specify which tag names to use)
- Untagged jobs highlighted for action (drives governance adoption)
- Allow editing team tags directly from the app (via Jobs API)

### Breach & Anomaly Display
- SLA breaches shown as timeline sparkline on job row (visual breach history)
- Cost anomalies (>2x p90) displayed in separate "Anomalies" tab
- Zombie jobs detected using both indicators:
  - High cost vs low/zero rows processed ratio
  - Running duration with no detectable output
- Include quick link to Databricks job settings from breach/anomaly views

### Cost Breakdown Detail
- Summary shows daily aggregates, drill-down shows per-run costs
- Toggle between DBU and estimated $ display (configurable rate)
- Break down costs by SKU type (Jobs Compute, SQL, etc.)
- Team-level rollups in sortable table (cost, job count, trend)

### Claude's Discretion
- Exact sparkline implementation for breach timeline
- Specific thresholds for zombie job detection (cost/row ratio, output detection)
- DBU-to-dollar rate configuration UI
- Anomalies tab layout and filtering

</decisions>

<specifics>
## Specific Ideas

- SLA editing follows same inline click-to-edit pattern as Phase 2 job health table
- Team cost table should be sortable like job health table (consistent UX)
- Anomalies tab keeps main job list clean while surfacing issues prominently
- Job tags used for both SLA (e.g., `sla_minutes`) and team (`team`, `owner`) - single source of truth

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-sla-cost-visibility*
*Context gathered: 2026-02-24*
