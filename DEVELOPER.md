# Developer Guide

This document provides detailed information for developers working on the Job Monitor project.

## Project Structure

```
databricks_job_monitoring/
├── job_monitor/
│   ├── backend/               # FastAPI backend
│   │   ├── app.py            # Main FastAPI application
│   │   ├── cache.py          # Cache layer for pre-aggregated metrics
│   │   ├── config.py         # Configuration loader (YAML + env vars)
│   │   ├── core.py           # Core utilities (SQL client, auth)
│   │   ├── mock_data.py      # Mock data generators for demos
│   │   ├── models.py         # Pydantic models
│   │   ├── scheduler.py      # APScheduler for background tasks
│   │   └── routers/          # API route handlers
│   │       ├── alerts.py     # Alert generation and management
│   │       ├── cost.py       # Cost analysis endpoints
│   │       ├── health_metrics.py  # Job health dashboard
│   │       ├── jobs.py       # Job listing via Jobs API
│   │       ├── pipeline.py   # Pipeline integrity tracking
│   │       └── ...
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

## Backend Development

### Adding a New API Endpoint

1. **Create or edit a router** in `job_monitor/backend/routers/`:

```python
# job_monitor/backend/routers/my_feature.py
from fastapi import APIRouter, Depends
from ..core import get_sql_client
from ..models import MyResponse

router = APIRouter(prefix="/api/my-feature", tags=["my-feature"])

@router.get("", response_model=MyResponse)
async def get_my_feature(sql_client=Depends(get_sql_client)):
    # Execute query using sql_client
    result = sql_client.execute("SELECT ...")
    return MyResponse(data=result)
```

2. **Register the router** in `job_monitor/backend/app.py`:

```python
from .routers import my_feature
app.include_router(my_feature.router)
```

3. **Add Pydantic models** in `job_monitor/backend/models.py` for request/response validation.

### SQL Client Usage

The `get_sql_client()` dependency provides a configured SQL executor:

```python
from ..core import get_sql_client

@router.get("/data")
async def get_data(sql_client=Depends(get_sql_client)):
    # Execute returns list of dicts
    rows = sql_client.execute("""
        SELECT job_id, name, result_state
        FROM system.lakeflow.job_run_timeline
        WHERE workspace_id = current_workspace_id()
        LIMIT 100
    """)
    return {"jobs": rows}
```

### Cache Layer

The cache layer (`cache.py`) provides pre-aggregated metrics for fast dashboard loading.

```python
from ..cache import CacheManager

cache = CacheManager()

# Check if cache is available and fresh
status = await cache.get_status()
if status["available"] and status["fresh"]:
    data = await cache.get_job_health()
else:
    # Fall back to live query
    data = await query_live_data()
```

### Mock Data

When system tables aren't accessible, the app falls back to mock data (`mock_data.py`):

```python
from ..mock_data import MockDataGenerator

mock = MockDataGenerator()
jobs = mock.generate_job_health(count=100)
alerts = mock.generate_alerts()
```

## Frontend Development

### Tech Stack

- **React 18** - UI framework
- **TanStack Router** - File-based routing
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **Recharts** - Charts and visualizations

### Project Structure

```
ui/
├── components/           # Reusable components
│   ├── ui/              # shadcn/ui primitives
│   ├── job-health-table.tsx
│   ├── cost-chart.tsx
│   └── ...
├── lib/
│   ├── api.ts           # API client functions
│   ├── utils.ts         # Utility functions
│   └── hooks/           # Custom React hooks
├── routes/
│   ├── __root.tsx       # Root layout
│   ├── index.tsx        # Dashboard (/)
│   └── ...
└── main.tsx             # App entry point
```

### Adding a New Page

1. Create a route file in `ui/routes/`:

```tsx
// ui/routes/my-page.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchMyData } from '../lib/api'

export const Route = createFileRoute('/my-page')({
  component: MyPage,
})

function MyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-data'],
    queryFn: fetchMyData,
  })

  if (isLoading) return <div>Loading...</div>
  return <div>{/* render data */}</div>
}
```

2. Run `npm run dev` - TanStack Router auto-generates `routeTree.gen.ts`.

### API Client

Add API functions in `ui/lib/api.ts`:

```typescript
export async function fetchMyData(): Promise<MyDataType> {
  const response = await fetch('/api/my-feature')
  if (!response.ok) throw new Error('Failed to fetch')
  return response.json()
}
```

### Building for Production

```bash
cd job_monitor/ui
npm run build
```

This creates optimized assets in `ui/dist/` which the backend serves statically.

### Client-Side Caching Strategy

The frontend uses TanStack Query with a **tiered caching strategy** to optimize performance and reduce unnecessary API calls. Configuration is centralized in `ui/lib/query-config.ts`.

#### Cache Tiers

| Preset | staleTime | gcTime | Use Case |
|--------|-----------|--------|----------|
| `static` | Infinity | 30 min | Historical data that never changes |
| `semiLive` | 5 min | 15 min | Job health, costs (matches system table refresh) |
| `live` | 1 min | 5 min | Alerts, running jobs (needs freshness) |
| `session` | 30 min | 60 min | User info, workspace config |

#### Using Presets

```tsx
import { useQuery } from '@tanstack/react-query'
import { queryPresets, queryKeys } from '@/lib/query-config'

