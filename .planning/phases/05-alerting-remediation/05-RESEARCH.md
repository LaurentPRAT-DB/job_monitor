# Phase 5: Alerting & Remediation - Research

**Researched:** 2026-02-25
**Domain:** Alert Systems, Notification UI, Budget Management
**Confidence:** HIGH

## Summary

Phase 5 transforms the existing monitoring data into a proactive alerting system. The codebase already has the data sources needed (job health priorities, SLA tracking, cost anomalies, cluster utilization) - this phase adds alert generation, presentation, and remediation suggestions.

The implementation requires: (1) a backend alerts router that generates alerts by analyzing existing data sources, (2) new shadcn/ui components (Sheet for drawer, Alert for cards), (3) a toast notification library (sonner) for real-time P1/P2 alerts, and (4) budget threshold configuration storage in job tags.

**Primary recommendation:** Generate alerts dynamically from existing data sources on each API call (no separate alert table needed). Use Sheet component for slide-out drawer from right side, and sonner for toast notifications without the shadcn wrapper (to avoid next-themes dependency).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Both dedicated Alerts page AND slide-out drawer accessible from header
- Alerts page for full review/history with filtering
- Drawer for quick access from anywhere without losing context
- Header badge count + toast notifications for new P1/P2 alerts
- Inline alert indicators on job rows (small icon/badge on jobs with active alerts, click opens drawer)
- Alerts page grouped by severity first: P1 section, then P2, then P3
- 4 alert categories matching existing domains: Failure, SLA, Cost, Cluster
- P1 severity: 2+ consecutive failures OR SLA breach (actual breach, not just risk)
- P2 severity: SLA breach risk (80% threshold) and cost anomalies (>2x spike)
- P3 severity: Single failures, informational warnings
- Visual treatment: Color + icon per severity (red/critical icon for P1, orange/warning for P2, yellow/info for P3)
- Actionable one-liner suggestions (not multi-step runbooks)
- Context-aware with specifics: "Reduce to 4 workers" based on actual data, not generic "reduce cluster size"
- Inline with alert card/row - no extra click needed to see remediation
- Acknowledge-only model: mark as "acknowledged" but keep visible until underlying condition resolves
- Budget thresholds configurable at both job level (via job tags) and team level (aggregate monthly)
- Budget warnings: P2 at 80% approaching, P1 at 100% exceeded
- Proactive warnings auto-resolve when risk passes

### Claude's Discretion
- SLA breach risk trigger logic (80% of time elapsed, or combined with duration trending)
- Exact alert polling/refresh frequency
- Toast notification auto-dismiss timing
- Alert card layout and spacing details

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ALERT-01 | Display alerts in-app with severity levels (P1/P2/P3) | Alert data model with severity enum, Sheet/drawer component, dedicated Alerts page |
| ALERT-02 | Include actionable remediation suggestions with each alert | Remediation generation logic based on alert category, inline display in alert cards |
| SLA-03 | Alert on SLA breach risk when job exceeds 80% of allowed window | Backend logic comparing current running duration to SLA target, proactive detection |
| COST-03 | Set budget thresholds per job with breach alerts | Budget threshold storage in job tags, budget alert generation at 80%/100% levels |

</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^18.3.1 | UI framework | Already in project |
| @tanstack/react-query | ^5.59.0 | Data fetching, caching | Already in project, handles polling |
| @tanstack/react-router | ^1.58.12 | Routing | Already in project, add Alerts page route |
| lucide-react | ^0.575.0 | Icons | Already in project, has alert icons |
| tailwindcss | ^3.4.14 | Styling | Already in project |
| class-variance-authority | ^0.7.1 | Component variants | Already in project |

### New Dependencies Required
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-dialog | ^1.1.1 | Sheet/drawer foundation | Required by shadcn Sheet component |
| sonner | ^1.7.0 | Toast notifications | Real-time alert toasts (use directly, not via shadcn wrapper) |

### shadcn/ui Components to Add
| Component | Command | Purpose |
|-----------|---------|---------|
| Sheet | `npx shadcn@latest add sheet` | Slide-out drawer for quick alerts view |
| Alert | `npx shadcn@latest add alert` | Alert card styling |

