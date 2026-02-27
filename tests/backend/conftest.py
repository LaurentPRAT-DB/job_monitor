"""
Pytest configuration and fixtures for backend tests.

Provides:
- FastAPI test client
- Mock WorkspaceClient
- Mock SQL execution results
- Sample data fixtures
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@pytest.fixture(scope="session")
def anyio_backend():
    """Use asyncio for async tests."""
    return "asyncio"


@pytest.fixture
def app():
    """Create FastAPI app instance for testing."""
    from job_monitor.backend.app import app
    # Initialize the app state with a mock workspace_client
    app.state.workspace_client = Mock()
    return app


@pytest.fixture
def client(app):
    """Create test client for API requests."""
    from job_monitor.backend.core import get_ws_prefer_user, get_ws

    # Create a mock workspace client
    mock_ws = Mock()
    mock_ws.statement_execution = Mock()
    mock_ws.jobs = Mock()

    # Override the dependencies to return mock
    def override_get_ws_prefer_user():
        return mock_ws

    def override_get_ws():
        return mock_ws

    app.dependency_overrides[get_ws_prefer_user] = override_get_ws_prefer_user
    app.dependency_overrides[get_ws] = override_get_ws

    with TestClient(app) as test_client:
        yield test_client

    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture
def mock_settings():
    """Mock settings with test values."""
    with patch('job_monitor.backend.config.get_settings') as mock:
        settings = Mock()
        settings.databricks_host = "https://test.databricks.com"
        settings.warehouse_id = "test-warehouse-123"
        settings.dbu_rate = 0.15
        settings.use_cache = False
        settings.sla_tag_key = "sla_minutes"
        settings.budget_tag_key = "budget_dbus"
        settings.team_tag_key = "team"
        mock.return_value = settings
        yield settings


@pytest.fixture
def mock_workspace_client():
    """Mock Databricks WorkspaceClient."""
    mock_ws = Mock()

    # Mock statement execution
    mock_ws.statement_execution = Mock()
    mock_ws.statement_execution.execute_statement = Mock()

    # Mock jobs API
    mock_ws.jobs = Mock()
    mock_ws.jobs.list = Mock(return_value=[])
    mock_ws.jobs.list_runs = Mock(return_value=[])
    mock_ws.jobs.get = Mock()
    mock_ws.jobs.update = Mock()

    return mock_ws


@pytest.fixture
def mock_sql_success_result():
    """Mock successful SQL execution result."""
    from databricks.sdk.service.sql import StatementState

    result = Mock()
    result.status = Mock()
    result.status.state = StatementState.SUCCEEDED
    result.status.error = None
    result.manifest = Mock()
    result.manifest.schema = Mock()
    result.manifest.schema.columns = []
    result.result = Mock()
    result.result.data_array = []
    return result


@pytest.fixture
def sample_health_metrics_data():
    """Sample health metrics data for testing."""
    return [
        {
            "job_id": "123456",
            "job_name": "ETL-daily-load",
            "total_runs": 100,
            "success_count": 95,
            "success_rate": 95.0,
            "last_run_time": datetime.now() - timedelta(hours=2),
            "last_duration_seconds": 3600,
            "priority": None,
            "retry_count": 2,
        },
        {
            "job_id": "789012",
            "job_name": "Report-generator",
            "total_runs": 50,
            "success_count": 40,
            "success_rate": 80.0,
            "last_run_time": datetime.now() - timedelta(hours=1),
            "last_duration_seconds": 1800,
            "priority": "P3",
            "retry_count": 5,
        },
        {
            "job_id": "345678",
            "job_name": "Data-validation",
            "total_runs": 30,
            "success_count": 20,
            "success_rate": 66.7,
            "last_run_time": datetime.now() - timedelta(minutes=30),
            "last_duration_seconds": 900,
            "priority": "P2",
            "retry_count": 0,
        },
    ]


@pytest.fixture
def sample_alerts_data():
    """Sample alerts data for testing."""
    return [
        {
            "alert_id": "failure_123456_consecutive",
            "job_id": "123456",
            "job_name": "ETL-daily-load",
            "category": "failure",
            "severity": "P1",
            "title": "2+ consecutive failures",
            "description": "Job has failed 3 times in a row",
            "remediation": "Check job logs",
            "created_at": datetime.now(),
        },
        {
            "alert_id": "cost_789012_spike",
            "job_id": "789012",
            "job_name": "Report-generator",
            "category": "cost",
            "severity": "P2",
            "title": "Cost spike (3.2x baseline)",
            "description": "Cost 3.2x higher than p90",
            "remediation": "Review cluster sizing",
            "created_at": datetime.now(),
        },
    ]


@pytest.fixture
def sample_cost_data():
    """Sample cost data for testing."""
    return [
        {
            "job_id": "123456",
            "job_name": "ETL-daily-load",
            "total_dbus_30d": 1500.5,
            "current_7d_dbus": 400.0,
            "prev_7d_dbus": 350.0,
            "sku_breakdown": "JOBS_COMPUTE:1200.0,SERVERLESS:300.5",
            "p90_dbus": 450.0,
        },
    ]


@pytest.fixture
def sample_workspace_data():
    """Sample workspace data for testing."""
    return [
        {
            "workspace_id": "1234567890",
            "name": "E2 Demo Field Eng",
            "job_count": 150,
        },
        {
            "workspace_id": "9876543210",
            "name": "Production Workspace",
            "job_count": 500,
        },
    ]


@pytest.fixture
def mock_get_ws_prefer_user(mock_workspace_client):
    """Mock the get_ws_prefer_user dependency."""
    with patch('job_monitor.backend.core.get_ws_prefer_user') as mock:
        mock.return_value = mock_workspace_client
        yield mock_workspace_client


@pytest.fixture
def mock_cache_disabled():
    """Disable cache for testing."""
    with patch('job_monitor.backend.config.settings') as mock_settings:
        mock_settings.use_cache = False
        mock_settings.warehouse_id = "test-warehouse"
        mock_settings.databricks_host = "https://test.databricks.com"
        yield mock_settings


# Helper functions for creating mock SQL results

def create_sql_result(columns: list[str], data: list[list]) -> Mock:
    """Create a mock SQL execution result with specified columns and data."""
    from databricks.sdk.service.sql import StatementState

    result = Mock()
    result.status = Mock()
    result.status.state = StatementState.SUCCEEDED
    result.status.error = None

    # Create column mocks
    col_mocks = [Mock(name=col) for col in columns]
    result.manifest = Mock()
    result.manifest.schema = Mock()
    result.manifest.schema.columns = col_mocks

    result.result = Mock()
    result.result.data_array = data

    return result


def create_sql_error_result(error_message: str) -> Mock:
    """Create a mock SQL execution result with an error."""
    from databricks.sdk.service.sql import StatementState

    result = Mock()
    result.status = Mock()
    result.status.state = StatementState.FAILED
    result.status.error = Mock()
    result.status.error.message = error_message
    result.result = None
    result.manifest = None

    return result


def create_permission_error_result() -> Mock:
    """Create a mock SQL result with permission error."""
    return create_sql_error_result(
        "[INSUFFICIENT_PERMISSIONS] User does not have USE SCHEMA on Schema 'system.lakeflow'"
    )
