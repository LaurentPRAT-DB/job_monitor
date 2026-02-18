# Phase 1: Foundation & Data Ingestion - Research

**Researched:** 2026-02-18
**Domain:** Databricks Apps (APX Framework), Unity Catalog System Tables, Jobs API
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundational infrastructure for the Databricks Job Monitoring Framework. The primary challenge is building a full-stack Databricks App using the APX framework (FastAPI + React) that authenticates users via workspace OAuth, queries Unity Catalog system tables, and supplements with Jobs API data.

The APX framework provides a well-documented pattern for building Databricks Apps with auto-generated TypeScript clients from FastAPI OpenAPI specs. Authentication is handled automatically via Databricks Apps OAuth with On-Behalf-Of (OBO) tokens for user context. System tables (`system.billing.usage`, `system.lakeflow.job_run_timeline`, `system.lakeflow.jobs`) provide the primary data sources, while the Jobs API fills gaps not available in system tables (e.g., real-time job status, task parameters, repair history).

Key architectural decisions include using Service Principal authentication for management operations (system tables have different access patterns than OBO tokens), implementing SCD2 query patterns for jobs tables, and handling RETRACTION records in billing data correctly from day one.

**Primary recommendation:** Use APX framework with FastAPI backend serving data from system tables via SQL warehouse + Jobs API via Databricks SDK, React frontend with TanStack Router, deploy via Databricks Asset Bundles.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| APP-01 | Deploy as Databricks App with web UI | APX framework provides FastAPI + React template; deploy via `databricks bundle deploy`; app.yaml configuration documented in skill |
| APP-02 | Authenticate users via Databricks workspace OAuth | Databricks Apps handle OAuth automatically; OBO token available in `X-Forwarded-Access-Token` header; Service Principal fallback for management APIs |
| APP-05 | Ingest data from Unity Catalog system tables | System tables (`system.billing.usage`, `system.lakeflow.job_run_timeline`, `system.lakeflow.jobs`) documented with schemas; query via SQL warehouse or Databricks Connect |
| APP-06 | Supplement with Jobs API for data not available in system tables | Jobs API via `WorkspaceClient().jobs.list()`, `list_runs()`, `get_run_output()`; covers real-time status, task parameters, repair history |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| APX Framework | Latest | Full-stack app scaffold | Official Databricks solutions framework; FastAPI + React with OpenAPI codegen |
| FastAPI | 0.100+ | Backend API framework | APX default; async support, auto OpenAPI, Pydantic integration |
| React | 18.x | Frontend framework | APX default; TanStack Router for routing, Suspense for data loading |
| Databricks SDK | 0.40+ | API access | Official Python SDK; Jobs API, clusters, SQL warehouse integration |
| Pydantic | 2.x | Data validation | APX default; models generate OpenAPI schemas automatically |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Router | 1.x | Frontend routing | APX default; file-based routing with type safety |
| TanStack Query | 5.x | Data fetching | APX default; auto-generated hooks from OpenAPI |
| shadcn/ui | Latest | UI components | APX default; accessible, customizable components |
| uvicorn | 0.25+ | ASGI server | APX default; production server for FastAPI |
| bun | 1.x | JS runtime/bundler | APX default; fast frontend builds |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| APX (FastAPI + React) | Streamlit/Gradio | Simpler to start but limited customization, no production-grade UX |
| TanStack Router | React Router | TanStack integrates better with TanStack Query; type-safe routes |
| SQL Warehouse queries | Databricks Connect | SQL Warehouse is serverless and scales; Connect requires cluster |
| shadcn/ui | Material UI | shadcn is lighter, more customizable, better Tailwind integration |

**Installation:**
```bash
# Initialize APX project
uvx --from git+https://github.com/databricks-solutions/apx.git apx init

# Prerequisites
brew install uv bun  # macOS
```

## Architecture Patterns

### Recommended Project Structure