**Installation:**
```bash
cd job_monitor/ui
npx shadcn@latest add sheet alert
npm install sonner
```

Note: The shadcn `sonner` component has a `next-themes` dependency for Next.js. For Vite+React, install `sonner` directly and create a simple wrapper:

```typescript
// components/ui/toaster.tsx
import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast bg-background text-foreground border-border shadow-lg',
          description: 'text-muted-foreground',
        },
      }}
    />
  );
}
```

## Architecture Patterns

### Recommended Project Structure
```
job_monitor/
  backend/
    routers/
      alerts.py              # NEW: Alert generation and listing
    models.py                # ADD: Alert models
  ui/
    components/
      ui/
        sheet.tsx            # NEW: shadcn Sheet component
        alert.tsx            # NEW: shadcn Alert component
        toaster.tsx          # NEW: Sonner wrapper
      alert-card.tsx         # NEW: Individual alert display
      alert-drawer.tsx       # NEW: Slide-out drawer with alerts
      alert-badge.tsx        # NEW: Header badge with count
      alert-indicator.tsx    # NEW: Inline indicator for job rows
    lib/
      alert-utils.ts         # NEW: Alert severity, formatting
    routes/
      _sidebar/
        alerts.tsx           # NEW: Dedicated alerts page
```

### Pattern 1: Alert Data Model

**What:** Unified alert model that covers all four categories with severity and remediation.

**Example:**
```python
# backend/models.py
from enum import Enum
from pydantic import BaseModel
from datetime import datetime

class AlertSeverity(str, Enum):
    P1 = "P1"  # Critical: consecutive failures, SLA breach, budget exceeded
    P2 = "P2"  # Warning: single failure, SLA risk, cost anomaly, budget approaching
    P3 = "P3"  # Info: warnings, trends

class AlertCategory(str, Enum):
    FAILURE = "failure"
    SLA = "sla"
    COST = "cost"
    CLUSTER = "cluster"

class Alert(BaseModel):
    """Alert model for all categories."""
    id: str  # Composite: {category}_{job_id}_{type}
    job_id: str
    job_name: str
    category: AlertCategory
    severity: AlertSeverity
    title: str  # Short summary: "2 consecutive failures"
    description: str  # Context: "Job failed at 10:30 AM, 10:15 AM"
    remediation: str  # Actionable: "Check cluster logs for OOM errors"
    created_at: datetime
    acknowledged: bool = False
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    # For auto-resolve tracking
    condition_key: str  # Unique key for condition: "{job_id}_consecutive_failures"
```

### Pattern 2: Alert Generation (Backend)

**What:** Generate alerts dynamically from existing data sources rather than storing in separate table.

**Why:** Alerts naturally expire when conditions resolve. Storing separately creates sync issues.

**Example:**
```python
# backend/routers/alerts.py
from fastapi import APIRouter, Depends, Query
from typing import Annotated
import asyncio

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

@router.get("")
async def get_alerts(
    severity: Annotated[list[str] | None, Query()] = None,
    category: Annotated[list[str] | None, Query()] = None,
    acknowledged: Annotated[bool | None, Query()] = None,
    ws=Depends(get_ws),
) -> AlertListOut:
    """Generate alerts from current system state.

    Combines data from:
    - health_metrics (failures, priorities)
    - job_tags (SLA targets, budget thresholds)
    - cost (anomalies, budget status)
    - cluster_metrics (over-provisioned)
    - pipeline (row count, schema drift)
    """
    alerts = []

    # Generate failure alerts from health metrics
    health = await get_health_metrics(days=7, ws=ws)
    for job in health.jobs:
        if job.priority == "P1":
            alerts.append(Alert(
                id=f"failure_{job.job_id}_consecutive",
                job_id=job.job_id,
                job_name=job.job_name,
                category=AlertCategory.FAILURE,
                severity=AlertSeverity.P1,
                title="2+ consecutive failures",
                description=f"Last {job.success_count} of {job.total_runs} runs failed",
                remediation=_generate_failure_remediation(job),
                created_at=job.last_run_time,
                condition_key=f"{job.job_id}_consecutive_failures",
            ))

    # Generate SLA alerts...
    # Generate cost alerts...
    # Generate cluster alerts...

    return AlertListOut(
        alerts=_sort_by_severity(alerts),
        total=len(alerts),
        by_severity=_count_by_severity(alerts),
    )
```

