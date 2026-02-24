# Phase 2: Job Health Monitoring - Research

**Researched:** 2026-02-24
**Domain:** Job health metrics, dashboard visualization, SQL analytics patterns
**Confidence:** HIGH

## Summary

Phase 2 transforms the raw job execution data from Phase 1 into actionable health monitoring with traffic light indicators, priority badges, duration trends, and retry tracking. The primary technical challenges are: (1) computing rolling success rates with consecutive failure detection in SQL, (2) building an expandable table UI pattern with problem-first sorting, and (3) displaying duration trends with anomaly detection using line charts.

The implementation leverages the existing FastAPI + React/TanStack stack from Phase 1, adding Recharts for duration visualization and extending shadcn/ui Table components with collapsible rows. The backend requires new SQL queries that aggregate job_run_timeline data to compute success rates, detect consecutive failures (P1/P2), and calculate duration baselines. All metrics use the 30-day median as baseline per the user's decision.

Key implementation insight: Computing "consecutive failures" efficiently requires a SQL window function pattern (LAG or ROW_NUMBER with gap detection) rather than fetching all runs to the backend. The query pattern groups runs by job_id, orders by start time, and uses LAG to compare each run's result_state with the previous run.

**Primary recommendation:** Extend existing /api/jobs/runs endpoint to return aggregated health metrics per job, add new /api/jobs/health endpoint for dashboard summary, use Recharts ResponsiveContainer with LineChart for duration trends, implement problem-first sorting at the API level.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Traffic light indicator (green/yellow/red) + percentage for success rate
- Thresholds: Green >= 90%, Yellow 70-89%, Red < 70%
- Tabs to switch between 7-day and 30-day views
- Expandable rows: compact by default, click to expand for details
- Problem-first view: failing jobs at top, then warnings, then healthy
- Always sorted by urgency - no user-configurable sorting needed
- Minimal filtering (detailed filter/drill-down is Phase 6)
- Collapsed row shows: job name, status indicator, success rate, "Last run: Xh ago"
- Expanded row shows: recent runs list (last 5-10) AND metrics summary (duration stats, retry count, failure reasons)
- P1: 2+ consecutive failures - red badge with "P1" label
- P2: Most recent run failed (single failure) - orange badge with "P2"
- P3: Success rate in yellow zone (70-89%) - yellow badge with "P3"
- Simple, predictable rules - no complex pattern detection
- "Sudden increase" = duration > 2x the 30-day median baseline
- Expanded view shows: line chart of duration over recent runs + stats table (median, p90, last run, baseline comparison)
- Anomalous duration: warning icon with tooltip showing comparison to baseline
- Always show retry count in expanded metrics: "Retries: N in last 7 days"
- Add badge when retries > 2 in period (silent cost inflation flag)

### Claude's Discretion
- Exact chart library and styling
- Loading states and skeleton designs
- Error state handling
- Specific color shades for traffic light indicators

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| JOB-01 | Track job success/failure rates over rolling 7-day and 30-day windows | SQL aggregation query with COUNT + FILTER pattern; success_rate = COUNT(CASE result_state='SUCCESS')/COUNT(*); window parameter for 7/30 day toggle |
| JOB-02 | Alert on consecutive failures (2+ in a row triggers P1 priority) | SQL LAG window function to detect consecutive failures; backend computes priority level (P1/P2/P3) per job |
| JOB-03 | Monitor job duration and detect sudden increases vs historical baseline | SQL PERCENTILE_CONT for median/p90 calculations; anomaly = current_duration > 2x 30-day median; Recharts LineChart for visualization |
| JOB-04 | Track retry counts per job to surface silent cost inflation | SQL COUNT with retry detection (same job_id, overlapping time windows OR result_state patterns); badge when retries > 2 in period |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | 2.12+ | Duration trend charts | Most popular React charting lib; composable, responsive, Tailwind-friendly |
| shadcn/ui Table | Latest | Expandable row tables | Established in Phase 1; Collapsible component for expand/collapse |
| shadcn/ui Badge | Latest | P1/P2/P3 priority badges | Pre-built color variants; destructive/warning styling |
| TanStack Query | 5.x | Data fetching with caching | Established in Phase 1; automatic refetch for dashboard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Tooltip | Latest | Duration anomaly explanations | Show baseline comparison on hover |
| shadcn/ui Tabs | Latest | 7-day/30-day toggle | Clean tab switching without page reload |
| shadcn/ui Collapsible | Latest | Row expansion | Animated expand/collapse for job details |
| lucide-react | Latest | Status icons | ChevronDown/Up, AlertTriangle, CheckCircle icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | Chart.js | Chart.js requires wrapper; Recharts is native React with better composition |
| Recharts | Tremor | Tremor is higher-level but less customizable; Recharts fits existing stack |
| Custom expansion | Accordion | Collapsible provides more control over expand behavior |