// Semi-live data (job health, costs)
const { data } = useQuery({
  queryKey: queryKeys.healthMetrics.list(7),
  queryFn: fetchHealthMetrics,
  ...queryPresets.semiLive,
})

// Live data (alerts)
const { data: alerts } = useQuery({
  queryKey: queryKeys.alerts.all,
  queryFn: fetchAlerts,
  ...queryPresets.live,
})

// Static data (historical)
const { data: history } = useQuery({
  queryKey: queryKeys.historical.runs(jobId, startDate, endDate),
  queryFn: fetchHistoricalRuns,
  ...queryPresets.static,
})
```

#### Query Key Factories

Always use `queryKeys` factories to ensure cache hits across components:

```tsx
// Good - uses shared key factory
queryKey: queryKeys.alerts.all

// Bad - different components might use different keys
queryKey: ['alerts']
queryKey: ['alerts', {}]  // Different key = cache miss!
```

#### SPA Navigation

The sidebar uses TanStack Router `<Link>` for client-side navigation, which preserves the query cache between pages:

```tsx
import { Link } from '@tanstack/react-router'

// SPA navigation - cache preserved
<Link to="/alerts">Alerts</Link>

// Full page reload - cache lost (avoid!)
<a href="/alerts">Alerts</a>
```

#### Performance Impact

With proper caching:
- **Initial load**: ~30-60s (system table queries)
- **Navigation between pages**: **Instant** (data served from cache)
- **Return to previous page**: **Instant** (cached within gcTime window)
- **Window focus after idle**: Background refetch (if staleTime exceeded)

## Testing

### Running Tests

```bash
# All tests
pytest tests/

# Specific test file
pytest tests/test_health_metrics.py

# With coverage
pytest --cov=job_monitor tests/
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

## Deployment

### Targets

| Target | Profile | Warehouse | App URL |
|--------|---------|-----------|---------|
| `e2` | DEFAULT | `06c1adfd3dbdacde` | https://job-monitor-1444828305810485.aws.databricksapps.com |
| `prod` | DEMO WEST | `75fd8278393d07eb` | https://job-monitor-2556758628403379.aws.databricksapps.com |
| `dev` | LPT_FREE_EDITION | `58d41113cb262dce` | https://job-monitor-3704140105640043.aws.databricksapps.com |

### Configuration Files Per Target

Each target has its own configuration files:

| Target | Bundle Config | App Config |
|--------|--------------|------------|
| `e2` | `databricks.e2.yml` | `app.e2.yaml` |
| `prod` | `databricks.prod.yml` | `app.prod.yaml` |
| `dev` | `databricks.dev.yml` | `app.yaml` |

**Important**: The `app.*.yaml` files contain target-specific `WAREHOUSE_ID` and other environment variables.

### Deploy Commands

Use the `deploy.sh` script for simplified deployment:

```bash
# Deploy to E2 (default)
./deploy.sh e2

# Deploy to DEMO WEST (production)
./deploy.sh prod

# Deploy to dev workspace
./deploy.sh dev
```

The script handles:
1. Building frontend (if needed)
2. Swapping `databricks.yml` and `app.yaml` to target-specific versions
3. Running `databricks bundle deploy`
4. Running `databricks apps deploy`
5. Enabling OBO authentication (for non-dev targets)
6. Restoring original config files

### Manual Deployment

If you need manual control:

```bash
# Build frontend
cd job_monitor/ui && npm run build && cd ../..

# Copy target-specific configs
cp databricks.e2.yml databricks.yml
cp app.e2.yaml app.yaml

# Deploy bundle
databricks bundle deploy -t e2

# Deploy app
databricks apps deploy job-monitor \
  --source-code-path /Workspace/Users/YOUR_EMAIL/.bundle/job-monitor/e2/files \
  -p DEFAULT

# Enable OBO (required after first deploy)
databricks apps update job-monitor --json '{"user_api_scopes": ["sql"]}' -p DEFAULT
```

### Verifying Deployment