### Pattern 3: SLA Breach Risk Detection

**What:** Proactive alert when running job approaches SLA threshold.

**Recommendation:** Trigger at 80% of elapsed time, considering historical duration trends.

**Example:**
```python
async def _check_sla_breach_risk(ws, warehouse_id: str) -> list[Alert]:
    """Check currently running jobs against SLA targets."""

    # Query running jobs with SLA targets
    query = """
    WITH running_jobs AS (
        SELECT
            jrt.job_id,
            jrt.period_start_time,
            UNIX_TIMESTAMP() - UNIX_TIMESTAMP(jrt.period_start_time) as elapsed_seconds
        FROM system.lakeflow.job_run_timeline jrt
        WHERE jrt.result_state IS NULL  -- Still running
          AND jrt.period_start_time >= current_timestamp() - INTERVAL 24 HOURS
    )
    SELECT * FROM running_jobs
    """

    alerts = []
    for job in running_jobs:
        # Get SLA target from job tags
        sla_minutes = await get_sla_target(ws, job.job_id)
        if not sla_minutes:
            continue

        sla_seconds = sla_minutes * 60
        elapsed_pct = (job.elapsed_seconds / sla_seconds) * 100

        if elapsed_pct >= 100:
            # Actual breach - P1
            alerts.append(Alert(
                severity=AlertSeverity.P1,
                category=AlertCategory.SLA,
                title=f"SLA breached ({elapsed_pct:.0f}%)",
                remediation=f"Job exceeded {sla_minutes}m target. Check for data volume increase or cluster issues.",
            ))
        elif elapsed_pct >= 80:
            # Breach risk - P2
            remaining_seconds = sla_seconds - job.elapsed_seconds
            alerts.append(Alert(
                severity=AlertSeverity.P2,
                category=AlertCategory.SLA,
                title=f"SLA breach risk ({elapsed_pct:.0f}%)",
                description=f"Only {remaining_seconds // 60}m remaining of {sla_minutes}m target",
                remediation=f"Consider monitoring closely. Historical p90 is {p90_minutes}m.",
            ))

    return alerts
```

### Pattern 4: Budget Threshold Storage

**What:** Store budget thresholds in job tags, similar to SLA targets.

**Tag keys:**
- `budget_monthly_dbus`: Monthly DBU budget for this job
- `budget_team_monthly_dbus`: Monthly DBU budget for entire team (stored on one representative job or team-level config)

**Example:**
```python
# backend/config.py - add tag keys
budget_tag_key: str = "budget_monthly_dbus"
budget_team_tag_key: str = "budget_team_monthly_dbus"
```

### Pattern 5: Alert Acknowledgment Storage

**What:** Store acknowledgment state separately from alerts since alerts are generated dynamically.

**Options:**
1. **Job tags** - Add `alert_acknowledged_{condition_key}` tag (simplest, but clutters tags)
2. **Local storage** - Browser localStorage (per-user, lost on clear)
3. **Backend memory** - In-memory dict (lost on restart, but alerts regenerate)
4. **System table** - Custom Delta table in workspace (persistent, overkill for MVP)

**Recommendation:** Backend in-memory with TTL for MVP. Alerts auto-regenerate, acknowledged state expires after 24h or when underlying condition resolves.

```python
# Simple in-memory acknowledgment store
_acknowledged: dict[str, datetime] = {}  # condition_key -> acknowledged_at

def acknowledge_alert(condition_key: str, user: str):
    _acknowledged[condition_key] = datetime.now()

def is_acknowledged(condition_key: str) -> bool:
    if condition_key not in _acknowledged:
        return False
    # Expire after 24 hours
    if datetime.now() - _acknowledged[condition_key] > timedelta(hours=24):
        del _acknowledged[condition_key]
        return False
    return True
```

### Pattern 6: Sheet/Drawer for Quick Access

