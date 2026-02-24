# Phase 3: SLA & Cost Visibility - Research

**Researched:** 2026-02-24
**Domain:** SLA management, cost attribution, Databricks billing system tables, Jobs API tag management
**Confidence:** HIGH

## Summary

Phase 3 extends the job health dashboard with SLA targets, breach tracking, cost attribution, and anomaly detection. The core technical challenges are: (1) storing SLA targets in Databricks job tags and reading/writing via Jobs API, (2) calculating per-job DBU costs from system.billing.usage with RETRACTION handling and SKU breakdown, (3) implementing inline editing for SLA targets using established UI patterns, and (4) creating sparkline visualizations for SLA breach history.

The implementation leverages the existing FastAPI + React/TanStack stack, extending the jobs API endpoints to handle tag updates, adding billing aggregation queries, and creating new UI components for cost visualization. Key architectural decisions include: using Databricks job tags as the single source of truth for SLA targets and team attribution (avoiding a separate database), configurable tag key names for flexibility, and a dedicated Anomalies tab to separate exceptional cases from the main health view.

Cost calculation requires joining job_run_timeline with system.billing.usage by job_id, handling RETRACTION records with the established HAVING SUM(usage_quantity) != 0 pattern, and breaking down costs by SKU type. Zombie job detection combines cost data with run duration and output metrics to identify scheduled jobs that consume resources without meaningful processing.

**Primary recommendation:** Extend existing job health endpoints with SLA/cost fields, use Jobs API for tag read/write operations, add billing aggregation queries with SKU breakdown, implement sparkline component using Recharts for compact breach visualization.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Duration-based SLA only (expected completion time in minutes/hours)
- Inline editing in job list table (click to edit pattern)
- Auto-suggest SLA based on p90 historical duration when no SLA defined
- Store SLA targets as Databricks job tags (travels with the job)
- Use Databricks job tags for team/owner attribution
- Tag keys are configurable in app (admin can specify which tag names to use)
- Untagged jobs highlighted for action (drives governance adoption)
- Allow editing team tags directly from the app (via Jobs API)
- SLA breaches shown as timeline sparkline on job row (visual breach history)
- Cost anomalies (>2x p90) displayed in separate "Anomalies" tab
- Zombie jobs detected using both indicators: high cost vs low/zero rows processed ratio, running duration with no detectable output
- Include quick link to Databricks job settings from breach/anomaly views
- Summary shows daily aggregates, drill-down shows per-run costs
- Toggle between DBU and estimated $ display (configurable rate)
- Break down costs by SKU type (Jobs Compute, SQL, etc.)
- Team-level rollups in sortable table (cost, job count, trend)

### Claude's Discretion
- Exact sparkline implementation for breach timeline
- Specific thresholds for zombie job detection (cost/row ratio, output detection)
- DBU-to-dollar rate configuration UI
- Anomalies tab layout and filtering

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLA-01 | Define expected completion windows per job (SLA targets) | Store as job tag `sla_minutes`; read/write via Jobs API `w.jobs.update()`; inline editing pattern from Phase 2 |
| SLA-02 | Track SLA breach history for optimization prioritization | Query job_run_timeline comparing duration to SLA tag; aggregate breaches over time; sparkline visualization with Recharts |
| COST-01 | Calculate DBU cost per job per run using system tables + pricing data | Join job_run_timeline with system.billing.usage on job_id; established RETRACTION handling with HAVING clause; group by SKU type |
| COST-02 | Attribute costs to teams/business units via job metadata mapping | Read team tag from job settings; configurable tag key name; team rollup aggregation query |
| COST-04 | Detect sudden DBU spikes (>2x p90 baseline) as anomalies | Reuse Phase 2 p90 calculation pattern; compare current cost to rolling baseline; flag in separate Anomalies tab |
| COST-05 | Identify zombie jobs (scheduled but processing minimal records) | Compute cost/duration ratio; threshold-based detection; highlight in anomalies with link to job settings |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | 2.12+ | Sparkline and cost charts | Already established in Phase 2; supports mini LineChart for sparklines |
| shadcn/ui Input | Latest | Inline editing for SLA targets | Part of established component library |
| TanStack Query | 5.x | Data fetching with mutations | Established; supports optimistic updates for tag edits |
| Databricks SDK | 0.40+ | Jobs API for tag management | w.jobs.get(), w.jobs.update() for reading/writing tags |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Tabs | Latest | Anomalies tab separation | Already used in Phase 2 for 7/30 day toggle |
| shadcn/ui Dialog | Latest | Cost detail drill-down | Modal for per-run cost breakdown |
| shadcn/ui Select | Latest | Tag key configuration | Admin settings for tag key names |
| lucide-react | Latest | Icons for SLA/cost indicators | Clock, DollarSign, AlertTriangle icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Job tags for SLA storage | Separate database table | Tags travel with job, no external persistence needed; tags have size limits |
| Recharts sparkline | react-sparklines | Recharts already in stack; consistent API and styling |
| Inline table editing | Modal form | Inline is faster for single-field edits; matches Phase 2 pattern decision |

