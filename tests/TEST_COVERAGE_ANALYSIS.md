# Test Coverage Analysis Report

**Date**: 2026-02-27
**Current Coverage**: ~0% unit tests, ~40% E2E coverage

## Executive Summary

The Job Monitor application has **NO unit tests** for either the backend (Python/FastAPI) or frontend (React/TypeScript). The only automated tests are:
- E2E browser tests using Puppeteer (partial coverage)
- Load tests for performance monitoring

This represents a **critical gap** that needs immediate attention for production readiness.

---

## Current Test Inventory

### Existing Tests

| Test File | Type | Coverage | Notes |
|-----------|------|----------|-------|
| `load-test.js` | Performance | 9 API endpoints | Tests response times, cache hits |
| `alerts-page-test.js` | E2E | Alerts page only | Puppeteer-based UI test |
| `comprehensive-ui-test.js` | E2E | 5 pages | UI interaction tests |
| `quick-perf-test.sh` | Performance | Quick smoke test | Bash script |

### What's Missing

| Category | Missing Tests | Impact |
|----------|---------------|--------|
| Backend Unit Tests | ALL | Critical |
| Frontend Unit Tests | ALL | Critical |
| Integration Tests | ALL | High |
| API Contract Tests | ALL | High |
| Component Tests | ALL | Medium |

---

## Backend Coverage Gaps

### 1. Routers (Critical Priority)

Each router needs comprehensive unit tests:

| Router | Functions | Priority | Estimated Tests |
|--------|-----------|----------|-----------------|
| `health_metrics.py` | 4 | P1 | 20+ |
| `alerts.py` | 8 | P1 | 30+ |
| `cost.py` | 5 | P1 | 25+ |
| `historical.py` | 3 | P2 | 15+ |
| `jobs_api.py` | 3 | P2 | 15+ |
| `jobs.py` | 2 | P2 | 10+ |
| `cluster_metrics.py` | 2 | P2 | 10+ |
| `filters.py` | 5 | P2 | 20+ |
| `auth.py` | 2 | P2 | 10+ |
| `billing.py` | 1 | P3 | 5+ |
| `health.py` | 1 | P3 | 5+ |
| `job_tags.py` | 3 | P3 | 15+ |
| `pipeline.py` | 3 | P3 | 15+ |
| `reports.py` | 4 | P3 | 20+ |
| `workspaces.py` | 2 | P2 | 10+ |

### 2. Core Modules

| Module | Functions | Priority | Tests Needed |
|--------|-----------|----------|--------------|
| `cache.py` | 4 | P1 | 15+ |
| `response_cache.py` | 3 | P1 | 10+ |
| `mock_data.py` | 6 | P2 | 20+ |
| `config.py` | 2 | P2 | 8+ |
| `core.py` | 3 | P2 | 10+ |
| `models.py` | 15+ | P2 | 30+ |
| `scheduler.py` | 3 | P3 | 10+ |

### 3. Issues Identified in Backend Code

#### Issue 1: SQL Injection Vulnerability
**Files**: `alerts.py`, `cost.py`, `health_metrics.py`, `historical.py`
```python
# VULNERABLE: String interpolation in SQL
workspace_filter = f"AND workspace_id = '{workspace_id}'"
```
**Solution**: Use parameterized queries or SQL escaping

#### Issue 2: No Input Validation
**Files**: Multiple routers
```python
# No validation on workspace_id format
workspace_id: Annotated[str | None, Query(...)] = None
```
**Solution**: Add regex validation, length limits

#### Issue 3: Missing Error Handling
**Files**: `historical.py`, `workspaces.py`
```python
# No try/catch around SQL execution
rows = await _execute_query(ws, settings.warehouse_id, query)
```
**Solution**: Add proper exception handling

#### Issue 4: Hard-coded Values
**Files**: Multiple routers
```python
wait_timeout="50s"  # Hard-coded timeout
LIMIT 500  # Hard-coded limit
```
**Solution**: Move to configuration

---

## Frontend Coverage Gaps

### 1. Components (29 custom components)

| Component | Complexity | Priority | Tests Needed |
|-----------|------------|----------|--------------|
| `job-health-table.tsx` | High | P1 | 15+ |
| `alert-table.tsx` | High | P1 | 12+ |
| `global-filter-bar.tsx` | High | P1 | 15+ |
| `filter-presets.tsx` | Medium | P1 | 10+ |
| `job-pattern-input.tsx` | Medium | P1 | 8+ |
| `historical-chart.tsx` | Medium | P2 | 8+ |
| `duration-chart.tsx` | Medium | P2 | 8+ |
| `sidebar.tsx` | Medium | P2 | 6+ |
| `alert-card.tsx` | Low | P2 | 5+ |
| `alert-badge.tsx` | Low | P3 | 3+ |
| `priority-badge.tsx` | Low | P3 | 3+ |
| `status-indicator.tsx` | Low | P3 | 3+ |
| Other components | Low | P3 | ~30 |