**Installation:**
```bash
# Add to frontend (from ui/ directory)
npx shadcn@latest add table tabs collapsible tooltip badge
npm install recharts lucide-react
```

## Architecture Patterns

### Recommended Project Structure
```
job_monitor/
├── backend/
│   ├── routers/
│   │   ├── jobs.py          # Existing - extend with health metrics
│   │   └── health_metrics.py # NEW - job health dashboard endpoint
│   └── models.py            # Extend with health metric models
└── ui/
    ├── routes/_sidebar/
    │   └── job-health.tsx   # NEW - main dashboard page
    ├── components/
    │   ├── job-health-table.tsx    # Expandable table
    │   ├── job-health-row.tsx      # Single row with expand
    │   ├── duration-chart.tsx      # Recharts line chart
    │   └── priority-badge.tsx      # P1/P2/P3 badge component
    └── lib/
        └── health-utils.ts  # Color/threshold helpers
```

### Pattern 1: Problem-First Sorting at API Level
**What:** Backend returns jobs sorted by urgency (P1 first, then P2, P3, healthy)
**When to use:** Job health dashboard list endpoint
**Example:**
```python
# Source: Application pattern from user decisions
def sort_by_urgency(jobs: list[JobHealthOut]) -> list[JobHealthOut]:
    """Sort jobs by priority: P1 > P2 > P3 > healthy, then by success rate ASC"""
    priority_order = {"P1": 0, "P2": 1, "P3": 2, None: 3}
    return sorted(
        jobs,
        key=lambda j: (priority_order.get(j.priority, 3), j.success_rate or 100)
    )
```

### Pattern 2: Consecutive Failure Detection with LAG
**What:** Use SQL window functions to detect consecutive failures
**When to use:** Computing P1/P2 priority status
**Example:**
```sql
-- Detect consecutive failures using LAG
WITH ordered_runs AS (
    SELECT
        job_id,
        run_id,
        result_state,
        period_start_time,
        LAG(result_state) OVER (
            PARTITION BY job_id
            ORDER BY period_start_time DESC
        ) as prev_result_state,
        ROW_NUMBER() OVER (
            PARTITION BY job_id
            ORDER BY period_start_time DESC
        ) as run_rank
    FROM system.lakeflow.job_run_timeline
    WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
)
SELECT
    job_id,
    -- P1: Most recent 2+ runs are failures
    CASE
        WHEN run_rank = 1
             AND result_state = 'FAILED'
             AND prev_result_state = 'FAILED' THEN 'P1'
        WHEN run_rank = 1 AND result_state = 'FAILED' THEN 'P2'
        ELSE NULL
    END as failure_priority
FROM ordered_runs
WHERE run_rank = 1
```

### Pattern 3: Duration Baseline with PERCENTILE_CONT
**What:** Calculate 30-day median duration as baseline for anomaly detection
**When to use:** Duration trend analysis
**Example:**
```sql
-- Calculate duration statistics per job
SELECT
    job_id,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY run_duration_seconds) as median_duration,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY run_duration_seconds) as p90_duration,
    COUNT(*) as run_count
FROM system.lakeflow.job_run_timeline
WHERE period_start_time >= current_date() - INTERVAL 30 DAYS
    AND run_duration_seconds IS NOT NULL
    AND result_state IS NOT NULL  -- Exclude still-running jobs
GROUP BY job_id
```

### Pattern 4: Expandable Table Row with Collapsible
**What:** Compact row that expands to show details on click
**When to use:** Job health table rows
**Example:**
```typescript
// Source: shadcn/ui Collapsible pattern
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

function JobHealthRow({ job }: { job: JobHealth }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <TableRow>
        <TableCell>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform",
                isOpen && "rotate-180"
              )} />
            </Button>
          </CollapsibleTrigger>
        </TableCell>
        <TableCell>{job.name}</TableCell>
        <TableCell><StatusIndicator status={job.status} /></TableCell>
        <TableCell>{job.success_rate}%</TableCell>
        <TableCell>Last run: {formatTimeAgo(job.last_run_time)}</TableCell>
      </TableRow>
      <CollapsibleContent asChild>
        <TableRow>
          <TableCell colSpan={5}>
            <JobExpandedDetails job={job} />
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

### Pattern 5: Traffic Light Status Indicator
**What:** Visual indicator with green/yellow/red based on success rate thresholds
**When to use:** Success rate column in job health table
**Example:**
```typescript
// Source: User decision - thresholds locked
const STATUS_THRESHOLDS = {
  green: 90,  // >= 90% success rate
  yellow: 70, // 70-89% success rate
  red: 0,     // < 70% success rate
} as const;