**Installation:**
```bash
# Already installed from Phase 2, add Dialog if needed
npx shadcn@latest add dialog select
```

## Architecture Patterns

### Recommended Project Structure
```
job_monitor/
├── backend/
│   ├── routers/
│   │   ├── health_metrics.py  # Extend with SLA fields
│   │   ├── cost.py            # NEW - cost aggregation endpoints
│   │   └── job_tags.py        # NEW - job tag read/write endpoints
│   ├── models.py              # Extend with SLA/cost models
│   └── config.py              # Add configurable tag keys, DBU rate
└── ui/
    ├── routes/_sidebar/
    │   ├── job-health.tsx     # Add SLA column, sparkline
    │   ├── costs.tsx          # NEW - cost breakdown page
    │   └── anomalies.tsx      # NEW - anomalies tab
    ├── components/
    │   ├── sla-sparkline.tsx       # NEW - compact breach history
    │   ├── inline-sla-edit.tsx     # NEW - click-to-edit SLA
    │   ├── cost-breakdown.tsx      # NEW - per-job cost detail
    │   └── team-cost-table.tsx     # NEW - team rollup table
    └── lib/
        └── cost-utils.ts      # NEW - formatting helpers
```

### Pattern 1: Job Tag Read/Write via Jobs API
**What:** Read SLA targets and team attribution from job tags; update via Jobs API
**When to use:** Any SLA or team tag operation
**Example:**
```python
# Source: databricks-python-sdk SKILL.md + Jobs API documentation
import asyncio
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.jobs import JobSettings

async def get_job_tags(ws: WorkspaceClient, job_id: int) -> dict[str, str]:
    """Get all tags from a job."""
    job = await asyncio.to_thread(ws.jobs.get, job_id=job_id)
    return job.settings.tags or {}

async def update_job_tag(
    ws: WorkspaceClient,
    job_id: int,
    tag_key: str,
    tag_value: str
) -> None:
    """Update a single tag on a job (preserves other tags)."""
    job = await asyncio.to_thread(ws.jobs.get, job_id=job_id)
    current_tags = dict(job.settings.tags or {})
    current_tags[tag_key] = tag_value

    # Jobs API update requires the full settings object
    await asyncio.to_thread(
        ws.jobs.update,
        job_id=job_id,
        new_settings=JobSettings(
            name=job.settings.name,
            tags=current_tags,
            # Include other settings to preserve them
        )
    )
```

