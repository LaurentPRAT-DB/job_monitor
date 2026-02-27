"""Tests for health check endpoints."""

import pytest
from fastapi.testclient import TestClient

from job_monitor.backend.app import app
from job_monitor.backend.routers.health import extract_workspace_name


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for /api/health endpoint."""

    def test_health_returns_200(self, client):
        """Health endpoint should return 200."""
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_health_response_structure(self, client):
        """Health response should have required fields."""
        response = client.get("/api/health")
        data = response.json()

        assert "status" in data
        assert "checks" in data
        assert "version" in data
        assert "workspace" in data
        assert "workspace_name" in data
        assert "timestamp" in data

    def test_health_status_values(self, client):
        """Health status should be one of the valid values."""
        response = client.get("/api/health")
        data = response.json()

        assert data["status"] in ["healthy", "degraded", "unhealthy"]

    def test_health_checks_structure(self, client):
        """Health checks should include expected keys."""
        response = client.get("/api/health")
        data = response.json()

        checks = data["checks"]
        assert "config" in checks
        assert "auth_mode" in checks
        assert "mock_data" in checks

    def test_health_deep_parameter(self, client):
        """Deep parameter should be accepted."""
        # Without deep - should be fast
        response = client.get("/api/health")
        assert response.status_code == 200

        # With deep=false - same as without
        response = client.get("/api/health?deep=false")
        assert response.status_code == 200

    def test_health_timestamp_format(self, client):
        """Timestamp should be ISO format."""
        response = client.get("/api/health")
        data = response.json()

        # Should be parseable as ISO timestamp
        from datetime import datetime

        timestamp = data["timestamp"]
        # ISO format: 2026-02-26T10:30:00.000000+00:00
        assert "T" in timestamp
        assert ":" in timestamp


class TestLivenessEndpoint:
    """Tests for /api/health/live endpoint."""

    def test_liveness_returns_200(self, client):
        """Liveness endpoint should always return 200."""
        response = client.get("/api/health/live")
        assert response.status_code == 200

    def test_liveness_response_structure(self, client):
        """Liveness response should be minimal."""
        response = client.get("/api/health/live")
        data = response.json()

        assert data["status"] == "ok"
        assert "version" in data
        assert "timestamp" in data


class TestReadinessEndpoint:
    """Tests for /api/health/ready endpoint."""

    def test_readiness_returns_200(self, client):
        """Readiness endpoint should return 200."""
        response = client.get("/api/health/ready")
        assert response.status_code == 200

    def test_readiness_response_structure(self, client):
        """Readiness response should have required fields."""
        response = client.get("/api/health/ready")
        data = response.json()

        assert "status" in data
        assert "checks" in data
        assert "version" in data
        assert "timestamp" in data

    def test_readiness_status_values(self, client):
        """Readiness status should be ready or not_ready."""
        response = client.get("/api/health/ready")
        data = response.json()

        assert data["status"] in ["ready", "not_ready"]

    def test_readiness_checks_fields(self, client):
        """Readiness checks should include config validation."""
        response = client.get("/api/health/ready")
        data = response.json()

        checks = data["checks"]
        assert "databricks_host" in checks
        assert "warehouse_id" in checks
        assert "auth_available" in checks


class TestCacheStatusEndpoint:
    """Tests for /api/cache/status endpoint."""

    @pytest.fixture
    def client_with_state(self):
        """Create test client with app state initialized."""
        # Initialize app state for cache endpoint
        app.state.workspace_client = None  # No actual client in tests
        return TestClient(app)

    def test_cache_status_returns_200(self, client_with_state):
        """Cache status endpoint should return 200."""
        response = client_with_state.get("/api/cache/status")
        assert response.status_code == 200

    def test_cache_status_response_structure(self, client_with_state):
        """Cache status should have required fields."""
        response = client_with_state.get("/api/cache/status")
        data = response.json()

        assert "status" in data
        assert "available" in data
        assert "cache_enabled" in data

    def test_cache_status_unavailable_without_client(self, client_with_state):
        """Cache status should report unavailable without workspace client."""
        response = client_with_state.get("/api/cache/status")
        data = response.json()

        assert data["status"] == "unavailable"
        assert data["available"] is False


class TestExtractWorkspaceName:
    """Tests for workspace name extraction utility."""

    def test_extract_e2_workspace(self):
        """Should extract E2 workspace name."""
        host = "https://e2-demo-field-eng.cloud.databricks.com"
        name = extract_workspace_name(host)
        assert name == "E2 Demo Field Eng"

    def test_extract_dbc_workspace(self):
        """Should extract DBC workspace name."""
        host = "https://dbc-abc123def.cloud.databricks.com"
        name = extract_workspace_name(host)
        assert name == "Dbc Abc123Def"

    def test_extract_simple_workspace(self):
        """Should extract simple workspace name."""
        host = "https://myworkspace.cloud.databricks.com"
        name = extract_workspace_name(host)
        assert name == "Myworkspace"

    def test_extract_none_host(self):
        """Should return unknown for None host."""
        name = extract_workspace_name(None)
        assert name == "unknown"

    def test_extract_empty_host(self):
        """Should return unknown for empty host."""
        name = extract_workspace_name("")
        assert name == "unknown"

    def test_extract_invalid_url(self):
        """Should return original for invalid URL."""
        host = "not-a-url"
        name = extract_workspace_name(host)
        assert name == host