```bash
# Check app status
databricks apps get job-monitor -p DEFAULT

# View logs
open https://YOUR_APP_URL/logz

# Test API endpoints
curl https://YOUR_APP_URL/api/me
curl https://YOUR_APP_URL/api/health-metrics
curl https://YOUR_APP_URL/api/alerts
```

### Troubleshooting Deployment

**API returning 500 errors**:
1. Check warehouse ID matches the target workspace
2. Verify `app.yaml` was swapped correctly (check `WAREHOUSE_ID` value)
3. Ensure OBO is enabled (`effective_user_api_scopes` includes `sql`)

**OBO not working**:
1. Verify `user_api_scopes: ["sql"]` in app.yaml
2. Run `databricks apps update` command
3. Check `effective_user_api_scopes` in `databricks apps get` output

## Configuration

### config.yaml

Central configuration in `job_monitor/config.yaml`:

```yaml
cache:
  catalog: "job_monitor"
  schema: "cache"
  refresh_cron: "0 */10 * * * ?"
  enabled: true

mock_data:
  enabled: false
  auto_fallback: true  # Use mock when queries fail

warehouse_id: ""  # Usually set via env var

tags:
  sla: "sla_minutes"
  team: "team"
  owner: "owner"
```

### Environment Variable Overrides

Environment variables override `config.yaml`. Naming convention: uppercase with underscores.

| Config Key | Environment Variable |
|------------|---------------------|
| `cache.catalog` | `CACHE_CATALOG` |
| `cache.schema` | `CACHE_SCHEMA` |
| `cache.enabled` | `USE_CACHE` |
| `mock_data.enabled` | `USE_MOCK_DATA` |
| `warehouse_id` | `WAREHOUSE_ID` |

## OBO Authentication

On-Behalf-Of (OBO) authentication forwards user credentials for SQL queries.

### How It Works

1. `user_api_scopes: ["sql"]` in app.yaml requests SQL permission
2. User sees OAuth consent on first access
3. Platform passes user token via `gap-auth` response header
4. App uses user's permissions for system table queries

### Enabling OBO

```bash
# In app.yaml
user_api_scopes:
  - sql

# CRITICAL: Also run this after app creation
databricks apps update job-monitor --json '{"user_api_scopes": ["sql"]}' -p DEFAULT
```

### Using OBO in Routers

**CRITICAL**: All routers querying system tables must use `get_ws_prefer_user`:

```python
# CORRECT - Uses OBO (user's permissions)
from ..core import get_ws_prefer_user

@router.get("/data")
async def get_data(ws=Depends(get_ws_prefer_user)):
    result = ws.statement_execution.execute_statement(...)

# WRONG - Uses Service Principal (limited permissions)
from ..core import get_ws

@router.get("/data")
async def get_data(ws=Depends(get_ws)):  # Will fail on system tables!
    ...
```

### Debugging OBO

```bash
# Check effective scopes
databricks apps get job-monitor -p DEFAULT | grep -A5 scopes

# Check logs for authenticated user
# Look for: "OBO user: user@example.com"
```

## Troubleshooting

### Common Issues

**Backend won't start**
- Check `WAREHOUSE_ID` is set
- Verify Databricks CLI auth: `databricks auth describe -p YOUR_PROFILE`

**Frontend build fails**
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check Node version: `node --version` (need 18+)

**Queries return empty**
- Enable mock data for development: `USE_MOCK_DATA=true`
- Check warehouse is running
- Verify user has system table access

**OBO not working**
- Ensure `user_api_scopes: ["sql"]` in app.yaml
- Run CLI update command (required after app creation)
- Check `effective_user_api_scopes` in `databricks apps get` output
- Clear browser cache and re-authenticate

**API returning 500 errors after deployment**
- **CRITICAL**: Check if router uses `get_ws` vs `get_ws_prefer_user`
  - `get_ws` = Service Principal auth (limited permissions)
  - `get_ws_prefer_user` = OBO auth (user's permissions)
- All routers querying system tables MUST use `get_ws_prefer_user`
- Verify correct `WAREHOUSE_ID` in `app.*.yaml` for target workspace:
  - E2: `06c1adfd3dbdacde`
  - DEMO WEST: `75fd8278393d07eb`
  - Dev: `58d41113cb262dce`
- Check `deploy.sh` swapped the correct app config file

### Logs

**Local**: Check terminal output with `LOG_LEVEL=DEBUG`

**Deployed**: Visit `https://YOUR_APP_URL/logz`

## Contributing

1. Create a feature branch from `main`
2. Make changes with tests
3. Build frontend: `cd job_monitor/ui && npm run build`
4. Run tests: `pytest tests/`
5. Deploy to dev target for testing
6. Create PR with description of changes
