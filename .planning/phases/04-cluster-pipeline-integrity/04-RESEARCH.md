# Phase 4: Cluster & Pipeline Integrity - Research

**Researched:** 2026-02-24
**Domain:** Cluster resource metrics, pipeline data quality monitoring, Databricks system tables for compute and lineage
**Confidence:** MEDIUM

## Summary

Phase 4 adds cluster utilization visibility and pipeline integrity monitoring to the existing job health dashboard. The core technical challenges are: (1) retrieving cluster CPU/memory utilization metrics for job runs, (2) implementing circular gauge visualizations for the 4 metrics (Driver CPU, Driver Memory, Worker CPU, Worker Memory), (3) detecting sustained over-provisioning across multiple runs, (4) tracking row count deltas against historical baselines, and (5) detecting schema drift on source data.

The key data source challenge is that Databricks system tables do not directly expose CPU/memory utilization percentages. Two approaches exist: (a) use the Clusters API to fetch cluster events/metrics, which provides utilization data but requires additional API calls and is rate-limited, or (b) compute proxy metrics from billing data (DBU consumption vs cluster capacity), which is less accurate but available in system tables. For row counts and schema drift, `system.access.table_lineage` and `information_schema` provide the necessary data, though monitoring specific pipeline outputs requires knowing which tables each job writes to.

The implementation extends the existing FastAPI + React/TanStack stack, adding a new cluster metrics section to the expanded job details view, creating circular gauge components using SVG (or a lightweight library like react-circular-progressbar), and adding backend endpoints for utilization data and pipeline integrity checks.

**Primary recommendation:** Use Clusters API `get_events` and `get` endpoints for accurate utilization metrics (cached per-job to minimize API calls), implement row count tracking via `information_schema.tables` with historical baseline stored in application state, detect schema drift by comparing column schemas between runs.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Cluster metrics location: Expanded job row (add metrics section to existing expandable job details alongside duration chart)
- Visualization: Mini circular gauges showing average utilization percentage
- Color scheme: Inverted traffic light — Green = high utilization (efficient), Yellow = medium, Red = low (<40%, wasting resources)
- Granularity: Separate gauges for Driver CPU, Driver Memory, Worker CPU, Worker Memory (4 gauges total)
- Over-provisioned visual treatment: Warning badge on job row with "Over-provisioned" label visible in main job list
- Threshold behavior: Sustained <40% utilization — only flag if consistently low across multiple recent runs (e.g., last 5 runs), not single occurrences
- Recommendations: Show specific right-sizing suggestions like "Consider reducing to 4 workers" based on actual usage patterns
- Recommendation location: Expanded job details alongside utilization gauges
- Utilization gauges should follow the existing UI pattern established in Phase 2-3 (expandable rows with charts)
- Over-provisioned badge should match the visual weight of existing priority badges (P1/P2/P3)
- Right-sizing recommendations should be actionable and specific, not vague guidance