**What:** Slide-out panel from right side, accessible from header bell icon.

**Example:**
```typescript
// components/alert-drawer.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';

export function AlertDrawer() {
  const { data } = useQuery({
    queryKey: ['alerts'],
    queryFn: fetchAlerts,
    refetchInterval: 60000, // Poll every minute
  });

  const unacknowledgedCount = data?.alerts.filter(a => !a.acknowledged).length ?? 0;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-gray-100">
          <Bell className="h-5 w-5" />
          {unacknowledgedCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs">
              {unacknowledgedCount > 9 ? '9+' : unacknowledgedCount}
            </Badge>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Alerts</SheetTitle>
        </SheetHeader>
        {/* Alert list grouped by severity */}
      </SheetContent>
    </Sheet>
  );
}
```

### Pattern 7: Toast Notifications for New Alerts

**What:** Pop-up notifications when new P1/P2 alerts appear.

**Auto-dismiss timing (Claude's discretion):**
- P1: 10 seconds (urgent, need attention)
- P2: 5 seconds (warning, can be acknowledged later)
- P3: No toast (only show in drawer/page)

**Example:**
```typescript
// In main.tsx or root layout
import { Toaster } from '@/components/ui/toaster';

// In alert polling logic
import { toast } from 'sonner';

function useAlertPolling() {
  const previousAlertsRef = useRef<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ['alerts'],
    queryFn: fetchAlerts,
    refetchInterval: 60000,
    onSuccess: (data) => {
      // Find new P1/P2 alerts
      const currentIds = new Set(data.alerts.map(a => a.id));
      const newAlerts = data.alerts.filter(
        a => !previousAlertsRef.current.has(a.id) &&
             (a.severity === 'P1' || a.severity === 'P2')
      );

      // Show toasts for new alerts
      newAlerts.forEach(alert => {
        toast[alert.severity === 'P1' ? 'error' : 'warning'](alert.title, {
          description: alert.description,
          duration: alert.severity === 'P1' ? 10000 : 5000,
          action: {
            label: 'View',
            onClick: () => openAlertDrawer(),
          },
        });
      });

      previousAlertsRef.current = currentIds;
    },
  });
}
```

### Pattern 8: Remediation Generation

**What:** Context-aware suggestions based on alert type and data.

**Examples by category:**
```typescript
const REMEDIATION_TEMPLATES = {
  failure: {
    consecutive: (job) => {
      const reasons = job.failure_reasons?.slice(0, 2) || [];
      if (reasons.some(r => r.includes('OOM'))) {
        return 'Memory issue detected. Consider increasing driver/worker memory or reducing partition sizes.';
      }
      if (reasons.some(r => r.includes('timeout'))) {
        return 'Timeout detected. Check for data skew or increase task timeout settings.';
      }
      return 'Review recent run logs in Databricks UI for error details.';
    },
    single: () => 'Monitor next run. If failure persists, check job logs for root cause.',
  },
  sla: {
    breach: (job, sla) => `Job exceeded ${sla}m target. Review data volume changes or cluster sizing.`,
    risk: (job, elapsed, sla) =>
      `${Math.round(100 - elapsed)}% of SLA remaining. Consider monitoring or scaling cluster.`,
  },
  cost: {
    spike: (job, multiplier, baseline) =>
      `Cost ${multiplier.toFixed(1)}x above baseline (${baseline} DBUs). Check for increased data volume or inefficient queries.`,
    budget_warning: (job, pct, budget) =>
      `${pct}% of monthly budget (${budget} DBUs) used. Review cost trends in Costs page.`,
    budget_exceeded: (job, budget) =>
      `Monthly budget of ${budget} DBUs exceeded. Consider reducing job frequency or optimizing queries.`,
  },
  cluster: {
    over_provisioned: (job, utilization) =>
      `Average utilization ${utilization}%. Consider reducing worker count or using autoscaling.`,
  },
};
```

### Anti-Patterns to Avoid

- **Storing alerts in separate table:** Creates sync issues when underlying conditions change. Generate dynamically instead.
- **Generic remediation messages:** "Fix the issue" is useless. Include specifics from the data.
- **Alert fatigue:** Don't toast P3 alerts or duplicates. Keep toasts rare and actionable.
- **Polling too frequently:** 60s is reasonable for monitoring. More frequent wastes resources.
- **Blocking on acknowledgment:** Acknowledged alerts should still appear (just styled differently) until condition resolves.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slide-out drawer | Custom CSS animations | shadcn Sheet component | Handles focus trap, keyboard nav, animations |
| Toast notifications | Custom toast system | sonner library | Stacking, dismissal, accessibility built-in |
| Alert polling | Manual setInterval | TanStack Query refetchInterval | Handles stale data, window focus, cleanup |
| Badge count animation | Custom CSS counters | CSS `transition` on Badge | Simple, performant |

**Key insight:** The existing shadcn/ui and TanStack stack handles most UI patterns. Focus effort on alert generation logic and remediation quality.

## Common Pitfalls

### Pitfall 1: Alert Duplication
**What goes wrong:** Same condition generates multiple alerts (e.g., both "consecutive failure" and "single failure" for same job).
**Why it happens:** Alert generation logic doesn't deduplicate by condition.
**How to avoid:** Use `condition_key` as unique identifier. Higher severity takes precedence.
**Warning signs:** Alert count seems inflated; same job appears multiple times.

### Pitfall 2: Stale SLA Breach Risk
**What goes wrong:** SLA breach risk alert persists after job completes successfully.
**Why it happens:** Alert generation doesn't check if job is still running.
**How to avoid:** SLA risk alerts only for jobs with `result_state IS NULL`.
**Warning signs:** SLA risk alerts for jobs that completed hours ago.

### Pitfall 3: Toast Storm
**What goes wrong:** Many toasts appear at once on page load.
**Why it happens:** Initial fetch treats all alerts as "new".
**How to avoid:** Only toast alerts that didn't exist in previous fetch (use ref to track).
**Warning signs:** Multiple toasts stack on login or page refresh.

### Pitfall 4: Budget Threshold Race Condition
**What goes wrong:** Budget alert flip-flops between approaching/exceeded as costs update.
**Why it happens:** Billing data has slight latency, causing percentage to fluctuate.
**How to avoid:** Add hysteresis: only drop from "exceeded" to "approaching" if usage drops to 75%.
**Warning signs:** Budget alerts appear/disappear repeatedly in short period.

### Pitfall 5: Acknowledgment Loss
**What goes wrong:** User acknowledges alert, but it reappears after refresh.
**Why it happens:** Acknowledgment stored in memory, lost on backend restart.
**How to avoid:** Accept as MVP limitation, or use localStorage as backup with user ID.
**Warning signs:** Users report having to re-acknowledge same alerts repeatedly.

## Code Examples

### Alert Severity Badge
```typescript
// components/alert-severity-badge.tsx
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEVERITY_CONFIG = {
  P1: {
    icon: AlertCircle,
    className: 'bg-red-600 text-white hover:bg-red-700',
    label: 'Critical',
  },
  P2: {
    icon: AlertTriangle,
    className: 'bg-orange-500 text-white hover:bg-orange-600',
    label: 'Warning',
  },
  P3: {
    icon: Info,
    className: 'bg-yellow-500 text-black hover:bg-yellow-600',
    label: 'Info',
  },
} as const;

interface AlertSeverityBadgeProps {
  severity: 'P1' | 'P2' | 'P3';
  showLabel?: boolean;
}

export function AlertSeverityBadge({ severity, showLabel = false }: AlertSeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;

  return (
    <Badge className={cn('gap-1', config.className)}>
      <Icon className="h-3 w-3" />
      {showLabel ? config.label : severity}
    </Badge>
  );
}
```

### Alert Card
```typescript
// components/alert-card.tsx
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertSeverityBadge } from './alert-severity-badge';
import { Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/health-utils';

interface AlertCardProps {
  alert: AlertType;
  onAcknowledge: (id: string) => void;
}

export function AlertCard({ alert, onAcknowledge }: AlertCardProps) {
  return (
    <Alert
      className={cn(
        'relative',
        alert.acknowledged && 'opacity-60',
        alert.severity === 'P1' && 'border-red-200 bg-red-50',
        alert.severity === 'P2' && 'border-orange-200 bg-orange-50',
        alert.severity === 'P3' && 'border-yellow-200 bg-yellow-50',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <AlertSeverityBadge severity={alert.severity} />
            <span className="text-xs text-gray-500">{alert.category}</span>
            <span className="text-xs text-gray-400">{formatTimeAgo(alert.created_at)}</span>
          </div>
          <AlertTitle className="text-sm font-medium">{alert.title}</AlertTitle>
          <AlertDescription className="text-xs text-gray-600 mt-1">
            {alert.description}
          </AlertDescription>
          {/* Inline remediation - no extra click */}
          <div className="mt-2 p-2 bg-white/50 rounded text-xs">
            <span className="font-medium text-gray-700">Suggested action: </span>
            <span className="text-gray-600">{alert.remediation}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {!alert.acknowledged && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAcknowledge(alert.id)}
              className="h-7 px-2"
            >
              <Check className="h-3 w-3 mr-1" />
              Ack
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="h-7 px-2">
            <a href={`/job-health?job=${alert.job_id}`}>
              <ExternalLink className="h-3 w-3 mr-1" />
              View
            </a>
          </Button>
        </div>
      </div>
    </Alert>
  );
}
```

### Inline Alert Indicator for Job Rows
```typescript
// components/alert-indicator.tsx
import { Badge } from '@/components/ui/badge';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertIndicatorProps {
  alertCount: number;
  highestSeverity: 'P1' | 'P2' | 'P3' | null;
  onClick: () => void;
}

export function AlertIndicator({ alertCount, highestSeverity, onClick }: AlertIndicatorProps) {
  if (alertCount === 0 || !highestSeverity) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs',
        highestSeverity === 'P1' && 'bg-red-100 text-red-700',
        highestSeverity === 'P2' && 'bg-orange-100 text-orange-700',
        highestSeverity === 'P3' && 'bg-yellow-100 text-yellow-700',
      )}
    >
      <Bell className="h-3 w-3" />
      {alertCount}
    </button>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom toast implementation | sonner library | 2024 | Better accessibility, stacking, mobile support |
| CSS slide-out drawers | Radix Dialog + Sheet | 2023 | Focus management, keyboard nav, portal rendering |
| setInterval polling | TanStack Query refetchInterval | 2022 | Cleaner, handles visibility, deduplication |

**Deprecated/outdated:**
- react-toastify: Still works but sonner is lighter and more modern
- Manual alert tables: Unnecessary complexity when alerts can be generated dynamically

## Open Questions

1. **Alert persistence across restarts**
   - What we know: In-memory acknowledgment is simple but lost on restart
   - What's unclear: Is this acceptable for MVP or need persistent storage?
   - Recommendation: Accept for MVP. Alerts regenerate from data, acknowledgment can be re-applied.

2. **Team budget aggregation**
   - What we know: Job-level budget stored in tags. Team budget needs aggregation.
   - What's unclear: Where to store team-level budget threshold?
   - Recommendation: Use a special tag `budget_team_monthly_dbus` on jobs tagged with that team, or introduce team config endpoint in future phase.

3. **Real-time SLA breach risk**
   - What we know: Need to check running jobs against SLA targets
   - What's unclear: How to efficiently poll for running jobs without expensive queries?
   - Recommendation: Check running jobs via Jobs API (real-time) rather than system tables (15min latency).

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: models.py, health_metrics.py, cost.py patterns
- shadcn/ui component documentation via `npx shadcn view sheet/alert`
- sonner library: https://sonner.emilkowal.ski/

### Secondary (MEDIUM confidence)
- TanStack Query refetchInterval patterns from existing job-health.tsx
- lucide-react icon availability from existing component imports

### Tertiary (LOW confidence)
- Budget threshold patterns (extrapolated from SLA tag patterns)
- Team-level aggregation approach (needs validation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project or well-documented
- Architecture: HIGH - Extends existing patterns from Phase 2-4
- Pitfalls: MEDIUM - Based on common patterns, needs validation during implementation
- Remediation logic: MEDIUM - Requires iteration to get specificity right

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (30 days - stable domain)