```
job-monitor/
├── databricks.yml              # DABs configuration
├── app.yaml                    # Databricks App config
├── job_monitor/                # Python package (underscore name)
│   ├── __init__.py
│   ├── __dist__/               # Built frontend (CRITICAL: NOT in .gitignore!)
│   ├── backend/
│   │   ├── app.py              # FastAPI application
│   │   ├── core.py             # Dependencies, workspace client
│   │   ├── config.py           # Configuration
│   │   ├── models.py           # Pydantic models
│   │   └── routers/
│   │       ├── jobs.py         # Job monitoring endpoints
│   │       ├── billing.py      # Cost/billing endpoints
│   │       └── health.py       # Health check endpoint
│   └── ui/
│       ├── routes/
│       │   └── _sidebar/       # Sidebar layout routes
│       │       ├── dashboard.tsx
│       │       ├── jobs.tsx
│       │       └── jobs.$jobId.tsx
│       └── components/
│           └── apx/            # Custom components
└── tests/
```

### Pattern 1: APX 3-Model Pattern for API Models

**What:** Separate Input, Output, and ListOutput models for each entity
**When to use:** All API endpoints in APX
**Example:**
```python
# Source: APX skill documentation
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum

class JobStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    RUNNING = "running"
    PENDING = "pending"

# Full output model
class JobRunOut(BaseModel):
    run_id: str
    job_id: str
    job_name: str
    status: JobStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    dbu_cost: Optional[float] = None

# List output (summary for performance)
class JobRunListOut(BaseModel):
    run_id: str
    job_id: str
    job_name: str
    status: JobStatus
    start_time: datetime
    duration_seconds: Optional[int] = None
```

### Pattern 2: SCD2 Query Pattern for Jobs Tables

**What:** Handle Slowly Changing Dimension Type 2 semantics in system.lakeflow.jobs
**When to use:** Any query against system.lakeflow.jobs or system.lakeflow.job_tasks
**Example:**
```sql
-- Source: system-tables.md skill documentation
-- Get latest version of each job (SCD2 pattern)
WITH latest_jobs AS (
    SELECT *,
        ROW_NUMBER() OVER(
            PARTITION BY workspace_id, job_id
            ORDER BY change_time DESC
        ) as rn
    FROM system.lakeflow.jobs
    WHERE delete_time IS NULL
)
SELECT job_id, name, creator_user_name, schedule
FROM latest_jobs
WHERE rn = 1;
```

### Pattern 3: Billing RETRACTION Handling

**What:** Correctly aggregate billing data accounting for RETRACTION records
**When to use:** Any cost calculation from system.billing.usage
**Example:**
```sql
-- Source: pitfalls.md research
-- Correct aggregation handles RETRACTION records
SELECT
    usage_date,
    usage_metadata.job_id,
    SUM(usage_quantity) AS total_dbus
FROM system.billing.usage
WHERE usage_date >= current_date() - 30
    AND usage_metadata.job_id IS NOT NULL
GROUP BY usage_date, usage_metadata.job_id
HAVING SUM(usage_quantity) != 0;  -- Filter out fully retracted records
```

### Pattern 4: Service Principal for System Table Access

**What:** Use Service Principal auth for system table queries, OBO for user-specific operations
**When to use:** Backend data access in Databricks Apps
**Example:**
```python
# Source: databricks-deployment.md skill documentation
from fastapi import Request
from databricks.sdk import WorkspaceClient
from typing import Annotated
from fastapi import Header

# Service Principal client (app.state) - for system tables
def get_ws(request: Request) -> WorkspaceClient:
    return request.app.state.workspace_client

# User client for user-specific operations
def get_user_ws(
    request: Request,
    token: Annotated[str | None, Header(alias="X-Forwarded-Access-Token")] = None,
) -> WorkspaceClient:
    if token:
        return WorkspaceClient(token=token, auth_type="pat")
    return request.app.state.workspace_client
```

