# Phase 4: Cluster & Pipeline Integrity - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Platform team can identify over-provisioned clusters and detect data quality issues before they cascade. This phase adds cluster utilization visibility (CPU/memory metrics) and pipeline integrity monitoring (row count tracking, schema drift detection) to the existing job health dashboard.

</domain>

<decisions>
## Implementation Decisions

### Cluster Metrics Display
- Location: Expanded job row (add metrics section to existing expandable job details alongside duration chart)
- Visualization: Mini circular gauges showing average utilization percentage
- Color scheme: Inverted traffic light — Green = high utilization (efficient), Yellow = medium, Red = low (<40%, wasting resources)
- Granularity: Separate gauges for Driver CPU, Driver Memory, Worker CPU, Worker Memory (4 gauges total)

### Over-provisioned Flagging
- Visual treatment: Warning badge on job row with "Over-provisioned" label visible in main job list
- Threshold behavior: Sustained <40% utilization — only flag if consistently low across multiple recent runs (e.g., last 5 runs), not single occurrences
- Recommendations: Show specific right-sizing suggestions like "Consider reducing to 4 workers" based on actual usage patterns
- Recommendation location: Expanded job details alongside utilization gauges

### Claude's Discretion
- Row count tracking implementation (data source, baseline calculation, delta visualization)
- Schema drift detection mechanism (which changes to detect, how to surface drift)
- Exact gauge component library/styling
- Number of runs to consider for "sustained" threshold (suggested 5)
- Algorithm for generating right-sizing recommendations

</decisions>

<specifics>
## Specific Ideas

- Utilization gauges should follow the existing UI pattern established in Phase 2-3 (expandable rows with charts)
- Over-provisioned badge should match the visual weight of existing priority badges (P1/P2/P3)
- Right-sizing recommendations should be actionable and specific, not vague guidance

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-cluster-pipeline-integrity*
*Context gathered: 2026-02-24*