### 2. Utility Libraries

| Library | Functions | Priority | Tests Needed |
|---------|-----------|----------|--------------|
| `filter-utils.ts` | 5 | P1 | 15+ |
| `alert-utils.ts` | 6 | P1 | 18+ |
| `health-utils.ts` | 4 | P2 | 12+ |
| `cost-utils.ts` | 3 | P2 | 9+ |
| `api.ts` | 5 | P2 | 15+ |
| `filter-context.tsx` | 4 | P2 | 12+ |
| `query-config.ts` | 2 | P3 | 6+ |

### 3. Issues Identified in Frontend Code

#### Issue 1: No Error Boundaries
**Files**: All route components
**Impact**: Uncaught errors crash the entire app
**Solution**: Add React Error Boundaries

#### Issue 2: Missing Loading States
**Files**: Some components
**Impact**: Poor UX during data loading
**Solution**: Consistent loading state handling

#### Issue 3: No Memoization on Expensive Renders
**Files**: `job-health-table.tsx`, `alert-table.tsx`
**Impact**: Performance degradation on large datasets
**Solution**: Use React.memo() and useMemo() strategically

---

## Proposed Test Strategy

### Phase 1: Critical Path (Week 1-2)

#### Backend Unit Tests
```
tests/
├── backend/
│   ├── conftest.py              # Fixtures and mocks
│   ├── test_health_metrics.py   # Health metrics router
│   ├── test_alerts.py           # Alerts router
│   ├── test_cost.py             # Cost router
│   ├── test_cache.py            # Cache module
│   └── test_response_cache.py   # Response cache
```

**Setup Commands**:
```bash
pip install pytest pytest-asyncio pytest-cov httpx
```

**Example Test Structure**:
```python
# tests/backend/test_health_metrics.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
from job_monitor.backend.app import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def mock_ws():
    """Mock WorkspaceClient"""
    with patch('job_monitor.backend.core.get_ws_prefer_user') as mock:
        ws = Mock()
        mock.return_value = ws
        yield ws

class TestHealthMetrics:
    def test_get_health_metrics_success(self, client, mock_ws):
        """Test successful health metrics retrieval"""
        # Setup mock response
        mock_ws.statement_execution.execute_statement.return_value = Mock(
            status=Mock(state='SUCCEEDED'),
            result=Mock(data_array=[...])
        )

        response = client.get("/api/health-metrics?days=7")
        assert response.status_code == 200
        data = response.json()
        assert "jobs" in data

    def test_get_health_metrics_invalid_days(self, client):
        """Test validation for days parameter"""
        response = client.get("/api/health-metrics?days=15")
        assert response.status_code == 422

    def test_get_health_metrics_with_workspace_filter(self, client, mock_ws):
        """Test workspace filtering"""
        response = client.get("/api/health-metrics?days=7&workspace_id=12345")
        assert response.status_code == 200
```

### Phase 2: Extended Coverage (Week 3-4)

#### Frontend Unit Tests

**Setup**:
```bash
cd job_monitor/ui
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

**Vitest Configuration** (`vitest.config.ts`):
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

**Example Component Test**:
```typescript
// components/__tests__/priority-badge.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PriorityBadge } from '../priority-badge'

describe('PriorityBadge', () => {
  it('renders P1 badge with correct styling', () => {
    render(<PriorityBadge priority="P1" />)
    const badge = screen.getByText('P1')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-red-500')
  })

  it('renders null for non-priority values', () => {
    const { container } = render(<PriorityBadge priority={null} />)
    expect(container.firstChild).toBeNull()
  })
})
```

**Example Utility Test**:
```typescript
// lib/__tests__/filter-utils.test.ts
import { describe, it, expect } from 'vitest'
import { matchesJobPatterns, getDaysFromRange } from '../filter-utils'

describe('matchesJobPatterns', () => {
  it('matches exact pattern', () => {
    expect(matchesJobPatterns('ETL-daily', ['ETL-daily'])).toBe(true)
  })

  it('matches wildcard prefix', () => {
    expect(matchesJobPatterns('ETL-daily-v2', ['ETL-*'])).toBe(true)
  })

  it('matches wildcard suffix', () => {
    expect(matchesJobPatterns('prod-ETL-daily', ['*-daily'])).toBe(true)
  })

  it('returns true when no patterns specified', () => {
    expect(matchesJobPatterns('any-job', [])).toBe(true)
  })
})
```

### Phase 3: Integration Tests (Week 5-6)

Create API integration tests that test full request/response cycles:

```python
# tests/integration/test_api_integration.py
import pytest
from httpx import AsyncClient
from job_monitor.backend.app import app