### Pattern 5: Async SDK Calls in FastAPI

**What:** Wrap synchronous Databricks SDK calls with asyncio.to_thread
**When to use:** Any Databricks SDK call in async FastAPI endpoints
**Example:**
```python
# Source: databricks-python-sdk SKILL.md
import asyncio
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()

@app.get("/api/jobs")
async def list_jobs():
    # CORRECT - runs in thread pool, doesn't block event loop
    jobs = await asyncio.to_thread(lambda: list(w.jobs.list()))
    return [{"id": j.job_id, "name": j.settings.name} for j in jobs]
```

### Anti-Patterns to Avoid

- **Querying system tables directly from frontend:** Creates performance issues at scale; always aggregate in backend
- **Missing DATABRICKS_HOST in app.yaml:** App URL is NOT workspace URL; must explicitly set host
- **Using OBO token for cluster management:** OBO lacks compute scopes; use Service Principal
- **Blocking SDK calls in async endpoints:** Databricks SDK is synchronous; wrap with `asyncio.to_thread()`
- **Ignoring SCD2 semantics:** Jobs table queries without ROW_NUMBER pattern return duplicate/incorrect data
- **Summing billing without HAVING clause:** Double-counts RETRACTION records

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI client generation | Custom fetch wrappers | Orval (APX default) | Type-safe hooks, automatic updates |
| OAuth authentication | Custom OAuth flow | Databricks Apps OAuth | Automatic OBO token handling |
| UI component library | Custom components | shadcn/ui | Accessible, tested, customizable |
| Frontend routing | Custom router | TanStack Router | File-based, type-safe, integrates with Query |
| Job run history | Jobs API polling | system.lakeflow.job_run_timeline | System tables are more efficient, no rate limits |
| Cost calculation | Custom DBU tracking | system.billing.usage | Official source of truth, handles all SKUs |
| SCD2 handling | Custom change tracking | ROW_NUMBER pattern | Standard SQL pattern, well-documented |

**Key insight:** APX provides a complete, integrated stack. Fighting the framework (custom routing, auth, etc.) creates maintenance burden and breaks automatic code generation.

## Common Pitfalls

### Pitfall 1: OBO Token Scope Limitations

**What goes wrong:** On-Behalf-Of tokens from Databricks Apps lack cluster/compute scopes by default, causing permission denied errors when accessing system tables or managing compute
**Why it happens:** OBO tokens inherit user permissions but certain scopes must be explicitly requested in app.yaml
**How to avoid:**
- Use Service Principal authentication for system table queries
- Add required scopes to app.yaml: `user_api_scopes: [compute.clusters:read, sql:*]`
- Initialize WorkspaceClient with explicit host: `DATABRICKS_HOST` env var required
**Warning signs:** "Permission denied" errors when querying system tables; empty responses from SDK calls

### Pitfall 2: System Table Data Latency

**What goes wrong:** System tables have 5-15 minute data latency; alerts and dashboards show stale data
**Why it happens:** System tables are updated asynchronously, not real-time
**How to avoid:**
- Use Jobs API for real-time status of specific critical jobs
- Display data freshness indicator in UI
- Design alerts with explicit latency acknowledgment
**Warning signs:** Users reporting failures before monitoring shows them; large gap between `period_end_time` and current time

### Pitfall 3: Missing Frontend Build Before Deploy

**What goes wrong:** TSX changes appear locally but not in deployed app
**Why it happens:** `npm run build` must be run before `databricks bundle deploy`; __dist__ folder must NOT be in .gitignore
**How to avoid:**
- Add build step to deployment process: `cd ui && npm run build && cd .. && databricks bundle deploy`
- Verify __dist__ not in .gitignore
- Add version indicator in UI to confirm deployment
**Warning signs:** Local changes don't appear in deployed app; __dist__ folder missing or outdated

### Pitfall 4: Jobs Table 365-Day Retention Limit