const STATUS_COLORS = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
} as const;

function StatusIndicator({ successRate }: { successRate: number }) {
  const status = successRate >= 90 ? "green"
    : successRate >= 70 ? "yellow"
    : "red";

  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-3 h-3 rounded-full",
        STATUS_COLORS[status]
      )} />
      <span>{successRate.toFixed(1)}%</span>
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Computing consecutive failures in frontend:** Requires fetching all runs; do in SQL with window functions
- **Polling for real-time updates:** System tables have 5-15 min latency; don't poll more than every 5 minutes
- **Separate API calls per job for details:** Batch expanded details or lazy-load on expand
- **Hardcoding thresholds in multiple places:** Define constants once, share between backend/frontend
- **Using Chart.js without wrapper:** Requires additional setup; Recharts is native React

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line charts | Custom SVG/Canvas | Recharts LineChart | Responsive, animated, handles edge cases |
| Expandable rows | Custom show/hide logic | shadcn/ui Collapsible | Animated, accessible, keyboard support |
| Priority badges | Custom styled divs | shadcn/ui Badge variants | Consistent with design system |
| Tooltip positioning | Manual positioning | shadcn/ui Tooltip | Handles viewport edges, accessibility |
| Percentile calculation | Python statistics | SQL PERCENTILE_CONT | Database handles large datasets efficiently |
| Time ago formatting | Manual date math | date-fns formatDistanceToNow | Handles edge cases, i18n-ready |

**Key insight:** All visualization and interaction components should use established libraries. The complexity is in the SQL queries and data transformation, not the UI rendering.

## Common Pitfalls

### Pitfall 1: Inefficient Consecutive Failure Detection
**What goes wrong:** Fetching all job runs to application and computing consecutive failures in Python/TypeScript
**Why it happens:** Seems simpler than SQL window functions
**How to avoid:** Use LAG/LEAD window functions in SQL to detect patterns; the database handles this efficiently
**Warning signs:** API endpoints timing out; high memory usage; slow page loads

### Pitfall 2: Missing NULL Handling in Duration Stats
**What goes wrong:** NaN or incorrect percentiles when jobs have no completed runs
**Why it happens:** PERCENTILE_CONT fails on empty groups or NULL durations
**How to avoid:** Filter `WHERE run_duration_seconds IS NOT NULL AND result_state IS NOT NULL`; use COALESCE for display
**Warning signs:** "NaN%" displayed; charts with gaps; division by zero errors

### Pitfall 3: Timezone Issues in "Last Run" Display
**What goes wrong:** "Last run: 5h ago" shows wrong time
**Why it happens:** System table timestamps are UTC; frontend assumes local time
**How to avoid:** Store and transmit ISO8601 with timezone; convert in frontend with user's locale
**Warning signs:** Time ago showing negative or unrealistic values; inconsistent across users

### Pitfall 4: Missing Index on Job Health Query
**What goes wrong:** Dashboard takes >10 seconds to load
**Why it happens:** Full table scans on job_run_timeline without date filtering
**How to avoid:** Always include date filter in WHERE clause; system tables are partitioned by date
**Warning signs:** Slow queries in SQL warehouse logs; timeouts on dashboard load

### Pitfall 5: P1/P2 Priority Flickering
**What goes wrong:** Job rapidly changes between P1 and P2 as new runs complete
**Why it happens:** Priority computed only from most recent runs without stability buffer
**How to avoid:** Priority should be "sticky" for a period; consider requiring 2+ successful runs to clear P1
**Warning signs:** Users report confusing state changes; notification spam

### Pitfall 6: Retry Count Overcounting
**What goes wrong:** Retry count includes manual reruns, not just automatic retries
**Why it happens:** System table doesn't distinguish automatic retries from manual repairs
**How to avoid:** Filter by job trigger reason if available; document limitation if not distinguishable
**Warning signs:** Unexpectedly high retry counts; counts don't match user's understanding

## Code Examples

