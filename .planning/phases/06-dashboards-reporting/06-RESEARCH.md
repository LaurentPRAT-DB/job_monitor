# Phase 6: Dashboards & Reporting - Research

**Researched:** 2026-02-25
**Domain:** Dashboard filtering, URL state management, historical visualization, scheduled email reports
**Confidence:** HIGH

## Summary

Phase 6 transforms the existing monitoring application into a polished, persona-driven experience with global filtering, historical trend visualization, and automated scheduled reports. The implementation spans three main areas: (1) a global filter bar with URL state persistence using TanStack Router's search params, (2) historical dashboards with time-series line charts showing previous period overlays, and (3) a scheduled report generation system using APScheduler with email delivery via SMTP.

The existing codebase provides excellent foundations: Recharts for charting (with established patterns for line charts and dashed reference lines), TanStack Router (already routing with route-level components), and comprehensive data APIs (health metrics, cost summaries, alerts). The main new capabilities needed are: URL search param synchronization for filters, time granularity aggregation in SQL queries, and a background scheduler for report generation.

Key implementation insight: The three report types (daily health, weekly cost, monthly executive) can reuse existing API endpoints with different time ranges and aggregation levels. Report content can be rendered as HTML tables using Jinja2 templates, then sent via Python's smtplib or a lightweight email library like `emails`.

**Primary recommendation:** Add global filter context using React Context + TanStack Router search params, extend existing API endpoints with filter parameters (team, job_id, time_range), use Recharts with multiple Line components for previous period overlays, and implement APScheduler with CronTrigger for fixed-schedule reports.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Global header bar for filters (applies to all pages, consistent experience)
- Three core filter dimensions: Team, Job, Time range
- Full URL encoding of filter state for shareable links
- Shared presets: team-wide saved filter combinations anyone can use
- Time range selector: preset buttons (7/30/90 days) plus custom date picker
- Line charts for trend visualization (continuous lines showing metric progression)
- Previous period overlay: dashed line showing same-length prior period for comparison
- Auto granularity based on selected range: 7d = hourly, 30d = daily, 90d = weekly
- **Daily health summary:** Full status overview of all monitored jobs (not just failures)
- **Weekly cost report:** Anomaly-first format - lead with cost spikes and anomalies, then team breakdown
- **Monthly executive report:** Full detail with recommendations - TCO, reliability %, team rankings, plus optimization ROI and recommendations
- Email only as delivery channel (simple, works with existing workflows)
- Admin configures distribution lists per report type
- Fixed schedules: daily at 8am, weekly on Monday, monthly on 1st

### Claude's Discretion
- Visual density in reports (text+tables vs embedded charts - appropriate per report type)
- Whether to include in-app report archive with download capability
- Email formatting and styling

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| APP-03 | Support filtering/drill-down by team, job, time range | TanStack Router search params for URL state, global FilterContext, API filter parameters |
| APP-04 | Historical dashboard with 7/30/90-day views | Recharts LineChart with multiple series, auto-granularity SQL aggregation, date range picker component |
| ALERT-03 | Generate daily health summary (overnight failures, SLA breaches, action items) | APScheduler CronTrigger at 8am, Jinja2 HTML template, SMTP email delivery |
| ALERT-04 | Generate weekly cost report (per-team spend, trends, anomalies) | APScheduler CronTrigger on Monday, anomaly-first report structure, team cost aggregation SQL |
| ALERT-05 | Generate monthly executive report (TCO, reliability metrics, optimization ROI) | APScheduler CronTrigger on 1st, comprehensive data aggregation, recommendation generation |

</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-router | ^1.58.12 | URL state management | Already routing, has search params API |
| @tanstack/react-query | ^5.59.0 | Data fetching with filter params | Already caching, handles param changes |
| recharts | ^3.7.0 | Line charts with overlays | Already used for duration charts, sparklines |
| FastAPI | >=0.100.0 | Backend API with query params | Already handling requests |
| pydantic | >=2.0 | Request validation | Already validating models |