@pytest.mark.asyncio
async def test_dashboard_data_flow():
    """Test that dashboard can load all required data"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Get user info
        user_resp = await client.get("/api/me")
        assert user_resp.status_code in [200, 503]  # 503 if no auth

        # Get health metrics
        health_resp = await client.get("/api/health-metrics?days=7")

        # Get alerts
        alerts_resp = await client.get("/api/alerts")

        # Verify data consistency
        if health_resp.status_code == 200:
            health_data = health_resp.json()
            assert "jobs" in health_data
            assert "total_count" in health_data
```

---

## Test Coverage Targets

| Area | Current | Target | Gap |
|------|---------|--------|-----|
| Backend Unit | 0% | 80% | 80% |
| Frontend Unit | 0% | 70% | 70% |
| Integration | 0% | 60% | 60% |
| E2E | ~40% | 80% | 40% |
| **Overall** | **~10%** | **75%** | **65%** |

---

## Implementation Priority

### Week 1: Foundation
- [ ] Set up pytest infrastructure
- [ ] Set up vitest infrastructure
- [ ] Create mock fixtures for Databricks SDK
- [ ] Write tests for `cache.py` and `response_cache.py`

### Week 2: Critical Routers
- [ ] Test `health_metrics.py` (most used endpoint)
- [ ] Test `alerts.py` (complex logic)
- [ ] Test `cost.py` (financial data)

### Week 3: Frontend Foundation
- [ ] Test `filter-utils.ts`
- [ ] Test `alert-utils.ts`
- [ ] Test `filter-context.tsx`

### Week 4: Components
- [ ] Test `priority-badge.tsx`
- [ ] Test `status-indicator.tsx`
- [ ] Test `global-filter-bar.tsx`

### Week 5-6: Integration & E2E
- [ ] API integration tests
- [ ] Expand E2E coverage
- [ ] Add visual regression tests

---

## Tooling Recommendations

### Backend
- **pytest**: Test framework
- **pytest-asyncio**: Async test support
- **pytest-cov**: Coverage reporting
- **httpx**: Async HTTP client for testing
- **factory-boy**: Test data factories
- **respx**: HTTP mock library

### Frontend
- **vitest**: Fast unit test runner
- **@testing-library/react**: React component testing
- **msw**: API mocking
- **@storybook/test**: Component testing via Storybook

### CI/CD
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -e ".[test]"
      - run: pytest --cov=job_monitor --cov-report=xml

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd job_monitor/ui && npm ci && npm test
```

---

## Security Issues to Test

1. **SQL Injection**: All endpoints accepting string parameters
2. **XSS**: All user input rendered in UI
3. **CSRF**: All mutation endpoints
4. **Auth Bypass**: All protected endpoints
5. **Rate Limiting**: All public endpoints

---

## Next Steps

1. **Immediate**: Create `tests/backend/conftest.py` with mock fixtures
2. **This Week**: Write first 50 backend unit tests
3. **Next Week**: Set up vitest and write first 30 frontend tests
4. **Month End**: Achieve 50% overall coverage

---

## Appendix: File-by-File Test Requirements

### Backend Files

| File | Lines | Functions | Tests Needed |
|------|-------|-----------|--------------|
| `health_metrics.py` | ~550 | 4 public, 6 private | 25 |
| `alerts.py` | ~900 | 5 public, 8 private | 35 |
| `cost.py` | ~500 | 3 public, 4 private | 20 |
| `historical.py` | ~330 | 3 public, 2 private | 15 |
| `filters.py` | ~200 | 5 public | 15 |
| `cache.py` | ~150 | 4 public | 12 |
| `response_cache.py` | ~100 | 3 public | 8 |
| `mock_data.py` | ~300 | 6 public | 18 |
| Other routers | ~1500 | ~25 public | 75 |
| **Total Backend** | **~4500** | **~55** | **~225** |

### Frontend Files

| File | Lines | Exports | Tests Needed |
|------|-------|---------|--------------|
| `filter-utils.ts` | ~100 | 5 | 15 |
| `alert-utils.ts` | ~150 | 6 | 18 |
| `health-utils.ts` | ~80 | 4 | 12 |
| `cost-utils.ts` | ~60 | 3 | 9 |
| `api.ts` | ~100 | 5 | 15 |
| Components (29) | ~3000 | 29 | ~120 |
| **Total Frontend** | **~3500** | **~52** | **~190** |

**Grand Total Tests Needed**: ~415 unit tests + ~50 integration tests + ~20 E2E tests = **~485 tests**
