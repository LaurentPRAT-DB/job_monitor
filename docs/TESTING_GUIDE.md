# Testing & Code Coverage Guide

A comprehensive guide to testing strategies, tooling, and best practices for full-stack applications with Python/FastAPI backend and React/TypeScript frontend.

---

## Table of Contents

1. [Overview](#overview)
2. [Backend Testing (Python/FastAPI)](#backend-testing-pythonfastapi)
3. [Frontend Testing (React/TypeScript)](#frontend-testing-reacttypescript)
4. [End-to-End Testing](#end-to-end-testing)
5. [Load & Performance Testing](#load--performance-testing)
6. [Coverage Reporting](#coverage-reporting)
7. [CI/CD Integration](#cicd-integration)
8. [Best Practices](#best-practices)

---

## Overview

### Testing Pyramid

```
          ┌───────────┐
          │    E2E    │  ← Slowest, most realistic
          │   Tests   │  ← 5-10% of tests
          └─────┬─────┘
            ┌───┴───┐
            │ Integ │  ← Integration tests
            │ Tests │  ← 20-30% of tests
            └───┬───┘
          ┌─────┴─────┐
          │   Unit    │  ← Fastest, most isolated
          │   Tests   │  ← 60-70% of tests
          └───────────┘
```

### Test Categories

| Type | Speed | Scope | Tools | When to Run |
|------|-------|-------|-------|-------------|
| Unit | Fast | Single function | pytest, vitest | Every commit |
| Integration | Medium | Multiple modules | TestClient, MSW | Every PR |
| E2E | Slow | Full application | Puppeteer, Chrome DevTools | Pre-deploy |
| Load | Slow | Performance | Custom scripts | Pre-release |

---

## Backend Testing (Python/FastAPI)

### Setup

**Dependencies** (add to `pyproject.toml`):

```toml
[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-asyncio>=0.21.0",
    "pytest-cov>=4.0",
    "httpx>=0.24.0",
    "respx>=0.20.0",  # HTTP mocking
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

### Directory Structure

```
tests/
├── __init__.py
├── backend/
│   ├── __init__.py
│   ├── conftest.py           # Shared fixtures
│   ├── test_health_metrics.py
│   ├── test_alerts.py
│   ├── test_cost.py
│   └── test_cache.py
├── integration/
│   ├── __init__.py
│   └── test_api_integration.py
└── reports/
    └── .gitkeep
```

### Fixtures (conftest.py)

Create reusable test fixtures for common dependencies:

```python
"""
Pytest configuration and fixtures for backend tests.
"""
import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timedelta
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def anyio_backend():
    """Use asyncio for async tests."""
    return "asyncio"


@pytest.fixture
def app():
    """Create FastAPI app instance for testing."""
    from myapp.backend.app import app
    app.state.workspace_client = Mock()
    return app


@pytest.fixture
def client(app):
    """Create test client for API requests."""
    from myapp.backend.core import get_ws_prefer_user, get_ws

    mock_ws = Mock()
    mock_ws.statement_execution = Mock()
    mock_ws.jobs = Mock()

    def override_get_ws_prefer_user():
        return mock_ws

    app.dependency_overrides[get_ws_prefer_user] = override_get_ws_prefer_user

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def mock_settings():
    """Mock settings with test values."""
    with patch('myapp.backend.config.get_settings') as mock:
        settings = Mock()
        settings.databricks_host = "https://test.databricks.com"
        settings.warehouse_id = "test-warehouse-123"
        settings.use_cache = False
        mock.return_value = settings
        yield settings


# Helper function for creating mock SQL results
def create_sql_result(columns: list[str], data: list[list]) -> Mock:
    """Create a mock SQL execution result."""
    from databricks.sdk.service.sql import StatementState

    result = Mock()
    result.status = Mock()
    result.status.state = StatementState.SUCCEEDED
    result.status.error = None

    col_mocks = [Mock(name=col) for col in columns]
    result.manifest = Mock()
    result.manifest.schema = Mock()
    result.manifest.schema.columns = col_mocks

    result.result = Mock()
    result.result.data_array = data

    return result


def create_sql_error_result(error_message: str) -> Mock:
    """Create a mock SQL execution error result."""
    from databricks.sdk.service.sql import StatementState

    result = Mock()
    result.status = Mock()
    result.status.state = StatementState.FAILED
    result.status.error = Mock()
    result.status.error.message = error_message
    result.result = None

    return result
```

### Writing Unit Tests

**Router Test Example:**

```python
"""Unit tests for health_metrics router."""
import pytest
from unittest.mock import patch


class TestHealthMetricsEndpoint:
    """Tests for GET /api/health-metrics."""

    def test_returns_200_with_mock_mode(self, client):
        """Test that endpoint returns mock data when enabled."""
        with patch('myapp.backend.routers.health_metrics.is_mock_mode', return_value=True):
            response = client.get("/api/health-metrics?days=7")
            assert response.status_code == 200
            data = response.json()
            assert "jobs" in data
            assert "window_days" in data
            assert data["window_days"] == 7

    def test_validates_days_parameter(self, client):
        """Test that days parameter must be 7 or 30."""
        with patch('myapp.backend.routers.health_metrics.is_mock_mode', return_value=True):
            # Valid values
            assert client.get("/api/health-metrics?days=7").status_code == 200
            assert client.get("/api/health-metrics?days=30").status_code == 200

            # Invalid values
            assert client.get("/api/health-metrics?days=15").status_code == 422
            assert client.get("/api/health-metrics?days=0").status_code == 422

    def test_response_structure(self, client):
        """Test response has correct structure."""
        with patch('myapp.backend.routers.health_metrics.is_mock_mode', return_value=True):
            response = client.get("/api/health-metrics?days=7")
            data = response.json()

            assert isinstance(data["jobs"], list)
            assert isinstance(data["total_count"], int)

            if data["jobs"]:
                job = data["jobs"][0]
                required_fields = ["job_id", "job_name", "success_rate"]
                for field in required_fields:
                    assert field in job, f"Missing field: {field}"


class TestBusinessLogic:
    """Tests for internal business logic functions."""

    def test_priority_sorting_order(self):
        """Test priorities are sorted P1 > P2 > P3 > None."""
        from myapp.backend.routers.health_metrics import _sort_by_priority
        from myapp.backend.models import JobHealthOut
        from datetime import datetime

        now = datetime.now()
        jobs = [
            JobHealthOut(job_id="1", job_name="healthy", priority=None, ...),
            JobHealthOut(job_id="2", job_name="p3", priority="P3", ...),
            JobHealthOut(job_id="3", job_name="p1", priority="P1", ...),
            JobHealthOut(job_id="4", job_name="p2", priority="P2", ...),
        ]

        sorted_jobs = _sort_by_priority(jobs)
        priorities = [j.priority for j in sorted_jobs]
        assert priorities == ["P1", "P2", "P3", None]
```

### Running Backend Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=myapp --cov-report=html --cov-report=term

# Run specific test file
pytest tests/backend/test_health_metrics.py

# Run specific test class
pytest tests/backend/test_health_metrics.py::TestHealthMetricsEndpoint

# Run with verbose output
pytest -v

# Run tests matching pattern
pytest -k "health" -v
```

---

## Frontend Testing (React/TypeScript)

### Setup

**Install dependencies:**

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

**Vitest Configuration** (`vitest.config.ts`):

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react() as any],  // Cast for version compatibility
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**/*.ts', 'components/**/*.tsx'],
      exclude: ['**/node_modules/**', '**/test/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

**Setup File** (`src/test/setup.ts`):

```typescript
import '@testing-library/jest-dom';

// Mock fetch globally
global.fetch = vi.fn();

// Reset mocks between tests
beforeEach(() => {
  vi.resetAllMocks();
});
```

### Directory Structure

```
job_monitor/ui/
├── lib/
│   ├── __tests__/
│   │   ├── filter-utils.test.ts
│   │   ├── alert-utils.test.ts
│   │   ├── health-utils.test.ts
│   │   └── api.test.ts
│   ├── filter-utils.ts
│   └── alert-utils.ts
├── components/
│   ├── __tests__/
│   │   ├── priority-badge.test.tsx
│   │   └── alert-card.test.tsx
│   └── priority-badge.tsx
├── src/test/
│   └── setup.ts
└── vitest.config.ts
```

### Writing Utility Tests

```typescript
/**
 * Tests for filter-utils.ts
 */
import { describe, it, expect } from 'vitest';
import {
  wildcardToRegex,
  matchesJobPatterns,
  validateWildcardPattern,
} from '../filter-utils';

describe('wildcardToRegex', () => {
  it('converts exact match pattern', () => {
    const regex = wildcardToRegex('ETL-daily');
    expect(regex.test('ETL-daily')).toBe(true);
    expect(regex.test('ETL-daily-v2')).toBe(false);
  });

  it('converts prefix wildcard pattern', () => {
    const regex = wildcardToRegex('ETL-*');
    expect(regex.test('ETL-daily')).toBe(true);
    expect(regex.test('ETL-weekly')).toBe(true);
    expect(regex.test('my-ETL-daily')).toBe(false);
  });

  it('is case insensitive', () => {
    const regex = wildcardToRegex('ETL-*');
    expect(regex.test('ETL-daily')).toBe(true);
    expect(regex.test('etl-daily')).toBe(true);
  });

  it('escapes special regex characters', () => {
    const regex = wildcardToRegex('job.name[1]');
    expect(regex.test('job.name[1]')).toBe(true);
    expect(regex.test('jobXname11')).toBe(false);
  });
});

describe('matchesJobPatterns', () => {
  it('returns true when patterns array is empty', () => {
    expect(matchesJobPatterns('any-job', [])).toBe(true);
  });

  it('matches any of multiple patterns', () => {
    const patterns = ['ETL-*', 'report-*'];
    expect(matchesJobPatterns('ETL-daily', patterns)).toBe(true);
    expect(matchesJobPatterns('report-weekly', patterns)).toBe(true);
    expect(matchesJobPatterns('job-123', patterns)).toBe(false);
  });
});

describe('validateWildcardPattern', () => {
  it('returns null for valid patterns', () => {
    expect(validateWildcardPattern('ETL-*')).toBeNull();
  });

  it('returns error for empty pattern', () => {
    expect(validateWildcardPattern('')).toBe('Pattern cannot be empty');
  });

  it('returns error for invalid characters', () => {
    expect(validateWildcardPattern('job<name')).toBe('Pattern contains invalid characters');
  });
});
```

### Writing Component Tests

```typescript
/**
 * Tests for PriorityBadge component
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PriorityBadge } from '../priority-badge';

describe('PriorityBadge', () => {
  it('renders P1 badge with correct styling', () => {
    render(<PriorityBadge priority="P1" />);
    const badge = screen.getByText('P1');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-red-500');
  });

  it('renders P2 badge with warning color', () => {
    render(<PriorityBadge priority="P2" />);
    const badge = screen.getByText('P2');
    expect(badge).toHaveClass('bg-orange-500');
  });

  it('renders null for undefined priority', () => {
    const { container } = render(<PriorityBadge priority={null} />);
    expect(container.firstChild).toBeNull();
  });
});
```

### Running Frontend Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npm test -- filter-utils.test.ts

# Run tests matching pattern
npm test -- --grep "wildcard"
```

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## End-to-End Testing

### Chrome DevTools Protocol (Puppeteer Alternative)

For E2E tests that interact with a running browser:

**Setup:**

```bash
cd tests
npm init -y
npm install chrome-remote-interface
```

**Browser Test Script:**

```javascript
/**
 * E2E Test using Chrome DevTools Protocol
 *
 * Usage:
 *   1. Start Chrome with remote debugging:
 *      /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *   2. Log in to the app manually
 *   3. Run: node tests/comprehensive-ui-test.js
 */

const CDP = require('chrome-remote-interface');

const BASE_URL = 'https://your-app.com';

async function runTests() {
  let client;
  try {
    client = await CDP();
    const { Page, Runtime, Network } = client;

    await Network.enable();
    await Page.enable();

    // Navigate to page
    await Page.navigate({ url: `${BASE_URL}/dashboard` });
    await Page.loadEventFired();

    // Wait for element
    const result = await Runtime.evaluate({
      expression: `document.querySelector('[data-testid="refresh-btn"]') !== null`,
      awaitPromise: false,
    });

    console.log('Refresh button found:', result.result.value);

    // Click element
    await Runtime.evaluate({
      expression: `document.querySelector('[data-testid="refresh-btn"]').click()`,
    });

    // Verify network request
    Network.responseReceived((params) => {
      if (params.response.url.includes('/api/health-metrics')) {
        console.log('API call made:', params.response.status);
      }
    });

  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    if (client) await client.close();
  }
}

runTests();
```

### Manual Test Checklist

For features difficult to automate, create a structured checklist:

```markdown
# Manual Test Checklist

## Pre-deployment Verification

### Dashboard Page
- [ ] Page loads without errors
- [ ] All metrics display correctly
- [ ] Refresh button triggers API call
- [ ] Time range filters work

### Job Health Page
- [ ] Table renders with data
- [ ] Sorting works on all columns
- [ ] Pagination controls function
- [ ] Row expansion shows details
- [ ] Filter presets load/save correctly

### Alerts Page
- [ ] Alert cards display properly
- [ ] Severity badges are colored correctly
- [ ] Acknowledge function works
- [ ] Category filters work

### Cross-browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
```

---

## Load & Performance Testing

### API Benchmark Script

```bash
#!/bin/bash
# api-benchmark.sh - Quick API performance check

BASE_URL="${1:-https://your-app.com}"
ITERATIONS="${2:-10}"

echo "=== API Benchmark ==="
echo "URL: $BASE_URL"
echo "Iterations: $ITERATIONS"
echo ""

endpoints=(
  "/api/me"
  "/api/alerts"
  "/api/health-metrics?days=7"
  "/api/costs/summary"
)

for endpoint in "${endpoints[@]}"; do
  echo "Testing: $endpoint"

  total_time=0
  for i in $(seq 1 $ITERATIONS); do
    time=$(curl -s -o /dev/null -w "%{time_total}" "${BASE_URL}${endpoint}")
    total_time=$(echo "$total_time + $time" | bc)
  done

  avg=$(echo "scale=3; $total_time / $ITERATIONS" | bc)
  echo "  Average: ${avg}s"
  echo ""
done
```

### Comprehensive Load Test

```javascript
/**
 * Load Test with Performance Metrics
 *
 * Measures:
 * - Response times (avg, p50, p95, p99)
 * - Cache hit rates
 * - Error rates
 * - Throughput
 */

const CDP = require('chrome-remote-interface');

// Benchmark thresholds
const BENCHMARKS = {
  responseTime: {
    fast: { p95_warn: 1000, p95_fail: 3000 },    // ms
    medium: { p95_warn: 5000, p95_fail: 15000 },
    slow: { p95_warn: 15000, p95_fail: 45000 },
  },
  cacheHitRate: {
    warn: 30,   // %
    target: 50,
    good: 70,
  },
  errorRate: {
    warn: 1,    // %
    fail: 5,
  },
};

// Metrics storage
const metrics = {
  apiCalls: {},
  errors: [],
  cacheHits: 0,
  cacheMisses: 0,
};

function recordApiCall(endpoint, duration, cached, error) {
  if (!metrics.apiCalls[endpoint]) {
    metrics.apiCalls[endpoint] = [];
  }
  metrics.apiCalls[endpoint].push({ duration, cached, error });

  if (cached) metrics.cacheHits++;
  else metrics.cacheMisses++;

  if (error) metrics.errors.push({ endpoint, error });
}

function calculatePercentile(values, percentile) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

function generateReport() {
  console.log('\n=== Load Test Report ===\n');

  for (const [endpoint, calls] of Object.entries(metrics.apiCalls)) {
    const durations = calls.map(c => c.duration);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p50 = calculatePercentile(durations, 50);
    const p95 = calculatePercentile(durations, 95);
    const p99 = calculatePercentile(durations, 99);

    console.log(`${endpoint}:`);
    console.log(`  Calls: ${calls.length}`);
    console.log(`  Avg: ${avg.toFixed(0)}ms`);
    console.log(`  P50: ${p50.toFixed(0)}ms`);
    console.log(`  P95: ${p95.toFixed(0)}ms`);
    console.log(`  P99: ${p99.toFixed(0)}ms`);
    console.log('');
  }

  const totalCalls = metrics.cacheHits + metrics.cacheMisses;
  const hitRate = (metrics.cacheHits / totalCalls * 100).toFixed(1);
  const errorRate = (metrics.errors.length / totalCalls * 100).toFixed(2);

  console.log('Overall Metrics:');
  console.log(`  Cache Hit Rate: ${hitRate}%`);
  console.log(`  Error Rate: ${errorRate}%`);
  console.log(`  Total Calls: ${totalCalls}`);
}

// Run the load test
// ... (implementation details)
```

---

## Coverage Reporting

### Backend Coverage

```bash
# Generate HTML report
pytest --cov=job_monitor --cov-report=html

# Generate XML for CI (Codecov, SonarQube)
pytest --cov=job_monitor --cov-report=xml

# View coverage in terminal
pytest --cov=job_monitor --cov-report=term-missing
```

**Coverage Configuration** (`.coveragerc` or `pyproject.toml`):

```toml
[tool.coverage.run]
source = ["job_monitor"]
omit = [
    "*/tests/*",
    "*/__pycache__/*",
    "*/migrations/*",
]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise AssertionError",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
]
```

### Frontend Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report
open coverage/index.html
```

### Coverage Targets

| Area | Target | Minimum |
|------|--------|---------|
| Backend Unit | 80% | 60% |
| Frontend Unit | 70% | 50% |
| Integration | 60% | 40% |
| Overall | 75% | 55% |

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -e ".[dev]"

      - name: Run tests with coverage
        run: |
          pytest --cov=job_monitor --cov-report=xml --cov-report=term

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage.xml
          flags: backend

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: job_monitor/ui/package-lock.json

      - name: Install dependencies
        run: |
          cd job_monitor/ui
          npm ci

      - name: Run tests with coverage
        run: |
          cd job_monitor/ui
          npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./job_monitor/ui/coverage/coverage-final.json
          flags: frontend

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-tests]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - name: Set up Chrome
        uses: browser-actions/setup-chrome@latest

      - name: Run E2E tests
        run: |
          # Start application
          # Run E2E test suite
          npm run test:e2e
```

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: pytest-check
        name: pytest-check
        entry: pytest tests/backend -q --tb=no
        language: system
        pass_filenames: false
        always_run: true

      - id: vitest-check
        name: vitest-check
        entry: bash -c 'cd job_monitor/ui && npm test -- --run'
        language: system
        pass_filenames: false
        always_run: true
```

---

## Best Practices

### 1. Test Naming Conventions

```python
# Backend: test_<what>_<condition>_<expected>
def test_health_metrics_invalid_days_returns_422():
    ...

def test_alert_priority_p1_sorted_first():
    ...
```

```typescript
// Frontend: describe blocks for grouping
describe('wildcardToRegex', () => {
  it('converts exact match pattern', () => {});
  it('escapes special regex characters', () => {});
});
```

### 2. Test Isolation

- Each test should be independent
- Use fixtures/setup for common state
- Clean up after each test
- Don't rely on test execution order

### 3. Mock External Dependencies

```python
# Mock Databricks SDK calls
@pytest.fixture
def mock_ws():
    with patch('myapp.backend.core.get_ws') as mock:
        ws = Mock()
        ws.statement_execution.execute_statement.return_value = create_sql_result(...)
        mock.return_value = ws
        yield ws
```

```typescript
// Mock fetch calls
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: [] }),
  });
});
```

### 4. Test Edge Cases

- Empty inputs
- Null/undefined values
- Maximum/minimum values
- Invalid inputs
- Error conditions
- Timeout scenarios

### 5. Keep Tests Fast

- Unit tests: < 100ms each
- Integration tests: < 1s each
- Total test suite: < 5 minutes
- Use mocks for slow dependencies

### 6. Maintain Test Documentation

```python
def test_pagination_with_empty_dataset():
    """
    Test pagination returns empty list when no data exists.

    Regression test for issue #123 where empty datasets
    caused IndexError in pagination logic.
    """
    ...
```

---

## Quick Reference

### Commands

```bash
# Backend
pytest                                    # Run all tests
pytest --cov=myapp --cov-report=html     # With coverage
pytest -k "health" -v                    # Run matching tests
pytest tests/backend/test_alerts.py      # Specific file

# Frontend
npm test                                  # Run all tests
npm run test:coverage                    # With coverage
npm run test:watch                       # Watch mode
npm test -- filter-utils.test.ts         # Specific file

# E2E
node tests/comprehensive-ui-test.js      # Browser tests
./tests/api-benchmark.sh                 # API performance
```

### File Locations

```
tests/
├── backend/
│   ├── conftest.py          # Shared fixtures
│   └── test_*.py            # Unit tests
├── integration/
│   └── test_api_*.py        # Integration tests
├── load-test.js             # Performance tests
└── reports/                 # Coverage reports

job_monitor/ui/
├── lib/__tests__/           # Utility tests
├── components/__tests__/    # Component tests
├── vitest.config.ts         # Vitest config
└── src/test/setup.ts        # Test setup
```

---

*Last updated: 2026-02-27*