### Job Health Summary Query (Backend)
```python
# Source: Pattern from system tables + user decisions
async def get_job_health_summary(
    ws,
    warehouse_id: str,
    days: int = 7
) -> list[JobHealthOut]:
    """Get health summary for all jobs with priority flags."""

    query = f"""
    WITH run_stats AS (
        SELECT
            job_id,
            COUNT(*) as total_runs,
            COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) as success_count,
            MAX(period_start_time) as last_run_time,
            MAX(CASE WHEN result_state IS NOT NULL THEN run_duration_seconds END) as last_duration
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
        GROUP BY job_id
    ),
    consecutive_check AS (
        SELECT
            job_id,
            result_state,
            LAG(result_state) OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as prev_state,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as rn
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
    ),
    priority_flags AS (
        SELECT
            job_id,
            CASE
                WHEN result_state = 'FAILED' AND prev_state = 'FAILED' THEN 'P1'
                WHEN result_state = 'FAILED' THEN 'P2'
                ELSE NULL
            END as priority
        FROM consecutive_check
        WHERE rn = 1
    ),
    retry_counts AS (
        -- Approximate retry detection: multiple runs for same job on same day
        SELECT
            job_id,
            SUM(CASE WHEN run_count > 1 THEN run_count - 1 ELSE 0 END) as retry_count
        FROM (
            SELECT job_id, DATE(period_start_time) as run_date, COUNT(*) as run_count
            FROM system.lakeflow.job_run_timeline
            WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
            GROUP BY job_id, DATE(period_start_time)
        )
        GROUP BY job_id
    )
    SELECT
        rs.job_id,
        j.name as job_name,
        rs.total_runs,
        rs.success_count,
        ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1) as success_rate,
        rs.last_run_time,
        rs.last_duration,
        pf.priority,
        COALESCE(rc.retry_count, 0) as retry_count
    FROM run_stats rs
    LEFT JOIN latest_jobs j ON rs.job_id = j.job_id  -- Use SCD2 CTE from Phase 1
    LEFT JOIN priority_flags pf ON rs.job_id = pf.job_id
    LEFT JOIN retry_counts rc ON rs.job_id = rc.job_id
    ORDER BY
        CASE pf.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,
        success_rate ASC
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="60s"
    )
    return _parse_job_health(result)
```

### Duration Statistics Query (Backend)
```python
# Source: PERCENTILE_CONT pattern + user decisions
async def get_duration_stats(
    ws,
    warehouse_id: str,
    job_id: str
) -> DurationStatsOut:
    """Get duration statistics for a specific job."""

    query = f"""
    SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY run_duration_seconds) as median_duration,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY run_duration_seconds) as p90_duration,
        AVG(run_duration_seconds) as avg_duration,
        MAX(run_duration_seconds) as max_duration,
        COUNT(*) as run_count
    FROM system.lakeflow.job_run_timeline
    WHERE job_id = '{job_id}'
        AND period_start_time >= current_date() - INTERVAL 30 DAYS
        AND run_duration_seconds IS NOT NULL
        AND result_state IS NOT NULL
    """

    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=warehouse_id,
        statement=query,
        wait_timeout="30s"
    )
    return _parse_duration_stats(result)
```

### Duration Trend Chart (Frontend)
```typescript
// Source: Recharts LineChart + user decisions
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface DurationDataPoint {
  run_time: string;
  duration_seconds: number;
}

function DurationTrendChart({
  data,
  medianBaseline
}: {
  data: DurationDataPoint[];
  medianBaseline: number;
}) {
  const anomalyThreshold = medianBaseline * 2;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis
          dataKey="run_time"
          tickFormatter={(v) => new Date(v).toLocaleDateString()}
        />
        <YAxis
          tickFormatter={(v) => `${Math.round(v / 60)}m`}
          label={{ value: 'Duration', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip
          formatter={(v: number) => [`${Math.round(v / 60)} minutes`, 'Duration']}
          labelFormatter={(v) => new Date(v).toLocaleString()}
        />
        {/* Baseline reference line */}
        <ReferenceLine
          y={medianBaseline}
          stroke="#888"
          strokeDasharray="5 5"
          label="Baseline"
        />
        {/* Anomaly threshold line */}
        <ReferenceLine
          y={anomalyThreshold}
          stroke="#ef4444"
          strokeDasharray="3 3"
          label="2x Baseline"
        />
        <Line
          type="monotone"
          dataKey="duration_seconds"
          stroke="#3b82f6"
          dot={(props) => {
            const isAnomaly = props.payload.duration_seconds > anomalyThreshold;
            return (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={isAnomaly ? 6 : 4}
                fill={isAnomaly ? "#ef4444" : "#3b82f6"}
              />
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Priority Badge Component (Frontend)
```typescript
// Source: shadcn/ui Badge + user decisions (P1/P2/P3)
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Priority = "P1" | "P2" | "P3" | null;