### Claude's Discretion
- Row count tracking implementation (data source, baseline calculation, delta visualization)
- Schema drift detection mechanism (which changes to detect, how to surface drift)
- Exact gauge component library/styling
- Number of runs to consider for "sustained" threshold (suggested 5)
- Algorithm for generating right-sizing recommendations

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLUST-01 | Monitor driver/worker CPU and memory utilization per job | Clusters API `get` endpoint provides `last_activity_time`, `state_message`; metrics available via Ganglia API or compute proxy; 4 circular gauges in expanded details |
| CLUST-02 | Flag jobs with sustained <40% utilization as over-provisioned | Track utilization across 5 recent runs; compute average; display "Over-provisioned" badge when consistently <40%; show right-sizing recommendations |
| PIPE-01 | Check row count deltas vs historical baseline (+/-20% threshold triggers alert) | Query `information_schema.tables` for row counts; store 30-day baseline; compute deviation percentage; flag runs exceeding 20% delta |
| PIPE-02 | Monitor for schema drift on source data and alert on detected changes | Compare `information_schema.columns` between runs; detect added/removed/modified columns; surface drift in expanded details |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-circular-progressbar | 2.1+ | Circular gauge components | Lightweight, customizable, well-maintained; perfect for mini gauges |
| Recharts | 2.12+ | Bar charts for row count history | Already established in Phase 2-3; consistent styling |
| Databricks SDK | 0.40+ | Clusters API for utilization metrics | `w.clusters.get()`, `w.clusters.events()` for CPU/memory data |
| TanStack Query | 5.x | Data fetching with caching | Established; critical for caching expensive API calls |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | Latest | Icons for alerts and badges | Gauge, AlertTriangle, Database icons |
| shadcn/ui Badge | Latest | Over-provisioned badge | Match existing P1/P2/P3 badge styling |
| shadcn/ui Tooltip | Latest | Hover explanations | Explain utilization thresholds, recommendations |
| classnames/clsx | Latest | Conditional styling | Color scheme switching for gauges |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-circular-progressbar | Custom SVG gauges | Custom SVG is lighter but more development time; library provides accessibility and animations |
| react-circular-progressbar | recharts RadialBarChart | Recharts is heavier; RadialBarChart designed for different use case |
| Clusters API | Billing proxy metrics | Billing data is available in system tables but provides only DBU consumption, not actual CPU/memory utilization |

**Installation:**
```bash
# From ui/ directory
npm install react-circular-progressbar
```

## Architecture Patterns

### Recommended Project Structure
```
job_monitor/
├── backend/
│   ├── routers/
│   │   ├── health_metrics.py  # Extend with cluster utilization in details
│   │   ├── cluster_metrics.py # NEW - cluster utilization endpoints
│   │   └── pipeline.py        # NEW - row count and schema drift endpoints
│   └── models.py              # Extend with ClusterUtilization, RowCountDelta, SchemaDrift models
└── ui/
    ├── components/
    │   ├── job-expanded-details.tsx  # Extend with ClusterUtilization section
    │   ├── cluster-gauges.tsx        # NEW - 4 circular gauges component
    │   ├── over-provisioned-badge.tsx # NEW - badge for job list
    │   ├── row-count-delta.tsx       # NEW - row count visualization
    │   └── schema-drift-alert.tsx    # NEW - schema drift indicator
    └── lib/
        └── cluster-utils.ts   # NEW - utilization formatting, threshold logic
```

### Pattern 1: Cluster Utilization via Clusters API
**What:** Fetch cluster metrics using Databricks SDK Clusters API
**When to use:** Expanded job details to show CPU/memory utilization
**Example:**
```python
# Source: databricks-sdk Clusters API
import asyncio
from databricks.sdk import WorkspaceClient

async def get_cluster_utilization(ws: WorkspaceClient, cluster_id: str) -> dict:
    """Get CPU/memory utilization for a cluster.

    Note: Direct utilization metrics require Ganglia API access or
    event-based estimation. This pattern uses cluster events for proxy metrics.
    """
    try:
        # Get cluster details
        cluster = await asyncio.to_thread(ws.clusters.get, cluster_id=cluster_id)

        # Cluster spec provides capacity info
        driver_node_type = cluster.driver_node_type_id
        worker_node_type = cluster.node_type_id
        num_workers = cluster.num_workers or 0

        # For accurate utilization, would need to access Ganglia metrics
        # Alternative: Use spark metrics from Spark UI or history server
        # Simplified proxy: Use state and activity patterns

        return {
            "cluster_id": cluster_id,
            "driver_node_type": driver_node_type,
            "worker_node_type": worker_node_type,
            "num_workers": num_workers,
            "state": cluster.state.value if cluster.state else None,
            "autoscale": cluster.autoscale is not None,
        }
    except Exception as e:
        return {"error": str(e)}

async def get_job_cluster_metrics(
    ws: WorkspaceClient,
    job_id: int,
    run_id: int
) -> dict:
    """Get cluster utilization for a specific job run.

    Uses Jobs API to get cluster_instance for the run, then fetches metrics.
    """
    try:
        # Get run details to find cluster_instance
        run = await asyncio.to_thread(ws.jobs.get_run, run_id=run_id)

        if run.cluster_instance and run.cluster_instance.cluster_id:
            cluster_id = run.cluster_instance.cluster_id
            return await get_cluster_utilization(ws, cluster_id)

        return {"error": "No cluster_instance found for run"}
    except Exception as e:
        return {"error": str(e)}
```