**What goes wrong:** Jobs not modified in 365 days don't appear in system.lakeflow.jobs
**Why it happens:** SCD2 tables only emit rows on configuration changes; unmodified jobs age out
**How to avoid:**
- Join job_run_timeline with jobs table using LEFT JOIN
- Track "job coverage" metric comparing distinct job_ids
- For long-running jobs, trigger dummy update to refresh presence
**Warning signs:** Jobs appearing in job_run_timeline but not in jobs table; historical analyses showing inconsistent job counts

### Pitfall 5: Cost Attribution Blindspot for All-Purpose Compute

**What goes wrong:** Jobs running on all-purpose (interactive) clusters have no cost attribution
**Why it happens:** `usage_metadata.job_id` only populated for job compute and serverless
**How to avoid:**
- Check `cluster_source` in queries
- Design dashboards to show "unattributable spend" explicitly
- Flag jobs using all-purpose compute as a data quality issue
**Warning signs:** Large discrepancy between total billing and attributed job costs; jobs showing in runs but not in billing

## Code Examples

### Example 1: FastAPI Router with System Table Query

```python
# Source: APX skill + system-tables.md
from fastapi import APIRouter, Depends
from databricks.sdk import WorkspaceClient
import asyncio
from datetime import datetime, timedelta
from .models import JobRunListOut
from .core import get_ws

api = APIRouter(prefix="/api")

@api.get("/jobs/runs", response_model=list[JobRunListOut], operation_id="listJobRuns")
async def list_job_runs(
    days: int = 7,
    ws: WorkspaceClient = Depends(get_ws)
):
    """Get recent job runs from system tables"""

    query = f"""
    SELECT
        run_id,
        job_id,
        period_start_time as start_time,
        period_end_time as end_time,
        run_duration_seconds,
        result_state
    FROM system.lakeflow.job_run_timeline
    WHERE period_start_time >= current_date() - INTERVAL {days} DAYS
    ORDER BY period_start_time DESC
    LIMIT 1000
    """

    # Execute via SQL warehouse (async wrap required)
    result = await asyncio.to_thread(
        ws.statement_execution.execute_statement,
        warehouse_id=os.environ.get("WAREHOUSE_ID"),
        statement=query,
        wait_timeout="30s"
    )

    runs = []
    for row in result.result.data_array:
        runs.append(JobRunListOut(
            run_id=str(row[0]),
            job_id=str(row[1]),
            start_time=datetime.fromisoformat(row[2]),
            end_time=datetime.fromisoformat(row[3]) if row[3] else None,
            duration_seconds=int(row[4]) if row[4] else None,
            status=row[5].lower() if row[5] else "unknown"
        ))

    return runs
```

### Example 2: Jobs API for Real-Time Status

```python
# Source: databricks-python-sdk examples
from databricks.sdk import WorkspaceClient
import asyncio

async def get_active_runs(ws: WorkspaceClient, job_id: int):
    """Get currently active runs for a job (real-time from API)"""
    runs = await asyncio.to_thread(
        lambda: list(ws.jobs.list_runs(job_id=job_id, active_only=True))
    )
    return [
        {
            "run_id": run.run_id,
            "state": run.state.life_cycle_state.value,
            "start_time": run.start_time,
            "run_page_url": run.run_page_url
        }
        for run in runs
    ]
```

### Example 3: app.yaml Configuration

```yaml
# Source: databricks-deployment.md
command:
  - uvicorn
  - job_monitor.backend.app:app
  - --host
  - 0.0.0.0
  - --port
  - "8000"

env:
  - name: DATABRICKS_HOST
    value: "https://your-workspace.cloud.databricks.com"  # REQUIRED!
  - name: WAREHOUSE_ID
    value: "abc123def456"

# OAuth scopes for user token (OBO)
user_api_scopes:
  - sql:*
  - compute.clusters:read
```

### Example 4: Frontend List Page with Suspense