### Pattern 2: Cost Aggregation with SKU Breakdown
**What:** Calculate DBU costs per job from billing system tables with SKU breakdown
**When to use:** Cost attribution dashboard, team rollups
**Example:**
```sql
-- Source: system-tables.md billing schema + established RETRACTION handling
WITH job_costs AS (
    SELECT
        usage_metadata.job_id AS job_id,
        usage_date,
        CASE
            WHEN sku_name LIKE '%ALL_PURPOSE%' THEN 'All-Purpose Compute'
            WHEN sku_name LIKE '%JOBS%' THEN 'Jobs Compute'
            WHEN sku_name LIKE '%SQL%' THEN 'SQL Warehouse'
            WHEN sku_name LIKE '%SERVERLESS%' THEN 'Serverless'
            ELSE 'Other'
        END AS sku_category,
        SUM(usage_quantity) AS total_dbus
    FROM system.billing.usage
    WHERE usage_date >= current_date() - INTERVAL 30 DAYS
        AND usage_metadata.job_id IS NOT NULL
    GROUP BY usage_metadata.job_id, usage_date, sku_category
    HAVING SUM(usage_quantity) != 0  -- RETRACTION handling
)
SELECT
    job_id,
    sku_category,
    SUM(total_dbus) AS period_dbus,
    COUNT(DISTINCT usage_date) AS usage_days
FROM job_costs
GROUP BY job_id, sku_category
ORDER BY period_dbus DESC
```

### Pattern 3: SLA Breach Detection Query
**What:** Compare job run duration against SLA target tag
**When to use:** Breach history computation, sparkline data
**Example:**
```sql
-- Join run timeline with job tags for SLA comparison
WITH job_sla AS (
    -- Get SLA from job tags (requires Jobs API, stored in app state)
    -- This example assumes sla_minutes is passed as parameter
    SELECT
        jrt.job_id,
        jrt.run_id,
        jrt.period_start_time,
        jrt.run_duration_seconds,
        jrt.result_state,
        :sla_minutes * 60 AS sla_seconds  -- Parameter from job tag
    FROM system.lakeflow.job_run_timeline jrt
    WHERE jrt.job_id = :job_id
        AND jrt.period_start_time >= current_date() - INTERVAL 30 DAYS
        AND jrt.result_state IS NOT NULL
)
SELECT
    job_id,
    run_id,
    period_start_time,
    run_duration_seconds,
    sla_seconds,
    CASE
        WHEN run_duration_seconds > sla_seconds THEN 'BREACHED'
        ELSE 'MET'
    END AS sla_status
FROM job_sla
ORDER BY period_start_time DESC
```

### Pattern 4: Sparkline Component for Breach History
**What:** Compact visual representation of SLA breaches over time
**When to use:** Job row in health table showing breach pattern
**Example:**
```typescript
// Source: Recharts documentation + Phase 2 DurationChart pattern
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface BreachDataPoint {
  date: string;
  breached: boolean; // 1 for breach, 0 for met
}

interface SlaSparklineProps {
  data: BreachDataPoint[];
  width?: number;
  height?: number;
}

export function SlaSparkline({ data, width = 100, height = 24 }: SlaSparklineProps) {
  // Convert to numeric for chart
  const chartData = data.map(d => ({
    date: d.date,
    value: d.breached ? 1 : 0,
  }));

  const breachCount = data.filter(d => d.breached).length;
  const hasBreaches = breachCount > 0;

  return (
    <div className="flex items-center gap-2">
      <ResponsiveContainer width={width} height={height}>
        <LineChart data={chartData}>
          <Line
            type="stepAfter"
            dataKey="value"
            stroke={hasBreaches ? '#ef4444' : '#22c55e'}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {hasBreaches && (
        <span className="text-xs text-red-600 font-medium">
          {breachCount} breach{breachCount > 1 ? 'es' : ''}
        </span>
      )}
    </div>
  );
}
```