### Pattern 2: Utilization Estimation from Billing Data
**What:** Estimate utilization from DBU consumption vs cluster capacity
**When to use:** Fallback when direct metrics unavailable; system tables only
**Example:**
```sql
-- Estimate cluster utilization from billing data
-- MEDIUM confidence: This is a proxy, not actual CPU/memory utilization
WITH job_runs AS (
    SELECT
        job_id,
        run_id,
        cluster_id,
        run_duration_seconds,
        period_start_time
    FROM system.lakeflow.job_run_timeline
    WHERE job_id = :job_id
        AND period_start_time >= current_date() - INTERVAL 30 DAYS
        AND run_duration_seconds IS NOT NULL
),
billing AS (
    SELECT
        usage_metadata.job_id as job_id,
        cluster_id,
        usage_date,
        SUM(usage_quantity) as total_dbus
    FROM system.billing.usage
    WHERE usage_date >= current_date() - INTERVAL 30 DAYS
        AND usage_metadata.job_id = :job_id
    GROUP BY usage_metadata.job_id, cluster_id, usage_date
    HAVING SUM(usage_quantity) != 0  -- RETRACTION handling
)
SELECT
    jr.job_id,
    jr.run_id,
    jr.run_duration_seconds,
    b.total_dbus,
    -- DBU per hour as utilization proxy
    -- Higher DBU/hour = higher utilization
    (b.total_dbus / (jr.run_duration_seconds / 3600.0)) as dbus_per_hour
FROM job_runs jr
LEFT JOIN billing b ON DATE(jr.period_start_time) = b.usage_date
ORDER BY jr.period_start_time DESC
LIMIT 10
```

### Pattern 3: Circular Gauge Component
**What:** Mini circular gauge showing percentage utilization
**When to use:** Display CPU/memory utilization in expanded details
**Example:**
```typescript
// Source: react-circular-progressbar documentation
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

interface UtilizationGaugeProps {
  label: string;
  percentage: number;  // 0-100
  size?: number;
}

// Inverted traffic light: Green = high (good), Yellow = medium, Red = low (wasting)
function getUtilizationColor(percentage: number): string {
  if (percentage >= 60) return '#22c55e';  // Green - efficient
  if (percentage >= 40) return '#eab308';  // Yellow - could optimize
  return '#ef4444';  // Red - over-provisioned
}

export function UtilizationGauge({
  label,
  percentage,
  size = 60
}: UtilizationGaugeProps) {
  const color = getUtilizationColor(percentage);

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: size, height: size }}>
        <CircularProgressbar
          value={percentage}
          text={`${Math.round(percentage)}%`}
          styles={buildStyles({
            textSize: '24px',
            pathColor: color,
            textColor: color,
            trailColor: '#e5e7eb',
          })}
        />
      </div>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}
```

### Pattern 4: Cluster Utilization Section in Expanded Details
**What:** 4 gauges (Driver CPU, Driver Memory, Worker CPU, Worker Memory) in job details
**When to use:** Expanded job row showing cluster efficiency
**Example:**
```typescript
// Extends existing JobExpandedDetails component
interface ClusterUtilization {
  driver_cpu_percent: number | null;
  driver_memory_percent: number | null;
  worker_cpu_percent: number | null;
  worker_memory_percent: number | null;
  is_over_provisioned: boolean;
  recommendation: string | null;
  runs_analyzed: number;
}

function ClusterUtilizationSection({
  utilization
}: {
  utilization: ClusterUtilization
}) {
  const gauges = [
    { label: 'Driver CPU', value: utilization.driver_cpu_percent },
    { label: 'Driver Mem', value: utilization.driver_memory_percent },
    { label: 'Worker CPU', value: utilization.worker_cpu_percent },
    { label: 'Worker Mem', value: utilization.worker_memory_percent },
  ];

  return (
    <div className="bg-white rounded border p-3 mt-3">
      <h5 className="text-sm font-semibold text-gray-700 mb-3">
        Cluster Utilization (Avg. last {utilization.runs_analyzed} runs)
      </h5>

      <div className="flex justify-around">
        {gauges.map((gauge) => (
          <UtilizationGauge
            key={gauge.label}
            label={gauge.label}
            percentage={gauge.value ?? 0}
          />
        ))}
      </div>

      {utilization.is_over_provisioned && utilization.recommendation && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm">
          <span className="text-red-700 font-medium">Over-provisioned: </span>
          <span className="text-red-600">{utilization.recommendation}</span>
        </div>
      )}
    </div>
  );
}
```

