# Phase 6: Dashboards & Reporting - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Provide tailored dashboard views for all user personas (platform ops, business teams, leadership) with filtering, drill-down, historical trend visualization, and automated scheduled reports (daily/weekly/monthly). This phase builds on existing health, cost, and alert data to deliver polished consumption experiences.

</domain>

<decisions>
## Implementation Decisions

### Filtering & Drill-down
- Global header bar for filters (applies to all pages, consistent experience)
- Three core filter dimensions: Team, Job, Time range
- Full URL encoding of filter state for shareable links
- Shared presets: team-wide saved filter combinations anyone can use

### Historical Views
- Time range selector: preset buttons (7/30/90 days) plus custom date picker
- Line charts for trend visualization (continuous lines showing metric progression)
- Previous period overlay: dashed line showing same-length prior period for comparison
- Auto granularity based on selected range: 7d = hourly, 30d = daily, 90d = weekly

### Report Content
- **Daily health summary:** Full status overview of all monitored jobs (not just failures)
- **Weekly cost report:** Anomaly-first format — lead with cost spikes and anomalies, then team breakdown
- **Monthly executive report:** Full detail with recommendations — TCO, reliability %, team rankings, plus optimization ROI and recommendations

### Report Delivery
- Email only as delivery channel (simple, works with existing workflows)
- Admin configures distribution lists per report type
- Fixed schedules: daily at 8am, weekly on Monday, monthly on 1st

### Claude's Discretion
- Visual density in reports (text+tables vs embedded charts — appropriate per report type)
- Whether to include in-app report archive with download capability
- Email formatting and styling

</decisions>

<specifics>
## Specific Ideas

- Shared presets should feel like team bookmarks — "My Team Last 7d" style naming
- Previous period comparison as dashed overlay is intuitive for quick before/after assessment
- Anomaly-first in weekly report ensures urgent items surface without scrolling

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-dashboards-reporting*
*Context gathered: 2026-02-25*