### Pattern 5: Inline Edit for SLA Target
**What:** Click-to-edit pattern for setting SLA minutes on job row
**When to use:** SLA column in job health table
**Example:**
```typescript
// Source: shadcn/ui patterns + user decision for inline editing
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Check, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface InlineSlaEditProps {
  jobId: string;
  currentSlaMinutes: number | null;
  suggestedP90Minutes: number | null;
}

export function InlineSlaEdit({
  jobId,
  currentSlaMinutes,
  suggestedP90Minutes,
}: InlineSlaEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentSlaMinutes?.toString() || '');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (slaMinutes: number) => {
      const response = await fetch(`/api/jobs/${jobId}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sla_minutes: slaMinutes }),
      });
      if (!response.ok) throw new Error('Failed to update SLA');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-metrics'] });
      setIsEditing(false);
    },
  });

  const handleSave = () => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      mutation.mutate(numValue);
    }
  };

  if (!isEditing) {
    return (
      <div className="flex items-center gap-1 group">
        <span>
          {currentSlaMinutes ? `${currentSlaMinutes}m` : '--'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
          onClick={() => {
            setValue(currentSlaMinutes?.toString() || suggestedP90Minutes?.toString() || '');
            setIsEditing(true);
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-6 w-16 text-sm"
        placeholder={suggestedP90Minutes?.toString()}
        autoFocus
      />
      <span className="text-xs text-gray-400">m</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={handleSave}
        disabled={mutation.isPending}
      >
        <Check className="h-3 w-3 text-green-600" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={() => setIsEditing(false)}
      >
        <X className="h-3 w-3 text-gray-400" />
      </Button>
    </div>
  );
}
```

### Pattern 6: Zombie Job Detection
**What:** Identify jobs with high cost relative to output/processing
**When to use:** Anomalies tab, cost optimization suggestions
**Example:**
```python
# Zombie detection criteria (Claude's discretion - recommended thresholds)
class ZombieDetector:
    """Detect zombie jobs - scheduled but not doing meaningful work."""

    # Thresholds (configurable)
    MIN_COST_THRESHOLD_DBUS = 10  # Minimum DBUs to consider
    MAX_COST_PER_MINUTE = 0.5     # DBUs per minute threshold
    MIN_RUN_COUNT = 3             # Need multiple runs to establish pattern

    @staticmethod
    def is_zombie(
        total_dbus: float,
        total_duration_minutes: float,
        rows_processed: int | None,
        run_count: int
    ) -> tuple[bool, str]:
        """Check if job exhibits zombie characteristics.

        Returns (is_zombie, reason).
        """
        if run_count < ZombieDetector.MIN_RUN_COUNT:
            return False, "Insufficient data"

        if total_dbus < ZombieDetector.MIN_COST_THRESHOLD_DBUS:
            return False, "Below cost threshold"

        # Check cost/duration ratio
        if total_duration_minutes > 0:
            cost_per_minute = total_dbus / total_duration_minutes
            if cost_per_minute > ZombieDetector.MAX_COST_PER_MINUTE:
                # High cost for duration - could be compute-intensive
                if rows_processed is not None and rows_processed == 0:
                    return True, "High cost with zero rows processed"

        # Long duration with no output
        avg_duration = total_duration_minutes / run_count
        if avg_duration > 60 and (rows_processed is None or rows_processed == 0):
            return True, "Long-running with no detectable output"

        return False, ""
```

### Anti-Patterns to Avoid
- **Storing SLA targets in a separate database:** Job tags travel with the job; avoids sync issues
- **Fetching all job tags for every request:** Cache tag values; only refresh on demand
- **Computing cost rollups in frontend:** Database handles aggregation efficiently; send pre-computed totals
- **Polling Jobs API for tag changes:** Tags are configuration; refresh on user action or interval
- **Ignoring RETRACTION records in billing:** Always use HAVING SUM(usage_quantity) != 0

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sparkline charts | Custom SVG | Recharts LineChart with minimal config | Handles responsive sizing, interactions |
| Inline editing | Custom input management | shadcn Input + local state pattern | Accessible, keyboard support |
| Cost formatting | Manual string concatenation | Intl.NumberFormat | Locale-aware, handles currencies |
| Tag persistence | Custom database table | Databricks job tags | Tags are durable, travel with job |
| Billing aggregation | Fetch all rows to JS | SQL GROUP BY with SUM/HAVING | Database optimized for aggregation |

**Key insight:** Job tags provide a natural, durable storage mechanism for SLA and team metadata. The Jobs API is the source of truth for job configuration.

## Common Pitfalls

### Pitfall 1: Job Tag Update Race Conditions
**What goes wrong:** Concurrent tag updates overwrite each other
**Why it happens:** Jobs API update requires full settings object; concurrent reads/writes race
**How to avoid:** Read current tags immediately before update; consider optimistic locking or single-threaded tag updates
**Warning signs:** Tags "disappear" after updates; inconsistent tag values

### Pitfall 2: Missing Cost Attribution for All-Purpose Clusters
**What goes wrong:** Jobs running on all-purpose (interactive) clusters show no cost
**Why it happens:** usage_metadata.job_id is NULL for all-purpose compute
**How to avoid:** Flag jobs with missing cost attribution; show "unattributed" category; check cluster_source
**Warning signs:** Job runs exist but show 0 DBUs; large gap between total billing and attributed costs

### Pitfall 3: SLA Auto-Suggest Using Short Baseline
**What goes wrong:** Auto-suggested SLA is too tight, causing immediate breaches
**Why it happens:** P90 calculated from too few runs or atypical period
**How to avoid:** Require minimum 5+ runs for auto-suggest; use 30-day baseline; show confidence indicator
**Warning signs:** New SLAs immediately breached; high variance in suggested values

### Pitfall 4: Zombie Detection False Positives
**What goes wrong:** Legitimate jobs flagged as zombies
**Why it happens:** Jobs doing non-row-based work (exports, API calls) appear to process nothing
**How to avoid:** Allow job-level override/whitelist; use multiple indicators; require pattern over time
**Warning signs:** Operators dismissing all zombie alerts; legitimate jobs marked as zombies

### Pitfall 5: Cost Anomaly Threshold Too Sensitive
**What goes wrong:** Too many cost anomalies, alert fatigue
**Why it happens:** Using p90 instead of stricter threshold; not accounting for legitimate spikes
**How to avoid:** Start with >2x p90; allow per-job threshold configuration; require consecutive anomalies
**Warning signs:** Anomalies tab always full; users ignoring anomaly alerts

### Pitfall 6: Tag Key Name Conflicts
**What goes wrong:** App's tag keys conflict with existing job tags
**Why it happens:** Common names like "team" or "owner" may already be used differently
**How to avoid:** Make tag keys configurable; use prefixed defaults like "monitoring_sla_minutes"; document tag usage
**Warning signs:** Unexpected values in SLA/team fields; existing tags overwritten

## Code Examples

### Cost Summary Endpoint (Backend)
```python
# Source: System tables + established patterns
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal

class JobCostOut(BaseModel):
    """Cost breakdown for a single job."""
    job_id: str
    job_name: str
    total_dbus: float
    total_cost_dollars: Optional[float] = None  # If rate configured
    cost_by_sku: dict[str, float]  # SKU category -> DBUs
    usage_days: int
    trend_7d: float  # % change vs previous period
    team: Optional[str] = None

class TeamCostOut(BaseModel):
    """Cost rollup for a team."""
    team: str
    total_dbus: float
    total_cost_dollars: Optional[float] = None
    job_count: int
    trend_7d: float

async def get_job_costs(
    ws,
    warehouse_id: str,
    days: int = 30,
    dbu_rate: Optional[float] = None
) -> list[JobCostOut]:
    """Get cost breakdown per job with SKU categorization."""

    query = f"""
    WITH job_costs AS (
        SELECT
            usage_metadata.job_id AS job_id,
            usage_date,
            CASE
                WHEN sku_name LIKE '%ALL_PURPOSE%' THEN 'All-Purpose'
                WHEN sku_name LIKE '%JOBS%' THEN 'Jobs Compute'
                WHEN sku_name LIKE '%SQL%' THEN 'SQL Warehouse'
                WHEN sku_name LIKE '%SERVERLESS%' THEN 'Serverless'
                ELSE 'Other'
            END AS sku_category,
            SUM(usage_quantity) AS dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL {days} DAYS
            AND usage_metadata.job_id IS NOT NULL
        GROUP BY usage_metadata.job_id, usage_date, sku_category
        HAVING SUM(usage_quantity) != 0
    ),
    job_totals AS (
        SELECT
            job_id,
            sku_category,
            SUM(dbus) AS total_dbus,
            COUNT(DISTINCT usage_date) AS usage_days
        FROM job_costs
        GROUP BY job_id, sku_category
    ),
    -- 7-day trend calculation
    recent AS (
        SELECT job_id, SUM(dbus) AS recent_dbus
        FROM job_costs
        WHERE usage_date >= current_date() - INTERVAL 7 DAYS
        GROUP BY job_id
    ),
    previous AS (
        SELECT job_id, SUM(dbus) AS prev_dbus
        FROM job_costs
        WHERE usage_date >= current_date() - INTERVAL 14 DAYS
            AND usage_date < current_date() - INTERVAL 7 DAYS
        GROUP BY job_id
    )
    SELECT
        jt.job_id,
        jt.sku_category,
        jt.total_dbus,
        jt.usage_days,
        COALESCE(r.recent_dbus, 0) AS recent_dbus,
        COALESCE(p.prev_dbus, 0) AS prev_dbus
    FROM job_totals jt
    LEFT JOIN recent r ON jt.job_id = r.job_id
    LEFT JOIN previous p ON jt.job_id = p.job_id
    ORDER BY total_dbus DESC
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="60s"
    )
    return _parse_job_costs(result, dbu_rate)
```

### Tag Update Endpoint (Backend)
```python
# Source: databricks-python-sdk + Jobs API patterns
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import asyncio

router = APIRouter(prefix="/api/jobs", tags=["job-tags"])

class TagUpdateRequest(BaseModel):
    """Request to update job tags."""
    sla_minutes: Optional[int] = None
    team: Optional[str] = None
    owner: Optional[str] = None

class TagUpdateResponse(BaseModel):
    """Response with updated tags."""
    job_id: str
    tags: dict[str, str]

@router.patch("/{job_id}/tags", response_model=TagUpdateResponse)
async def update_job_tags(
    job_id: str,
    request: TagUpdateRequest,
    ws = Depends(get_ws),
    tag_config = Depends(get_tag_config),  # Configurable tag key names
):
    """Update SLA or team tags on a job."""
    try:
        # Get current job settings
        job = await asyncio.to_thread(ws.jobs.get, job_id=int(job_id))

        # Merge with existing tags
        current_tags = dict(job.settings.tags or {})

        if request.sla_minutes is not None:
            current_tags[tag_config.sla_key] = str(request.sla_minutes)
        if request.team is not None:
            current_tags[tag_config.team_key] = request.team
        if request.owner is not None:
            current_tags[tag_config.owner_key] = request.owner

        # Update job with new tags
        # Note: Jobs API update replaces settings, so preserve existing
        await asyncio.to_thread(
            ws.jobs.update,
            job_id=int(job_id),
            new_settings=JobSettings(
                name=job.settings.name,
                tags=current_tags,
                tasks=job.settings.tasks,
                # Preserve other critical settings
                schedule=job.settings.schedule,
                max_concurrent_runs=job.settings.max_concurrent_runs,
            )
        )

        return TagUpdateResponse(job_id=job_id, tags=current_tags)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update tags: {str(e)}")
```

### SLA Breach History Query (Backend)
```python
# Source: system tables + Phase 2 patterns
async def get_sla_breach_history(
    ws,
    warehouse_id: str,
    job_id: str,
    sla_minutes: int,
    days: int = 30
) -> list[dict]:
    """Get SLA breach history for sparkline visualization."""

    sla_seconds = sla_minutes * 60

    query = f"""
    SELECT
        DATE(period_start_time) AS run_date,
        COUNT(*) AS total_runs,
        SUM(CASE WHEN run_duration_seconds > {sla_seconds} THEN 1 ELSE 0 END) AS breached_runs,
        MAX(run_duration_seconds) AS max_duration
    FROM system.lakeflow.job_run_timeline
    WHERE job_id = '{job_id}'
        AND period_start_time >= current_date() - INTERVAL {days} DAYS
        AND result_state IS NOT NULL
        AND run_duration_seconds IS NOT NULL
    GROUP BY DATE(period_start_time)
    ORDER BY run_date
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="30s"
    )

    # Format for sparkline: list of {date, breached: bool}
    breaches = []
    for row in result.result.data_array or []:
        breaches.append({
            "date": row[0],
            "total_runs": int(row[1]),
            "breached_runs": int(row[2]),
            "breached": int(row[2]) > 0,
            "max_duration": int(row[3]) if row[3] else None
        })

    return breaches
```

### Cost Formatting Utilities (Frontend)
```typescript
// Source: Established patterns + user decisions
/**
 * Cost display utilities for DBU and dollar amounts.
 */

/**
 * Format DBU value with appropriate precision.
 */
export function formatDBUs(dbus: number): string {
  if (dbus < 0.01) return '<0.01';
  if (dbus < 1) return dbus.toFixed(2);
  if (dbus < 10) return dbus.toFixed(1);
  return Math.round(dbus).toLocaleString();
}

/**
 * Format dollar amount from DBUs using configurable rate.
 */
export function formatCostDollars(dbus: number, dbuRate: number): string {
  const cost = dbus * dbuRate;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cost < 1 ? 2 : 0,
    maximumFractionDigits: cost < 1 ? 2 : 0,
  }).format(cost);
}