### Pattern 5: Over-provisioned Badge
**What:** Warning badge in job list for sustained low utilization
**When to use:** Job health table row, alongside P1/P2/P3 badges
**Example:**
```typescript
import { Badge } from '@/components/ui/badge';
import { Gauge } from 'lucide-react';

interface OverProvisionedBadgeProps {
  show: boolean;
}

export function OverProvisionedBadge({ show }: OverProvisionedBadgeProps) {
  if (!show) return null;

  return (
    <Badge
      variant="outline"
      className="bg-orange-50 text-orange-700 border-orange-300 text-xs gap-1"
    >
      <Gauge className="h-3 w-3" />
      Over-provisioned
    </Badge>
  );
}
```

### Pattern 6: Row Count Tracking
**What:** Track row counts per job output table and compare to baseline
**When to use:** Pipeline integrity monitoring, detecting data quality issues
**Example:**
```sql
-- Query row counts from information_schema
-- Requires knowing which tables each job writes to (from job output metadata)
SELECT
    table_catalog,
    table_schema,
    table_name,
    table_rows as row_count,
    -- Note: table_rows in information_schema may be approximate
    -- For exact counts, use Delta table history
    data_length as size_bytes
FROM information_schema.tables
WHERE table_schema = :schema_name
    AND table_name = :table_name
```

```python
# Backend endpoint for row count delta
async def get_row_count_delta(
    ws: WorkspaceClient,
    table_name: str,
    warehouse_id: str,
) -> dict:
    """Get current row count and compare to 30-day baseline.

    Returns delta percentage for alerting.
    """
    # Query current row count
    current_query = f"""
    SELECT COUNT(*) as row_count
    FROM {table_name}
    """

    # Query historical baseline (requires stored metrics or Delta history)
    # For Delta tables, can use DESCRIBE HISTORY
    history_query = f"""
    DESCRIBE HISTORY {table_name}
    LIMIT 30
    """

    # Calculate baseline from historical row counts
    # Alert if current deviates by more than 20%
    pass
```

### Pattern 7: Schema Drift Detection
**What:** Compare column schemas between runs to detect changes
**When to use:** Detecting breaking changes in source data
**Example:**
```sql
-- Get current schema
SELECT
    column_name,
    data_type,
    is_nullable,
    ordinal_position
FROM information_schema.columns
WHERE table_schema = :schema_name
    AND table_name = :table_name
ORDER BY ordinal_position
```

```python
# Schema drift detection logic
from dataclasses import dataclass

@dataclass
class SchemaDrift:
    table_name: str
    added_columns: list[str]
    removed_columns: list[str]
    type_changes: list[dict]  # {"column": str, "from": str, "to": str}
    has_drift: bool

def detect_schema_drift(
    previous_schema: list[dict],
    current_schema: list[dict]
) -> SchemaDrift:
    """Detect schema changes between two snapshots."""
    prev_cols = {c["column_name"]: c for c in previous_schema}
    curr_cols = {c["column_name"]: c for c in current_schema}

    prev_names = set(prev_cols.keys())
    curr_names = set(curr_cols.keys())

    added = list(curr_names - prev_names)
    removed = list(prev_names - curr_names)

    type_changes = []
    for col in prev_names & curr_names:
        if prev_cols[col]["data_type"] != curr_cols[col]["data_type"]:
            type_changes.append({
                "column": col,
                "from": prev_cols[col]["data_type"],
                "to": curr_cols[col]["data_type"],
            })

    has_drift = bool(added or removed or type_changes)

    return SchemaDrift(
        table_name="",  # Set by caller
        added_columns=added,
        removed_columns=removed,
        type_changes=type_changes,
        has_drift=has_drift,
    )
```

