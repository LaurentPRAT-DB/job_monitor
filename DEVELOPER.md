# Developer Guide

This document provides detailed information for developers working on the Job Monitor project.

## Table of Contents

- [Project Structure](#project-structure)
- [Local Development Setup](#local-development-setup)
- [Backend Development](#backend-development)
- [Frontend Development](#frontend-development)
- [Performance Optimizations](#performance-optimizations)
- [Watch Points](#watch-points)
- [Testing](#testing)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [OBO Authentication](#obo-authentication)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Project Structure

```
databricks_job_monitoring/
├── job_monitor/
│   ├── backend/               # FastAPI backend
│   │   ├── app.py            # Main FastAPI application
│   │   ├── cache.py          # Cache layer for pre-aggregated metrics
│   │   ├── config.py         # Configuration loader (YAML + env vars)
│   │   ├── core.py           # Core utilities (SQL client, auth, OBO)
│   │   ├── mock_data.py      # Mock data generators for demos
│   │   ├── models.py         # Pydantic models
│   │   ├── scheduler.py      # APScheduler for background tasks
│   │   └── routers/          # API route handlers (14 routers)
│   │       ├── alerts.py     # Alert generation and management
│   │       ├── auth.py       # User authentication (/api/me)
│   │       ├── billing.py    # Billing/usage data
│   │       ├── cluster_metrics.py  # Cluster utilization stats
│   │       ├── cost.py       # Cost analysis endpoints
│   │       ├── filters.py    # Filter presets CRUD
│   │       ├── health.py     # Health check and cache status
│   │       ├── health_metrics.py  # Job health dashboard
│   │       ├── historical.py # Historical trends (costs, success rate)
│   │       ├── job_tags.py   # Job tag retrieval
│   │       ├── jobs.py       # Job listing from system tables
│   │       ├── jobs_api.py   # Jobs via Databricks Jobs API
│   │       ├── pipeline.py   # Pipeline integrity (row counts, schema)
│   │       └── reports.py    # Scheduled reports
│   ├── jobs/                  # Databricks jobs (Spark)
│   │   └── refresh_metrics_cache.py  # Cache refresh job
│   ├── ui/                    # React frontend
│   │   ├── components/       # React components
│   │   ├── lib/              # Utilities (API client, hooks)
│   │   │   ├── api.ts        # API client functions
│   │   │   ├── query-config.ts  # TanStack Query caching config
│   │   │   └── ...
│   │   ├── routes/           # TanStack Router pages
│   │   └── main.tsx          # App entry point
│   └── config.yaml           # Centralized configuration
├── app.yaml                   # Databricks App manifest (dev/E2 default)
├── app.e2.yaml               # Databricks App manifest (E2)
├── app.prod.yaml             # Databricks App manifest (DEMO WEST)
├── databricks.yml            # DABs bundle configuration (default)
├── databricks.e2.yml         # DABs bundle for E2
├── databricks.prod.yml       # DABs bundle for DEMO WEST
├── databricks.dev.yml        # DABs bundle for dev
├── deploy.sh                 # Deployment script (handles config swapping)
├── pyproject.toml            # Python project config
└── README.md                 # User documentation
```

---

## Local Development Setup

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- Databricks CLI configured with a profile
- A SQL Warehouse (Serverless recommended)

### Backend Setup

```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"

# Or using uv (faster)
uv sync
```

### Frontend Setup

```bash
cd job_monitor/ui
npm install
```

### Running Locally

**Backend** (from project root):
```bash
# Set required environment variables
export DATABRICKS_HOST="https://your-workspace.cloud.databricks.com"
export WAREHOUSE_ID="your-warehouse-id"
export USE_MOCK_DATA="true"  # For local dev without DB access

# Start backend with hot reload
uvicorn job_monitor.backend.app:app --reload --port 8000
```

**Frontend** (in another terminal):
```bash
cd job_monitor/ui
npm run dev
```

The frontend dev server proxies API requests to `http://localhost:8000`.

### Using Mock Data

For local development without Databricks access, enable mock data mode:

```bash
export USE_MOCK_DATA=true
uvicorn job_monitor.backend.app:app --reload
```

Mock data provides realistic job health, costs, and alerts for UI development.

---

## Backend Development

### Adding a New API Endpoint

1. **Create or edit a router** in `job_monitor/backend/routers/`:

```python
# job_monitor/backend/routers/my_feature.py
from fastapi import APIRouter, Depends
from ..core import get_ws_prefer_user  # ALWAYS use get_ws_prefer_user for system tables!
from ..models import MyResponse

router = APIRouter(prefix="/api/my-feature", tags=["my-feature"])

@router.get("", response_model=MyResponse)
async def get_my_feature(
    workspace_id: str | None = None,  # Support workspace filtering
    ws=Depends(get_ws_prefer_user),   # Use OBO authentication
):
    # Execute query using statement execution
    result = ws.statement_execution.execute_statement(
        warehouse_id=settings.warehouse_id,
        statement="SELECT ...",
        wait_timeout="30s",
    )
    return MyResponse(data=result)
```

2. **Register the router** in `job_monitor/backend/app.py`:

```python
from .routers import my_feature
app.include_router(my_feature.router)
```

3. **Add Pydantic models** in `job_monitor/backend/models.py` for request/response validation.

### SQL Client Usage

Use `statement_execution` for system table queries:

```python
from ..core import get_ws_prefer_user
from ..config import settings

@router.get("/data")
async def get_data(ws=Depends(get_ws_prefer_user)):
    result = ws.statement_execution.execute_statement(
        warehouse_id=settings.warehouse_id,
        statement="""
            SELECT job_id, name, result_state
            FROM system.lakeflow.job_run_timeline
            WHERE workspace_id = current_workspace_id()
            LIMIT 100
        """,
        wait_timeout="30s",
    )

    if result.status.state.value not in ("SUCCEEDED", "CLOSED"):
        raise HTTPException(status_code=500, detail="Query failed")

    if not result.result or not result.result.data_array:
        return {"jobs": []}

    columns = [col.name for col in result.manifest.schema.columns]
    rows = [dict(zip(columns, row)) for row in result.result.data_array]
    return {"jobs": rows}
```

---

## Frontend Development

### Tech Stack

- **React 18** - UI framework
- **TanStack Router** - File-based routing
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **Recharts** - Charts and visualizations

### Adding a New Page

1. Create a route file in `ui/routes/_sidebar/`:

```tsx
// ui/routes/_sidebar/my-page.tsx
import { useQuery } from '@tanstack/react-query'
import { queryPresets } from '@/lib/query-config'
import { useFilters } from '@/lib/filter-context'

export default function MyPage() {
  const { filters } = useFilters()

  const { data, isLoading } = useQuery({
    queryKey: ['my-data', filters.workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/my-feature?workspace_id=${filters.workspaceId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    ...queryPresets.semiLive,  // Choose appropriate preset
    enabled: filters.workspaceId !== 'pending',
  })

  if (isLoading) return <div>Loading...</div>
  return <div>{/* render data */}</div>
}
```

2. Add to sidebar navigation in `ui/components/sidebar.tsx`:

```tsx
const navItems: NavItem[] = [
  // ...existing items
  { href: '/my-page', label: 'My Page', icon: MyIcon },
]
```

### API Client Pattern

```typescript
// ui/lib/api.ts
export async function fetchMyData(workspaceId?: string): Promise<MyDataType> {
  const params = workspaceId ? `?workspace_id=${workspaceId}` : ''
  const response = await fetch(`/api/my-feature${params}`)
  if (!response.ok) throw new Error('Failed to fetch')
  return response.json()
}
```

### Client-Side Caching Strategy

#### Cache Tiers

| Preset | staleTime | gcTime | Use Case |
|--------|-----------|--------|----------|
| `static` | Infinity | 60 min | Historical data that never changes |
| `session` | 5 min | 30 min | User info, workspace config |
| `semiLive` | 2 min | 10 min | Job health, costs (matches system table 5-15 min latency) |
| `live` | 10 sec | 60 sec | Active jobs (needs freshness) |
| `slow` | 10 min | 30 min | Expensive queries (alerts, full costs) |

#### Query Key Consistency

Always use `queryKeys` factory for cache sharing:

```tsx
// Good - uses shared key factory
import { queryKeys, queryPresets } from '@/lib/query-config'

useQuery({
  queryKey: queryKeys.user.current(),
  queryFn: getCurrentUser,
  ...queryPresets.session,
})

// Bad - different keys prevent cache sharing
queryKey: ['user']
queryKey: ['user', 'me']
queryKey: ['current-user']
```

---

## Performance Optimizations

### Implemented Optimizations

#### 1. Health Summary Endpoint

**Problem:** Full `/api/health-metrics` returns 11KB payload, takes 11-16s
**Solution:** Added `/api/health-metrics/summary` returning only counts (136 bytes)

```python
# health_metrics.py
@router.get("/summary")
async def get_health_summary(days: int = 7):
    # Returns: {total_count, p1_count, p2_count, p3_count, healthy_count, avg_success_rate}
```

**Impact:** Dashboard uses 86x smaller payload

#### 2. Batch Job History Endpoint

**Problem:** Running Jobs page made 50+ individual API calls for job history
**Solution:** Single batch endpoint fetching all histories in parallel

```python
# jobs_api.py
@router.post("/runs/batch")
async def get_batch_runs(request: BatchRunsRequest):
    # Fetches history for all job_ids in parallel (20 concurrent)
    # 5s per-job timeout, 15s overall timeout
```

**Impact:** 52 requests → 5 requests

#### 3. Selective Alert Queries

**Problem:** `/api/alerts` runs 4 expensive queries (30s total)
**Solution:** Only run queries for requested categories

```python
# alerts.py
@router.get("")
async def get_alerts(category: list[AlertCategory] | None = None):
    # If category=['failure'], only runs failure query
```

**Impact:** 30s → 5s for single category

#### 4. Cost Summary Team Skip

**Problem:** Cost summary makes 50+ Jobs API calls for team tags (37s)
**Solution:** Added `include_teams=false` parameter

```python
# cost.py
@router.get("/summary")
async def get_cost_summary(include_teams: bool = False):
    # Skip expensive team tag lookups when not needed
```

**Impact:** 37s → 7.8s

#### 5. Filter Presets Caching

**Problem:** Filter presets query took ~3s every page load
**Solution:** 60-second in-memory cache with cache warm-up

```python
# filters.py
_presets_cache: dict = {"data": None, "timestamp": 0}
PRESETS_CACHE_TTL = 60  # seconds

# app.py - warm-up on startup
async def warm_up_caches(app: FastAPI):
    asyncio.create_task(...)  # Background, non-blocking
```

#### 6. Query Key Deduplication

**Problem:** Multiple components called `/api/me` with different query keys
**Solution:** Standardized on `queryKeys.user.current()`

**Impact:** 5+ API calls → 1 API call

#### 7. Default Failure Category on Alerts

**Problem:** Alerts page defaulted to "All" (30s query)
**Solution:** Default to "Failure" category (5s query)

### Performance Benchmarks

| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| Health Summary | N/A | 1.8s | New endpoint |
| Active Jobs (cached) | 25s | 200ms | 125x faster |
| Cost Summary | 37s | 7.8s | 5x faster |
| Alerts (failure only) | 30s | 5s | 6x faster |
| Filter Presets (cached) | 3s | 0ms | Instant |

---

## Watch Points

### Critical Issues to Avoid

#### 1. Using `get_ws` Instead of `get_ws_prefer_user`

**This is the #1 cause of 500 errors in production!**

```python
# WRONG - Uses Service Principal auth (limited permissions)
@router.get("/endpoint")
async def endpoint(ws=Depends(get_ws)):
    ...

# CORRECT - Uses OBO auth (user's permissions)
@router.get("/endpoint")
async def endpoint(ws=Depends(get_ws_prefer_user)):
    ...
```

**Why:** Service Principal doesn't have system table access by default. OBO uses the logged-in user's permissions.

#### 2. Result State Casing

```sql
-- WRONG - Won't match any records!
WHERE result_state = 'SUCCESS'

-- CORRECT - System tables use SUCCEEDED
WHERE UPPER(result_state) = 'SUCCEEDED'
```

**Why:** System tables store `SUCCEEDED`, not `SUCCESS`.

#### 3. Inconsistent Query Keys

```typescript
// WRONG - Different keys = cache misses
useQuery({ queryKey: ['user'] })
useQuery({ queryKey: ['current-user'] })

// CORRECT - Use centralized factory
useQuery({ queryKey: queryKeys.user.current() })
```

#### 4. Missing Workspace Filter

```python
# WRONG - No multi-workspace support
@router.get("/data")
async def get_data():
    ...

# CORRECT - Support workspace filtering
@router.get("/data")
async def get_data(workspace_id: str | None = None):
    # Apply workspace_id filter to queries
```

#### 5. Blocking Cache Warm-up

```python
# WRONG - Blocks app startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    await warm_up_caches(app)  # Blocking!
    yield

# CORRECT - Background task
@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(warm_up_caches(app))  # Non-blocking
    yield
```

### Checklists

#### Adding New Backend Endpoints

- [ ] Use `get_ws_prefer_user` for system table queries
- [ ] Add `workspace_id: str | None = None` parameter
- [ ] Use `UPPER()` for result_state comparisons
- [ ] Add response caching for slow queries (>5s)
- [ ] Add pagination for large result sets

#### Adding New UI Pages

- [ ] Use standardized `queryKeys` for queries
- [ ] Choose appropriate `queryPresets`
- [ ] Support global filter context (`useFilters`)
- [ ] Handle loading and error states
- [ ] Add to sidebar navigation

---

## Testing

### Running Tests

```bash
# All tests
pytest tests/

# Specific test file
pytest tests/test_health_metrics.py

# With coverage
pytest --cov=job_monitor tests/

# Verbose output
pytest -v tests/
```

### Writing Tests

```python
# tests/test_my_feature.py
import pytest
from fastapi.testclient import TestClient
from job_monitor.backend.app import app

client = TestClient(app)

def test_my_endpoint():
    response = client.get("/api/my-feature")
    assert response.status_code == 200
    data = response.json()
    assert "expected_field" in data
```

---

## Deployment

### Targets

| Target | Profile | Warehouse | App URL |
|--------|---------|-----------|---------|
| `e2` | DEFAULT | `06c1adfd3dbdacde` | https://job-monitor-1444828305810485.aws.databricksapps.com |
| `prod` | DEMO WEST | `75fd8278393d07eb` | https://job-monitor-2556758628403379.aws.databricksapps.com |
| `dev` | LPT_FREE_EDITION | `58d41113cb262dce` | https://job-monitor-3704140105640043.aws.databricksapps.com |

### Deploy Commands

Use the `deploy.sh` script:

```bash
./deploy.sh e2    # E2 workspace
./deploy.sh prod  # DEMO WEST
./deploy.sh dev   # Development
```

### Manual Deployment

```bash
# Build frontend
cd job_monitor/ui && npm run build && cd ../..

# Copy target-specific configs
cp databricks.e2.yml databricks.yml
cp app.e2.yaml app.yaml

# Deploy bundle
databricks bundle deploy -t e2

# Enable OBO (required after first deploy)
databricks apps update job-monitor --json '{"user_api_scopes": ["sql"]}' -p DEFAULT
```

### Verifying Deployment

```bash
# Check app status
databricks apps get job-monitor -p DEFAULT

# View logs
open https://YOUR_APP_URL/logz

# Test API
curl https://YOUR_APP_URL/api/me
curl https://YOUR_APP_URL/api/health-metrics/summary
```

---

## Configuration

### config.yaml

```yaml
cache:
  catalog: "main"
  schema: "job_monitor_cache"
  refresh_cron: "0 */15 * * * ?"
  enabled: true

mock_data:
  enabled: false
  auto_fallback: true

tags:
  sla: "sla_minutes"
  team: "team"
  owner: "owner"
```

### Environment Variable Overrides

| Config Key | Environment Variable |
|------------|---------------------|
| `cache.catalog` | `CACHE_CATALOG` |
| `cache.schema` | `CACHE_SCHEMA` |
| `cache.enabled` | `USE_CACHE` |
| `mock_data.enabled` | `USE_MOCK_DATA` |
| `warehouse_id` | `WAREHOUSE_ID` |

---

## OBO Authentication

### How It Works

1. `user_api_scopes: ["sql"]` in app.yaml requests SQL permission
2. User sees OAuth consent on first access
3. Platform passes user token via `gap-auth` response header
4. App uses user's permissions for system table queries

### Enabling OBO

```yaml
# app.yaml
user_api_scopes:
  - sql
```

```bash
# CRITICAL: Run after app creation/update
databricks apps update job-monitor --json '{"user_api_scopes": ["sql"]}' -p YOUR_PROFILE
```

### Verifying OBO

```bash
databricks apps get job-monitor -p YOUR_PROFILE
# Check for: "effective_user_api_scopes": ["sql"]
```

---

## Troubleshooting

### Common Issues

**API returning 500 errors**
1. Check router uses `get_ws_prefer_user` (not `get_ws`)
2. Verify OBO is enabled (`effective_user_api_scopes` includes `sql`)
3. Check `WAREHOUSE_ID` matches target workspace

**Dashboard shows 0 values**
1. Check cache status: `curl https://APP_URL/api/cache/status`
2. Verify result_state uses `SUCCEEDED` (not `SUCCESS`)
3. Check logs for query errors

**OBO not working**
1. Verify `user_api_scopes: ["sql"]` in app.yaml
2. Run CLI update command
3. Clear browser cache, re-authenticate

### Logs

- **Local**: Terminal with `LOG_LEVEL=DEBUG`
- **Deployed**: `https://YOUR_APP_URL/logz`

---

## Contributing

1. Create feature branch from `main`
2. Make changes with tests
3. Build frontend: `cd job_monitor/ui && npm run build`
4. Run tests: `pytest tests/`
5. Deploy to dev for testing
6. Create PR with description

### Commit Message Format

```
feat: add wildcard filtering for job names
fix: correct result_state casing in queries
perf: add batch endpoint for job history
docs: update developer guide
```

### Version Tagging

```bash
git tag -a v1.X.0 -m "Release notes..."
git push origin v1.X.0
```