/**
 * Format cost with toggle between DBU and dollars.
 */
export function formatCost(
  dbus: number,
  showDollars: boolean,
  dbuRate: number
): string {
  if (showDollars && dbuRate > 0) {
    return formatCostDollars(dbus, dbuRate);
  }
  return `${formatDBUs(dbus)} DBU`;
}

/**
 * Calculate trend percentage change.
 */
export function formatTrend(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(0)}%`;
}

/**
 * Get trend indicator color.
 */
export function getTrendColor(change: number): string {
  if (change > 10) return 'text-red-600';  // Cost increase is bad
  if (change < -10) return 'text-green-600';  // Cost decrease is good
  return 'text-gray-500';
}
```

### Pydantic Models for SLA/Cost (Backend)
```python
# Source: APX pattern + user requirements
from pydantic import BaseModel, computed_field
from datetime import datetime
from typing import Optional, Literal

# Configuration for tag key names
class TagConfig(BaseModel):
    """Configurable tag key names for SLA and team attribution."""
    sla_key: str = "sla_minutes"
    team_key: str = "team"
    owner_key: str = "owner"

# SLA-related models
class SlaTargetOut(BaseModel):
    """SLA target information for a job."""
    job_id: str
    sla_minutes: Optional[int] = None
    suggested_p90_minutes: Optional[int] = None  # Auto-suggest when no SLA
    source: Literal["tag", "suggested", "none"]

class SlaBreachOut(BaseModel):
    """SLA breach history point for sparkline."""
    date: str
    total_runs: int
    breached_runs: int
    breached: bool

class JobSlaStatusOut(BaseModel):
    """Job with SLA status for dashboard."""
    job_id: str
    job_name: str
    sla_minutes: Optional[int] = None
    last_duration_minutes: Optional[int] = None
    breach_count_30d: int = 0
    breach_history: list[SlaBreachOut] = []

    @computed_field
    @property
    def sla_status(self) -> Literal["met", "at_risk", "breached", "no_sla"]:
        """Compute SLA status based on last run and history."""
        if self.sla_minutes is None:
            return "no_sla"
        if self.last_duration_minutes and self.last_duration_minutes > self.sla_minutes:
            return "breached"
        if self.breach_count_30d > 3:  # Threshold for "at risk"
            return "at_risk"
        return "met"

# Cost-related models
class CostBySkuOut(BaseModel):
    """Cost breakdown by SKU category."""
    sku_category: str
    total_dbus: float
    percentage: float

class JobCostSummaryOut(BaseModel):
    """Cost summary for a job."""
    job_id: str
    job_name: str
    team: Optional[str] = None
    total_dbus_30d: float
    cost_by_sku: list[CostBySkuOut]
    trend_7d_percent: float
    is_anomaly: bool = False  # True if >2x p90 baseline

class TeamCostSummaryOut(BaseModel):
    """Cost rollup by team."""
    team: str
    total_dbus_30d: float
    job_count: int
    trend_7d_percent: float

class CostAnomalyOut(BaseModel):
    """Cost anomaly for anomalies tab."""
    job_id: str
    job_name: str
    team: Optional[str] = None
    run_date: str
    dbus: float
    baseline_p90: float
    multiplier: float  # How many times above baseline
    anomaly_type: Literal["cost_spike", "zombie"]
    reason: str
    job_settings_url: str  # Quick link to Databricks
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| External database for SLA storage | Job tags as metadata | Established pattern | SLA travels with job, no sync needed |
| Separate cost monitoring tool | Unified system.billing queries | 2024+ | Single source of truth for DBU costs |
| Manual cost allocation | Tag-based team attribution | Best practice | Automated attribution at job level |
| Alert-based anomaly detection | Dashboard-first with anomaly tab | Recommended | Users see patterns, not just alerts |

**Deprecated/outdated:**
- Storing SLA targets in a separate metadata table (use job tags)
- Computing billing aggregations client-side (use SQL for efficiency)
- Hard-coded tag key names (make configurable for flexibility)

## Open Questions

1. **Job Settings Update Preservation**
   - What we know: Jobs API update requires settings object; easy to accidentally remove settings
   - What's unclear: Best way to safely update tags without affecting other settings
   - Recommendation: Read-modify-write pattern; only update tags; test with real jobs

2. **Zombie Detection Thresholds**
   - What we know: Need to balance sensitivity vs false positives
   - What's unclear: Optimal thresholds for cost/duration ratio
   - Recommendation: Start conservative (high threshold); allow per-job override; collect feedback

3. **DBU to Dollar Rate Source**
   - What we know: system.billing.list_prices has default pricing
   - What's unclear: Whether to use list prices or allow custom rate configuration
   - Recommendation: Use list prices as default; allow admin override in app config

4. **Tag Key Collision Handling**
   - What we know: Users may have existing tags with same names
   - What's unclear: How to handle conflicts gracefully
   - Recommendation: Use prefixed defaults (e.g., `monitoring_sla_minutes`); warn on setup

## Sources

### Primary (HIGH confidence)
- `/Users/laurent.prat/.claude/skills/databricks-unity-catalog/5-system-tables.md` - Billing schema, RETRACTION handling
- `/Users/laurent.prat/.claude/skills/databricks-python-sdk/SKILL.md` - Jobs API patterns, async wrapping
- `/Users/laurent.prat/.claude/skills/databricks-jobs/SKILL.md` - Job configuration, tags
- Phase 1 RESEARCH.md - Established stack, SCD2 patterns
- Phase 2 RESEARCH.md - Duration stats, anomaly detection, UI patterns
- Existing codebase (job_monitor/) - Established patterns for health metrics, charts

### Secondary (MEDIUM confidence)
- Recharts documentation (recharts.org) - LineChart, ResponsiveContainer for sparklines
- shadcn/ui documentation (ui.shadcn.com) - Input, Dialog components

### Tertiary (LOW confidence)
- Zombie detection thresholds - Based on general patterns; needs validation with real data
- Cost anomaly sensitivity - Starting recommendation; may need tuning

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Builds on Phase 1/2 established stack
- Jobs API tag operations: HIGH - Well-documented in SDK skill
- Billing queries: HIGH - System tables schema documented with examples
- SLA patterns: MEDIUM - Combining established patterns in new way
- Zombie detection: LOW - Thresholds need real-world validation

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days - stable technologies, established patterns)