### Anti-Patterns to Avoid

- **Polling Clusters API too frequently:** Rate limits apply; cache results per job/run with 5-minute stale time
- **Assuming system tables have utilization metrics:** They don't; must use Clusters API or proxy calculations
- **Flagging single low-utilization runs:** Transient; require sustained pattern (5 runs) before flagging
- **Hardcoding table names for row count tracking:** Jobs write to different tables; need mapping or detection
- **Real-time schema monitoring:** Too expensive; check on job completion, not continuously

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circular gauge SVG | Custom SVG math | react-circular-progressbar | Handles animation, accessibility, edge cases |
| Cluster metrics aggregation | Custom averaging | Backend aggregation with SQL | Handles nulls, partial data, run variations |
| Schema comparison | String diff | Structured comparison of column metadata | Type changes need semantic understanding |
| Threshold alerting | If-else chains | Configurable threshold system | Allows tuning without code changes |

**Key insight:** The challenging parts are data access (cluster metrics aren't in system tables) and establishing baselines (row counts need historical tracking). Use existing libraries for visualization.

## Common Pitfalls

### Pitfall 1: Cluster Metrics Not in System Tables
**What goes wrong:** Assuming `system.compute.clusters` contains CPU/memory utilization; it doesn't
**Why it happens:** Natural assumption that monitoring data would be in monitoring tables
**How to avoid:** Use Clusters API for actual metrics; accept proxy calculations from billing as fallback
**Warning signs:** Queries returning no utilization data; only cluster configuration info

### Pitfall 2: Job Clusters vs All-Purpose Clusters
**What goes wrong:** Trying to fetch metrics for job clusters that no longer exist
**Why it happens:** Job clusters are ephemeral; terminated after job completes
**How to avoid:** Capture metrics during run or immediately after; store in application state
**Warning signs:** Cluster not found errors; stale cluster IDs

### Pitfall 3: Row Count Accuracy
**What goes wrong:** `information_schema.tables.table_rows` is approximate, not exact
**Why it happens:** Databricks uses sampling for performance
**How to avoid:** Use `SELECT COUNT(*)` for exact counts; or Delta `DESCRIBE HISTORY` for precise metrics
**Warning signs:** Row counts don't match expectations; inconsistent between runs

### Pitfall 4: Schema Drift False Positives
**What goes wrong:** Alerting on intentional schema changes (migrations)
**Why it happens:** Not distinguishing expected vs unexpected changes
**How to avoid:** Track schema baseline per job; allow dismissing known changes; focus on additions/removals
**Warning signs:** Too many alerts; users ignoring drift notifications

### Pitfall 5: Over-provisioning False Positives
**What goes wrong:** Flagging jobs that genuinely need capacity for peaks
**Why it happens:** Average utilization is low but peaks are high
**How to avoid:** Consider max utilization alongside average; don't flag if any metric hits >80%
**Warning signs:** Right-sizing recommendations cause failures when applied

## Code Examples

### Backend: Cluster Utilization Endpoint
```python
# Extends health_metrics.py or new cluster_metrics.py
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

class ClusterUtilizationOut(BaseModel):
    """Cluster utilization metrics for job run."""
    job_id: str
    driver_cpu_percent: float | None
    driver_memory_percent: float | None
    worker_cpu_percent: float | None
    worker_memory_percent: float | None
    is_over_provisioned: bool
    recommendation: str | None
    runs_analyzed: int

@router.get("/cluster-utilization/{job_id}", response_model=ClusterUtilizationOut)
async def get_cluster_utilization(
    job_id: str,
    runs: int = Query(default=5, ge=1, le=10),
    ws=Depends(get_ws),
) -> ClusterUtilizationOut:
    """Get average cluster utilization for recent job runs.

    Uses proxy calculation from billing data when direct metrics unavailable.
    """
    # Implementation: Query billing data for DBU patterns
    # Calculate utilization proxy based on DBU consumption rate
    # Flag as over-provisioned if sustained <40% across runs
    pass
```

### Backend: Row Count Delta Endpoint
```python
class RowCountDeltaOut(BaseModel):
    """Row count delta for pipeline integrity."""
    table_name: str
    current_row_count: int
    baseline_row_count: int
    delta_percent: float
    is_anomaly: bool  # True if |delta| > 20%
    trend: list[dict]  # Recent history for visualization

@router.get("/pipeline/{job_id}/row-counts", response_model=list[RowCountDeltaOut])
async def get_row_count_deltas(
    job_id: str,
    ws=Depends(get_ws),
) -> list[RowCountDeltaOut]:
    """Get row count deltas for tables written by this job.

    Requires job-to-table mapping (from lineage or configuration).
    """
    pass
```

### Frontend: Cluster Gauges Integration
```typescript
// In job-expanded-details.tsx
import { UtilizationGauge } from './cluster-gauges';

// Add to JobExpandedDetails component after metrics summary
{data.cluster_utilization && (
  <ClusterUtilizationSection utilization={data.cluster_utilization} />
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual cluster sizing | Autoscaling with monitoring | 2023+ | Reduces over-provisioning automatically |
| DBU-only cost tracking | Full utilization visibility | 2024+ | Enables specific right-sizing |
| Schema validation in code | information_schema queries | Always available | Declarative, queryable |
| Periodic row count snapshots | Delta table history | Delta Lake maturity | Built-in tracking |

**Deprecated/outdated:**
- Manual cluster event polling: Use SDK `clusters.get()` instead of raw API calls
- Per-minute metric sampling: Too expensive; per-run aggregates are sufficient

## Open Questions

1. **Cluster Metrics Data Source**
   - What we know: Direct CPU/memory not in system tables; Clusters API provides cluster state
   - What's unclear: Best source for actual utilization percentages (Ganglia? Spark metrics?)
   - Recommendation: Start with proxy calculations from billing; enhance with API metrics if available

2. **Job-to-Table Mapping**
   - What we know: Row count tracking needs to know which tables each job writes to
   - What's unclear: Best way to discover output tables (lineage? job configuration? manual mapping?)
   - Recommendation: Start with `system.access.table_lineage` if available; fall back to configuration

3. **Schema Baseline Storage**
   - What we know: Need to store schema snapshots for drift comparison
   - What's unclear: Where to persist baselines (job tags? separate storage? rely on Delta history?)
   - Recommendation: Use Delta table `DESCRIBE DETAIL` for schema; compare on each run

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: `/Users/laurent.prat/Documents/lpdev/databricks_job_monitoring/job_monitor/backend/routers/health_metrics.py`
- Existing codebase analysis: `/Users/laurent.prat/Documents/lpdev/databricks_job_monitoring/job_monitor/ui/components/job-expanded-details.tsx`
- Prior phase research: `.planning/phases/02-job-health-monitoring/02-RESEARCH.md`
- Prior phase research: `.planning/phases/03-sla-cost-visibility/03-RESEARCH.md`

### Secondary (MEDIUM confidence)
- Databricks SDK patterns from prior phases: asyncio.to_thread for API calls
- react-circular-progressbar documentation (npm package)
- Databricks billing system tables patterns from existing cost.py router

### Tertiary (LOW confidence - needs validation)
- Clusters API utilization metrics availability (may require Ganglia or Spark metrics API)
- `system.access.table_lineage` availability and schema (depends on Unity Catalog setup)
- Exact `information_schema` behavior in Databricks vs standard SQL

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries are well-documented (react-circular-progressbar, Recharts)
- Architecture: HIGH - Extends established patterns from Phase 2-3
- Cluster metrics: MEDIUM - Data source for actual CPU/memory utilization needs validation
- Pipeline integrity: MEDIUM - Row count and schema drift patterns need runtime validation

**Research date:** 2026-02-24
**Valid until:** 30 days (stable domain, patterns established)