### New Dependencies Required
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| APScheduler | ^3.10.4 | Background job scheduling | Fixed-schedule report generation |
| emails | ^0.6 | Simplified SMTP email | Report delivery (lighter than smtplib raw) |
| Jinja2 | ^3.1.2 | HTML template rendering | Report content generation |
| date-fns | ^3.0.0 | Date manipulation in frontend | Time range calculations, custom date picker |

### shadcn/ui Components to Add
| Component | Command | Purpose |
|-----------|---------|---------|
| Select | `npx shadcn@latest add select` | Team/job dropdown filters |
| Popover | `npx shadcn@latest add popover` | Date range picker trigger |
| Calendar | `npx shadcn@latest add calendar` | Custom date range selection |
| Input | `npx shadcn@latest add input` | Filter preset naming |

**Installation:**
```bash
# Frontend (from ui/ directory)
cd job_monitor/ui
npx shadcn@latest add select popover calendar input
npm install date-fns

# Backend (from project root)
pip install apscheduler emails jinja2
```

## Architecture Patterns

### Recommended Project Structure
```
job_monitor/
  backend/
    routers/
      reports.py            # NEW: Report generation endpoints
      filters.py            # NEW: Filter presets CRUD
    scheduler.py            # NEW: APScheduler setup and jobs
    templates/              # NEW: Jinja2 report templates
      daily_health.html
      weekly_cost.html
      monthly_executive.html
    models.py               # EXTEND: FilterPreset, ReportConfig models
    config.py               # EXTEND: Email settings
  ui/
    components/
      global-filter-bar.tsx     # NEW: Header filter component
      time-range-picker.tsx     # NEW: Date range selector
      historical-chart.tsx      # NEW: Line chart with period overlay
      filter-presets.tsx        # NEW: Saved presets dropdown
    lib/
      filter-context.tsx        # NEW: Global filter state context
      filter-utils.ts           # NEW: URL encoding, date helpers
    routes/
      _sidebar/
        historical.tsx          # NEW: Historical dashboard page
        reports.tsx             # NEW: Report configuration page
```

### Pattern 1: Global Filter Context with URL Sync
**What:** React Context that syncs filter state with URL search params for shareable links.
**When to use:** All pages that need filtering capability.
**Example:**
```typescript
// lib/filter-context.tsx
import { createContext, useContext, ReactNode } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';

interface FilterState {
  team: string | null;
  jobId: string | null;
  timeRange: '7d' | '30d' | '90d' | 'custom';
  startDate: string | null;
  endDate: string | null;
}

const defaultFilters: FilterState = {
  team: null,
  jobId: null,
  timeRange: '7d',
  startDate: null,
  endDate: null,
};

interface FilterContextType {
  filters: FilterState;
  setFilters: (updates: Partial<FilterState>) => void;
  clearFilters: () => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();

  // Read from URL search params
  const filters: FilterState = {
    team: search.team ?? null,
    jobId: search.jobId ?? null,
    timeRange: search.timeRange ?? '7d',
    startDate: search.startDate ?? null,
    endDate: search.endDate ?? null,
  };

  const setFilters = (updates: Partial<FilterState>) => {
    navigate({
      search: (prev) => ({
        ...prev,
        ...updates,
      }),
      replace: true,
    });
  };

  const clearFilters = () => {
    navigate({ search: {}, replace: true });
  };

  return (
    <FilterContext.Provider value={{ filters, setFilters, clearFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
```

### Pattern 2: TanStack Router Search Params Schema
**What:** Define typed search params at route level for URL validation.
**When to use:** Routes that accept filter parameters.
**Example:**
```typescript
// In routeTree.gen.tsx or route definitions
import { createRoute } from '@tanstack/react-router';
import { z } from 'zod'; // If using zod for validation

// Search params schema
const filterSearchSchema = z.object({
  team: z.string().optional(),
  jobId: z.string().optional(),
  timeRange: z.enum(['7d', '30d', '90d', 'custom']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Route with typed search params
const jobHealthRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/job-health',
  component: JobHealthPage,
  validateSearch: (search) => filterSearchSchema.parse(search),
});
```