```typescript
// Source: APX frontend-patterns.md
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useListJobRunsSuspense } from "@/lib/api";
import { selector } from "@/lib/selector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_sidebar/jobs")({
  component: () => (
    <Suspense fallback={<TableSkeleton />}>
      <JobsTable />
    </Suspense>
  ),
});

function JobsTable() {
  const { data: runs } = useListJobRunsSuspense(selector());

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Start Time</TableHead>
          <TableHead>Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.run_id}>
            <TableCell>{run.job_id}</TableCell>
            <TableCell>
              <Badge className={getStatusColor(run.status)}>{run.status}</Badge>
            </TableCell>
            <TableCell>{formatDate(run.start_time)}</TableCell>
            <TableCell>{run.duration_seconds ? `${Math.round(run.duration_seconds / 60)}m` : '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const getStatusColor = (status: string) => ({
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  running: "bg-blue-100 text-blue-800",
  pending: "bg-yellow-100 text-yellow-800"
}[status] || "bg-gray-100 text-gray-800");

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleString();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jobs API polling for history | System tables (system.lakeflow) | 2024 | No rate limits, richer data, no polling infrastructure |
| Custom OAuth implementation | Databricks Apps OAuth | 2024 | Automatic token handling, OBO support |
| Separate frontend deployment | APX monorepo with DABs | 2025 | Single deployment, automatic OpenAPI sync |
| All-purpose clusters for apps | Serverless SQL Warehouse | 2024+ | Cost-efficient, instant startup, better scaling |

**Deprecated/outdated:**
- Jobs API as primary data source for historical data (use system tables; API for real-time gaps only)
- Custom authentication flows (Databricks Apps handle OAuth automatically)
- Manual OpenAPI client generation (APX uses Orval for automatic generation)

## Open Questions

1. **SQL Warehouse vs Databricks Connect for system table queries**
   - What we know: Both work; SQL Warehouse is serverless and scales automatically
   - What's unclear: Cost comparison at scale; whether Connect provides better performance for large aggregations
   - Recommendation: Start with SQL Warehouse (simpler setup); evaluate Connect if performance issues arise

2. **User identity display format**
   - What we know: OBO token contains user email; can display in UI
   - What's unclear: Whether to show workspace-level or account-level identity
   - Recommendation: Use email from OBO token header; display in sidebar

3. **Real-time vs batch data refresh strategy**
   - What we know: System tables have 5-15 min latency; Jobs API is real-time
   - What's unclear: User expectations for data freshness
   - Recommendation: Default to system tables; add "refresh" button that fetches Jobs API for real-time snapshot

## Sources

### Primary (HIGH confidence)
- `/Users/laurent.prat/.claude/skills/databricks-app-apx/SKILL.md` - APX framework patterns, deployment
- `/Users/laurent.prat/.claude/skills/databricks-app-apx/databricks-deployment.md` - Deployment configuration, auth patterns
- `/Users/laurent.prat/.claude/skills/databricks-app-apx/backend-patterns.md` - API route patterns
- `/Users/laurent.prat/.claude/skills/databricks-unity-catalog/5-system-tables.md` - System table schemas, queries
- `/Users/laurent.prat/.claude/skills/databricks-python-sdk/SKILL.md` - SDK authentication, async patterns

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` - Project-level stack decisions
- `.planning/research/ARCHITECTURE.md` - Medallion architecture patterns
- `.planning/research/PITFALLS.md` - Domain-specific pitfalls (verified against skills)

### Tertiary (LOW confidence)
- Training data for Databricks Apps OAuth flow (verify against current docs.databricks.com)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - APX skill well-documented, multiple examples
- Architecture: HIGH - Clear patterns from skill documentation
- Pitfalls: HIGH - Documented in pitfalls research with official source citations
- System tables: HIGH - Comprehensive skill documentation with SQL examples
- Jobs API: HIGH - SDK skill with working code examples

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (30 days - stable technologies)
