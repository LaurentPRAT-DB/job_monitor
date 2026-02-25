# Phase 5: Alerting & Remediation - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Platform team receives proactive alerts with actionable recommendations before issues impact business users. This phase adds an alerting system on top of existing monitoring data (job health, SLA, cost, cluster metrics). Alert configuration, external integrations (Slack, email), and scheduled reports are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Alert Presentation
- Both dedicated Alerts page AND slide-out drawer accessible from header
- Alerts page for full review/history with filtering
- Drawer for quick access from anywhere without losing context
- Header badge count + toast notifications for new P1/P2 alerts
- Inline alert indicators on job rows (small icon/badge on jobs with active alerts, click opens drawer)
- Alerts page grouped by severity first: P1 section, then P2, then P3

### Severity & Categories
- 4 alert categories matching existing domains: Failure, SLA, Cost, Cluster
- P1 severity: 2+ consecutive failures OR SLA breach (actual breach, not just risk)
- P2 severity: SLA breach risk (80% threshold) and cost anomalies (>2x spike)
- P3 severity: Single failures, informational warnings
- Visual treatment: Color + icon per severity (red/critical icon for P1, orange/warning for P2, yellow/info for P3)

### Remediation Format
- Actionable one-liner suggestions (not multi-step runbooks)
- Context-aware with specifics: "Reduce to 4 workers" based on actual data, not generic "reduce cluster size"
- Inline with alert card/row - no extra click needed to see remediation
- Acknowledge-only model: mark as "acknowledged" but keep visible until underlying condition resolves

### Proactive Warnings
- Budget thresholds configurable at both job level (via job tags) and team level (aggregate monthly)
- Budget warnings: P2 at 80% approaching, P1 at 100% exceeded
- Proactive warnings auto-resolve when risk passes (job finishes within SLA, cost returns to normal)

### Claude's Discretion
- SLA breach risk trigger logic (80% of time elapsed, or combined with duration trending)
- Exact alert polling/refresh frequency
- Toast notification auto-dismiss timing
- Alert card layout and spacing details

</decisions>

<specifics>
## Specific Ideas

- Alert indicators on job rows should be subtle but noticeable - don't overwhelm the existing job health table
- P1/P2/P3 visual treatment should feel distinct from existing priority badges on job rows (alerts are about current issues, priority is about job importance)
- Remediation suggestions should read like advice from a senior engineer: specific, actionable, no jargon

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-alerting-remediation*
*Context gathered: 2026-02-25*