### Pattern 3: Previous Period Overlay Chart
**What:** Recharts LineChart with two Line components - current period (solid) and previous period (dashed).
**When to use:** Historical trend visualization with comparison.
**Example:**
```typescript
// components/historical-chart.tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  date: string;
  current: number;
  previous: number;
}

interface HistoricalChartProps {
  data: DataPoint[];
  yAxisLabel: string;
  formatValue: (value: number) => string;
}

export function HistoricalChart({
  data,
  yAxisLabel,
  formatValue,
}: HistoricalChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <XAxis
          dataKey="date"
          tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        />
        <YAxis tickFormatter={formatValue} />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatValue(value),
            name === 'current' ? 'Current Period' : 'Previous Period',
          ]}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
        />
        <Legend />
        {/* Current period - solid blue line */}
        <Line
          type="monotone"
          dataKey="current"
          name="Current Period"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        {/* Previous period - dashed gray line */}
        <Line
          type="monotone"
          dataKey="previous"
          name="Previous Period"
          stroke="#9ca3af"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Pattern 4: Auto-Granularity SQL Aggregation
**What:** SQL query that adjusts aggregation granularity based on time range.
**When to use:** Historical data endpoints.
**Example:**
```python
# backend/routers/historical.py
def get_granularity_interval(days: int) -> tuple[str, str]:
    """Determine SQL interval and group format based on range.

    Returns:
        Tuple of (SQL date_trunc interval, Python strftime format)
    """
    if days <= 7:
        # Hourly granularity for 7 days
        return "HOUR", "%Y-%m-%d %H:00"
    elif days <= 30:
        # Daily granularity for 30 days
        return "DAY", "%Y-%m-%d"
    else:
        # Weekly granularity for 90 days
        return "WEEK", "%Y-W%W"


async def get_historical_costs(
    ws,
    warehouse_id: str,
    days: int = 7,
    team: str | None = None,
    job_id: str | None = None,
) -> list[dict]:
    """Get historical cost data with auto-granularity."""

    interval, _ = get_granularity_interval(days)

    # Build WHERE clause with optional filters
    where_clauses = [f"usage_date >= current_date() - INTERVAL {days} DAYS"]
    if team:
        where_clauses.append(f"team = '{team}'")  # Sanitize in production!
    if job_id:
        where_clauses.append(f"usage_metadata.job_id = '{job_id}'")

    where_sql = " AND ".join(where_clauses)

    query = f"""
    SELECT
        DATE_TRUNC('{interval}', usage_date) as period,
        SUM(usage_quantity) as total_dbus
    FROM system.billing.usage
    WHERE {where_sql}
    GROUP BY DATE_TRUNC('{interval}', usage_date)
    ORDER BY period
    """

    # Execute and return...
```

### Pattern 5: APScheduler with FastAPI Lifespan
**What:** Background scheduler that starts with the app and runs cron jobs.
**When to use:** Fixed-schedule report generation.
**Example:**
```python
# backend/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from contextlib import asynccontextmanager

scheduler = AsyncIOScheduler()

async def generate_daily_health_report():
    """Generate and send daily health summary at 8am."""
    # Collect data from existing endpoints
    # Render HTML template
    # Send email
    pass

async def generate_weekly_cost_report():
    """Generate and send weekly cost report on Monday 8am."""
    pass

async def generate_monthly_executive_report():
    """Generate and send monthly executive report on 1st at 8am."""
    pass

def setup_scheduler():
    """Configure scheduled jobs."""
    # Daily at 8am
    scheduler.add_job(
        generate_daily_health_report,
        CronTrigger(hour=8, minute=0),
        id="daily_health_report",
        replace_existing=True,
    )

    # Weekly on Monday at 8am
    scheduler.add_job(
        generate_weekly_cost_report,
        CronTrigger(day_of_week="mon", hour=8, minute=0),
        id="weekly_cost_report",
        replace_existing=True,
    )

    # Monthly on 1st at 8am
    scheduler.add_job(
        generate_monthly_executive_report,
        CronTrigger(day=1, hour=8, minute=0),
        id="monthly_executive_report",
        replace_existing=True,
    )

# In app.py lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_scheduler()
    scheduler.start()

    yield

    # Shutdown
    scheduler.shutdown()