const PRIORITY_STYLES: Record<Exclude<Priority, null>, string> = {
  P1: "bg-red-600 hover:bg-red-700 text-white",
  P2: "bg-orange-500 hover:bg-orange-600 text-white",
  P3: "bg-yellow-500 hover:bg-yellow-600 text-black",
};

function PriorityBadge({ priority }: { priority: Priority }) {
  if (!priority) return null;

  return (
    <Badge className={cn("font-bold", PRIORITY_STYLES[priority])}>
      {priority}
    </Badge>
  );
}
```

### Pydantic Models (Backend)
```python
# Source: APX pattern + user requirements
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Literal

class JobHealthOut(BaseModel):
    """Job health summary for dashboard."""
    job_id: str
    job_name: str
    total_runs: int
    success_count: int
    success_rate: float  # Percentage 0-100
    last_run_time: datetime
    last_duration_seconds: Optional[int] = None
    priority: Optional[Literal["P1", "P2", "P3"]] = None
    retry_count: int = 0

class DurationStatsOut(BaseModel):
    """Duration statistics for a job."""
    job_id: str
    median_duration_seconds: Optional[float] = None
    p90_duration_seconds: Optional[float] = None
    avg_duration_seconds: Optional[float] = None
    max_duration_seconds: Optional[float] = None
    run_count: int

class JobRunDetailOut(BaseModel):
    """Individual job run for expanded view."""
    run_id: str
    job_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    result_state: Optional[str] = None
    is_anomaly: bool = False  # Duration > 2x baseline

class JobExpandedOut(BaseModel):
    """Expanded job details for row expansion."""
    job_id: str
    job_name: str
    recent_runs: list[JobRunDetailOut]  # Last 5-10 runs
    duration_stats: DurationStatsOut
    retry_count_7d: int
    failure_reasons: list[str]  # Distinct failure messages
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom chart rendering | Recharts composable components | 2023+ | Declarative, responsive, animated charts |
| Fetch all data, filter in JS | SQL window functions (LAG, LEAD) | Standard | Database handles large datasets efficiently |
| Polling every 30 seconds | TanStack Query with stale time | 2024+ | Automatic caching, background refresh |
| Manual expand/collapse state | Collapsible primitive | 2024+ | Accessible, animated, consistent |

**Deprecated/outdated:**
- Chart.js without React wrapper (use react-chartjs-2 if needed, but Recharts is simpler)
- Manual tooltip positioning (use Radix/shadcn Tooltip)
- Inline success rate calculations in frontend (compute in SQL for consistency)

## Open Questions

1. **Retry detection accuracy**
   - What we know: System tables don't explicitly mark "automatic retry" vs "manual rerun"
   - What's unclear: Best heuristic for distinguishing (same day? within X minutes?)
   - Recommendation: Use "multiple runs same day" as proxy; document limitation in UI

2. **P1 sticky period**
   - What we know: User wants P1 for 2+ consecutive failures
   - What's unclear: How many successes required to clear P1 status?
   - Recommendation: Clear P1 after 1 success (simple rule per user preference); can adjust later

3. **Duration baseline for new jobs**
   - What we know: 30-day median is baseline per user decision
   - What's unclear: What to show for jobs with <5 runs (insufficient data)?
   - Recommendation: Show "Insufficient data" badge; skip anomaly detection until 5+ runs

## Sources

### Primary (HIGH confidence)
- Phase 1 RESEARCH.md - Established stack (FastAPI, React, TanStack, shadcn/ui)
- Phase 1 codebase - Existing patterns for SQL queries, API endpoints
- User decisions in CONTEXT.md - Locked thresholds and UI patterns
- Databricks system.lakeflow schema - job_run_timeline columns and semantics

### Secondary (MEDIUM confidence)
- Recharts documentation (https://recharts.org) - API patterns, component composition
- shadcn/ui documentation (https://ui.shadcn.com) - Collapsible, Badge, Tooltip usage
- SQL window function patterns - LAG, PERCENTILE_CONT standard SQL

### Tertiary (LOW confidence)
- Retry detection heuristic - needs validation with real data patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Builds on established Phase 1 stack
- Architecture: HIGH - Clear patterns from user decisions
- SQL patterns: HIGH - Standard SQL window functions, verified schema
- Pitfalls: MEDIUM - Some edge cases (retry detection) need runtime validation

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days - stable patterns, established stack)
