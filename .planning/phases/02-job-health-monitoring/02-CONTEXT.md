# Phase 2: Job Health Monitoring - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Display job success/failure rates, duration trends, and retry patterns for all monitored jobs. Platform team uses this to identify problems proactively. This phase focuses on viewing/analyzing job health data — alerting and notifications are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Health metrics display
- Traffic light indicator (green/yellow/red) + percentage for success rate
- Thresholds: Green >= 90%, Yellow 70-89%, Red < 70%
- Tabs to switch between 7-day and 30-day views
- Expandable rows: compact by default, click to expand for details

### Job organization
- Problem-first view: failing jobs at top, then warnings, then healthy
- Always sorted by urgency — no user-configurable sorting needed
- Minimal filtering (detailed filter/drill-down is Phase 6)
- Collapsed row shows: job name, status indicator, success rate, "Last run: Xh ago"
- Expanded row shows: recent runs list (last 5-10) AND metrics summary (duration stats, retry count, failure reasons)

### Failure flagging logic
- P1: 2+ consecutive failures — red badge with "P1" label
- P2: Most recent run failed (single failure) — orange badge with "P2"
- P3: Success rate in yellow zone (70-89%) — yellow badge with "P3"
- Simple, predictable rules — no complex pattern detection

### Duration trend visualization
- "Sudden increase" = duration > 2x the 30-day median baseline
- Expanded view shows: line chart of duration over recent runs + stats table (median, p90, last run, baseline comparison)
- Anomalous duration: warning icon with tooltip showing comparison to baseline

### Retry handling
- Always show retry count in expanded metrics: "Retries: N in last 7 days"
- Add badge when retries > 2 in period (silent cost inflation flag)

### Claude's Discretion
- Exact chart library and styling
- Loading states and skeleton designs
- Error state handling
- Specific color shades for traffic light indicators

</decisions>

<specifics>
## Specific Ideas

- Problem-first sorting means platform team always sees most urgent issues immediately
- Traffic light + percentage gives quick at-a-glance status while still showing actual numbers
- P1/P2/P3 badges make priority explicit without requiring mental calculation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-job-health-monitoring*
*Context gathered: 2026-02-19*