```

### Pattern 6: Email Report with Jinja2 Template
**What:** HTML email generation using Jinja2 templates.
**When to use:** Report content rendering.
**Example:**
```python
# backend/templates/daily_health.html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .summary { background: #f3f4f6; padding: 16px; border-radius: 8px; }
    .alert-p1 { color: #dc2626; }
    .alert-p2 { color: #ea580c; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; }
  </style>
</head>
<body>
  <h1>Daily Health Summary - {{ date }}</h1>

  <div class="summary">
    <h2>Overview</h2>
    <p>Total Jobs: {{ total_jobs }} | Healthy: {{ healthy_count }} | Warning: {{ warning_count }} | Critical: {{ critical_count }}</p>
  </div>

  {% if p1_alerts %}
  <h2 class="alert-p1">Critical Alerts (P1)</h2>
  <table>
    <tr><th>Job</th><th>Issue</th><th>Recommendation</th></tr>
    {% for alert in p1_alerts %}
    <tr>
      <td>{{ alert.job_name }}</td>
      <td>{{ alert.title }}</td>
      <td>{{ alert.remediation }}</td>
    </tr>
    {% endfor %}
  </table>
  {% endif %}

  <!-- Continue with P2, P3, job status table... -->
</body>
</html>
```

```python
# backend/routers/reports.py
from jinja2 import Environment, FileSystemLoader
from emails import Message
import emails.backend.smtp

env = Environment(loader=FileSystemLoader("job_monitor/backend/templates"))

async def send_report_email(
    template_name: str,
    context: dict,
    recipients: list[str],
    subject: str,
):
    """Render template and send via SMTP."""
    template = env.get_template(template_name)
    html_content = template.render(**context)

    message = Message(
        subject=subject,
        html=html_content,
        mail_from=settings.email_from,
    )

    smtp_response = message.send(
        to=recipients,
        smtp={
            "host": settings.smtp_host,
            "port": settings.smtp_port,
            "user": settings.smtp_user,
            "password": settings.smtp_password,
            "tls": True,
        },
    )

    return smtp_response.status_code == 250
```

### Pattern 7: Filter Presets Storage
**What:** Team-wide saved filter combinations stored in application config.
**When to use:** Shared filter presets feature.
**Example:**
```python
# backend/models.py
class FilterPreset(BaseModel):
    """Saved filter combination for quick access."""
    id: str
    name: str  # e.g., "My Team Last 7d"
    team: str | None = None
    job_ids: list[str] | None = None
    time_range: Literal['7d', '30d', '90d', 'custom'] = '7d'
    start_date: str | None = None
    end_date: str | None = None
    created_by: str
    created_at: datetime
    is_shared: bool = True  # Visible to all team members

# Simple in-memory storage for MVP (can migrate to Delta table later)
_presets: list[FilterPreset] = []

@router.get("/api/filters/presets")
async def get_filter_presets() -> list[FilterPreset]:
    return _presets

@router.post("/api/filters/presets")
async def create_filter_preset(preset: FilterPreset) -> FilterPreset:
    preset.id = f"preset_{len(_presets)}"
    preset.created_at = datetime.now()
    _presets.append(preset)
    return preset
```

### Anti-Patterns to Avoid
- **Storing filters in component state only:** Loses state on refresh, not shareable. Always sync with URL.
- **Fetching unfiltered data then filtering client-side:** Inefficient for large datasets. Add filters to SQL queries.
- **Rendering charts as images in emails:** Complex and often breaks. Use HTML tables for email reports.
- **Running scheduler in separate process:** Adds deployment complexity. Use asyncio scheduler within FastAPI process.
- **Polling for report completion:** Reports are background jobs. Use email delivery as notification.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL state sync | Manual URL parsing | TanStack Router search params | Type-safe, automatic encoding |
| Date range picker | Custom date input | shadcn Calendar + Popover | Accessibility, edge cases |
| Cron scheduling | setInterval/setTimeout | APScheduler CronTrigger | Handles missed jobs, persistence |
| HTML email templates | String concatenation | Jinja2 templates | Maintainable, proper escaping |
| Email sending | Raw smtplib | emails library | Cleaner API, handles encoding |
| Chart overlays | Multiple chart instances | Recharts multiple Line | Single coordinate system |

**Key insight:** The filtering/URL sync pattern is the most critical new pattern. Get this right and all pages automatically gain shareable, persistent filter state.

## Common Pitfalls

### Pitfall 1: URL State Flicker
**What goes wrong:** Page flickers/re-renders when filter state updates URL.
**Why it happens:** Each setFilters call triggers navigation, causing component remount.
**How to avoid:** Use `replace: true` in navigation to avoid history stack growth. Debounce rapid filter changes.
**Warning signs:** Browser back button doesn't work as expected; page content flashes on filter change.

### Pitfall 2: Timezone Mismatch in Historical Data
**What goes wrong:** Historical chart shows data in wrong timezone; daily boundaries don't match expectations.
**Why it happens:** SQL date functions use server timezone, frontend uses user timezone.
**How to avoid:** Always use UTC in SQL queries and API. Convert to local timezone only in frontend display.
**Warning signs:** Data appears shifted by hours; "today" bucket includes yesterday's data.

### Pitfall 3: Missing Granularity Transitions
**What goes wrong:** Chart shows confusing gaps when switching from 7d (hourly) to 30d (daily).
**Why it happens:** Data aggregation changes but X-axis doesn't adjust formatting.
**How to avoid:** Pass granularity to frontend; adjust XAxis tickFormatter based on granularity.
**Warning signs:** Hourly timestamps shown for daily data; cramped/unreadable X-axis labels.

### Pitfall 4: Email Delivery Failures Silent
**What goes wrong:** Reports don't send but no error is visible.
**Why it happens:** SMTP errors caught and swallowed in background job.
**How to avoid:** Log all email attempts with success/failure. Consider adding report status endpoint.
**Warning signs:** Users report not receiving reports; no errors in logs.

### Pitfall 5: Scheduler Not Starting in Production
**What goes wrong:** Reports work locally but not in deployed app.
**Why it happens:** APScheduler needs explicit start() call in lifespan; Databricks Apps may have cold start issues.
**How to avoid:** Add scheduler health check endpoint. Log when scheduler starts and adds jobs.
**Warning signs:** Scheduled jobs never run; scheduler status shows no active jobs.

### Pitfall 6: Previous Period Data Alignment
**What goes wrong:** Comparison chart shows misaligned data (Monday vs Tuesday).
**Why it happens:** Previous period calculation doesn't account for day-of-week alignment.
**How to avoid:** For 7d comparison, shift by exactly 7 days. For 30d, align by day-of-month or use calendar math.
**Warning signs:** Weekday patterns don't align; comparison looks random.

## Code Examples

### Global Filter Bar Component
```typescript
// components/global-filter-bar.tsx
import { useFilters } from '@/lib/filter-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimeRangePicker } from './time-range-picker';
import { FilterPresets } from './filter-presets';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface Team {
  name: string;
  job_count: number;
}

interface GlobalFilterBarProps {
  teams: Team[];
  jobs: { job_id: string; job_name: string }[];
}

export function GlobalFilterBar({ teams, jobs }: GlobalFilterBarProps) {
  const { filters, setFilters, clearFilters } = useFilters();

  const hasFilters = filters.team || filters.jobId || filters.timeRange !== '7d';

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-50 border-b">
      {/* Presets dropdown */}
      <FilterPresets />

      {/* Team filter */}
      <Select
        value={filters.team ?? 'all'}
        onValueChange={(v) => setFilters({ team: v === 'all' ? null : v })}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Teams" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Teams</SelectItem>
          {teams.map((team) => (
            <SelectItem key={team.name} value={team.name}>
              {team.name} ({team.job_count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Job filter */}
      <Select
        value={filters.jobId ?? 'all'}
        onValueChange={(v) => setFilters({ jobId: v === 'all' ? null : v })}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Jobs" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Jobs</SelectItem>
          {jobs.map((job) => (
            <SelectItem key={job.job_id} value={job.job_id}>
              {job.job_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Time range picker */}
      <TimeRangePicker
        value={filters.timeRange}
        startDate={filters.startDate}
        endDate={filters.endDate}
        onChange={(range, start, end) => setFilters({
          timeRange: range,
          startDate: start,
          endDate: end,
        })}
      />

      {/* Clear filters */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
```

### Time Range Picker Component
```typescript
// components/time-range-picker.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format, subDays } from 'date-fns';

type TimeRange = '7d' | '30d' | '90d' | 'custom';

interface TimeRangePickerProps {
  value: TimeRange;
  startDate: string | null;
  endDate: string | null;
  onChange: (range: TimeRange, start: string | null, end: string | null) => void;
}

export function TimeRangePicker({
  value,
  startDate,
  endDate,
  onChange,
}: TimeRangePickerProps) {
  const [customOpen, setCustomOpen] = useState(false);

  const presets: { value: TimeRange; label: string }[] = [
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
  ];

  return (
    <div className="flex items-center gap-2">
      {/* Preset buttons */}
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant={value === preset.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(preset.value, null, null)}
        >
          {preset.label}
        </Button>
      ))}

      {/* Custom date picker */}
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value === 'custom' ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
          >
            <CalendarIcon className="h-4 w-4" />
            {value === 'custom' && startDate && endDate
              ? `${format(new Date(startDate), 'MMM d')} - ${format(new Date(endDate), 'MMM d')}`
              : 'Custom'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={startDate ? new Date(startDate) : subDays(new Date(), 30)}
            selected={{
              from: startDate ? new Date(startDate) : undefined,
              to: endDate ? new Date(endDate) : undefined,
            }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                onChange(
                  'custom',
                  format(range.from, 'yyyy-MM-dd'),
                  format(range.to, 'yyyy-MM-dd')
                );
                setCustomOpen(false);
              }
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

### Historical Data Endpoint with Filters
```python
# backend/routers/historical.py
from fastapi import APIRouter, Depends, Query
from typing import Annotated, Literal
import asyncio

router = APIRouter(prefix="/api/historical", tags=["historical"])

class HistoricalDataPoint(BaseModel):
    date: str
    current: float
    previous: float

class HistoricalResponse(BaseModel):
    data: list[HistoricalDataPoint]
    granularity: Literal['hourly', 'daily', 'weekly']
    total_current: float
    total_previous: float

@router.get("/costs", response_model=HistoricalResponse)
async def get_historical_costs(
    days: Annotated[int, Query(ge=1, le=90)] = 7,
    team: Annotated[str | None, Query()] = None,
    job_id: Annotated[str | None, Query()] = None,
    start_date: Annotated[str | None, Query()] = None,
    end_date: Annotated[str | None, Query()] = None,
    ws=Depends(get_ws),
) -> HistoricalResponse:
    """Get historical cost data with auto-granularity and previous period comparison."""

    # Determine granularity
    if days <= 7:
        interval, granularity = "HOUR", "hourly"
    elif days <= 30:
        interval, granularity = "DAY", "daily"
    else:
        interval, granularity = "WEEK", "weekly"

    # Build filter WHERE clause
    filters = []
    if team:
        filters.append(f"team = '{team}'")
    if job_id:
        filters.append(f"usage_metadata.job_id = '{job_id}'")

    filter_sql = " AND " + " AND ".join(filters) if filters else ""

    # Query current and previous periods
    query = f"""
    WITH current_period AS (
        SELECT
            DATE_TRUNC('{interval}', usage_date) as period,
            SUM(usage_quantity) as total_dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL {days} DAYS
          AND usage_metadata.job_id IS NOT NULL
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', usage_date)
    ),
    previous_period AS (
        SELECT
            DATE_TRUNC('{interval}', usage_date) + INTERVAL {days} DAYS as period,
            SUM(usage_quantity) as total_dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL {days * 2} DAYS
          AND usage_date < current_date() - INTERVAL {days} DAYS
          AND usage_metadata.job_id IS NOT NULL
          {filter_sql}
        GROUP BY DATE_TRUNC('{interval}', usage_date)
    )
    SELECT
        COALESCE(c.period, p.period) as period,
        COALESCE(c.total_dbus, 0) as current_dbus,
        COALESCE(p.total_dbus, 0) as previous_dbus
    FROM current_period c
    FULL OUTER JOIN previous_period p ON c.period = p.period
    ORDER BY period
    """

    # Execute and return...
```

### Report Generation Job
```python
# backend/scheduler.py
async def generate_daily_health_report():
    """Generate and send daily health summary."""
    from job_monitor.backend.routers.health_metrics import get_health_metrics
    from job_monitor.backend.routers.alerts import get_alerts

    # Get data from existing endpoints
    health = await get_health_metrics(days=1)  # Last 24 hours
    alerts = await get_alerts()

    # Separate by severity
    p1_alerts = [a for a in alerts.alerts if a.severity == 'P1']
    p2_alerts = [a for a in alerts.alerts if a.severity == 'P2']

    # Calculate summary stats
    healthy = len([j for j in health.jobs if j.status == 'green'])
    warning = len([j for j in health.jobs if j.status == 'yellow'])
    critical = len([j for j in health.jobs if j.status == 'red'])

    # Render template
    context = {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'total_jobs': len(health.jobs),
        'healthy_count': healthy,
        'warning_count': warning,
        'critical_count': critical,
        'p1_alerts': p1_alerts,
        'p2_alerts': p2_alerts,
        'all_jobs': health.jobs,
    }

    # Get recipients from config
    recipients = settings.daily_report_recipients.split(',')

    await send_report_email(
        template_name='daily_health.html',
        context=context,
        recipients=recipients,
        subject=f'Daily Health Summary - {context["date"]}',
    )
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Query string manual parsing | TanStack Router search params | 2024+ | Type-safe URL state |
| Separate polling for filters | Single query with filter params | Standard | Reduces API calls |
| Image charts in emails | HTML tables | Standard | Better compatibility |
| Celery for background jobs | APScheduler (asyncio) | 2023+ | Simpler single-process deployment |
| Manual date calculation | date-fns library | 2020+ | Reliable timezone handling |

**Deprecated/outdated:**
- react-router useSearchParams (TanStack Router is project standard)
- node-cron for scheduling (Python backend uses APScheduler)
- Inline email HTML (Jinja2 templates are maintainable)

## Open Questions

1. **Email SMTP Configuration**
   - What we know: Need SMTP settings (host, port, credentials)
   - What's unclear: Should use Databricks-provided SMTP or external service?
   - Recommendation: Add environment variables for SMTP config. Start with standard SMTP, can migrate to service like SendGrid later.

2. **Filter Preset Persistence**
   - What we know: Need team-wide shareable presets
   - What's unclear: Where to store presets long-term (in-memory loses on restart)
   - Recommendation: Start in-memory for MVP. Can migrate to Delta table or job tags if persistence needed.

3. **Report Archive in App**
   - What we know: Claude's discretion whether to include
   - What's unclear: Storage location for archived reports
   - Recommendation: Skip for MVP. Focus on email delivery. Can add archive later using Delta table storage.

4. **Databricks Apps Scheduler Behavior**
   - What we know: APScheduler works with FastAPI
   - What's unclear: How Databricks Apps handles long-running processes and cold starts
   - Recommendation: Test scheduler in deployed environment. May need workaround if app sleeps between requests.

## Sources

### Primary (HIGH confidence)
- Existing codebase: routeTree.gen.tsx, duration-chart.tsx, health_metrics.py patterns
- TanStack Router documentation: Search params are first-class feature in v1.x
- Recharts documentation: Multiple Line components on same chart supported
- APScheduler documentation: CronTrigger with AsyncIOScheduler is standard pattern

### Secondary (MEDIUM confidence)
- shadcn/ui Select, Calendar, Popover: Standard components, well-documented
- date-fns: Widely used, well-tested date manipulation
- Jinja2: Standard Python templating for HTML generation
- emails library: Simplifies SMTP but less widely used than raw smtplib

### Tertiary (LOW confidence)
- Databricks Apps scheduler behavior: Needs testing in deployed environment
- Email deliverability: May need SPF/DKIM configuration depending on SMTP setup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries well-established or already in project
- Architecture (filtering): HIGH - TanStack Router search params is clear pattern
- Architecture (reports): MEDIUM - APScheduler is solid but Databricks Apps deployment untested
- Pitfalls: MEDIUM - Based on common patterns, some edge cases need runtime validation

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (30 days - stable patterns)
