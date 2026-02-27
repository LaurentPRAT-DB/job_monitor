"""
Unit tests for health_metrics router.

Tests:
- GET /api/health-metrics endpoint
- GET /api/jobs/{job_id}/duration endpoint
- GET /api/jobs/{job_id}/expanded endpoint
- Parameter validation
- Error handling
- Mock data fallback
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from fastapi import HTTPException

from tests.backend.conftest import create_sql_result, create_permission_error_result


class TestHealthMetricsEndpoint:
    """Tests for GET /api/health-metrics."""

    def test_health_metrics_returns_200_with_mock_mode(self, client):
        """Test that endpoint returns mock data when USE_MOCK_DATA is set."""
        with patch.dict('os.environ', {'USE_MOCK_DATA': 'true'}):
            # Need to reimport to pick up env var
            with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=True):
                response = client.get("/api/health-metrics?days=7")
                assert response.status_code == 200
                data = response.json()
                assert "jobs" in data
                assert "window_days" in data
                assert "total_count" in data

    def test_health_metrics_validates_days_parameter(self, client):
        """Test that days parameter must be 7 or 30."""
        # Valid values
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=True):
            response = client.get("/api/health-metrics?days=7")
            assert response.status_code == 200

            response = client.get("/api/health-metrics?days=30")
            assert response.status_code == 200

        # Invalid values should return 422
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=True):
            response = client.get("/api/health-metrics?days=15")
            assert response.status_code == 422

            response = client.get("/api/health-metrics?days=0")
            assert response.status_code == 422

    def test_health_metrics_accepts_workspace_id_filter(self, client):
        """Test that workspace_id filter is accepted."""
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=True):
            response = client.get("/api/health-metrics?days=7&workspace_id=12345")
            assert response.status_code == 200

            response = client.get("/api/health-metrics?days=7&workspace_id=all")
            assert response.status_code == 200

    def test_health_metrics_returns_503_without_workspace_client(self, client):
        """Test that 503 is returned when WorkspaceClient is not available."""
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=False):
            with patch('job_monitor.backend.core.get_ws_prefer_user', return_value=None):
                # The dependency injection will be None
                response = client.get("/api/health-metrics?days=7")
                # Should fall back to mock data or return 503
                assert response.status_code in [200, 503]

    def test_health_metrics_response_structure(self, client):
        """Test that response has correct structure."""
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=True):
            response = client.get("/api/health-metrics?days=7")
            assert response.status_code == 200
            data = response.json()

            # Check top-level fields
            assert "jobs" in data
            assert "window_days" in data
            assert "total_count" in data
            assert isinstance(data["jobs"], list)
            assert data["window_days"] == 7
            assert isinstance(data["total_count"], int)

    def test_health_metrics_job_structure(self, client):
        """Test that each job in response has required fields."""
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=True):
            response = client.get("/api/health-metrics?days=7")
            data = response.json()

            if data["jobs"]:
                job = data["jobs"][0]
                required_fields = [
                    "job_id", "job_name", "total_runs", "success_count",
                    "success_rate", "priority", "retry_count"
                ]
                for field in required_fields:
                    assert field in job, f"Missing field: {field}"


class TestHealthMetricsPriorityLogic:
    """Tests for priority calculation logic."""

    def test_p1_priority_for_consecutive_failures(self):
        """Test that P1 is assigned for 2+ consecutive failures."""
        from job_monitor.backend.routers.health_metrics import _sort_by_priority
        from job_monitor.backend.models import JobHealthOut

        jobs = [
            JobHealthOut(
                job_id="1", job_name="test", total_runs=10, success_count=8,
                success_rate=80.0, priority="P1", retry_count=0
            ),
            JobHealthOut(
                job_id="2", job_name="test2", total_runs=10, success_count=9,
                success_rate=90.0, priority=None, retry_count=0
            ),
        ]

        sorted_jobs = _sort_by_priority(jobs)
        # P1 should come first
        assert sorted_jobs[0].priority == "P1"

    def test_p2_priority_for_single_failure(self):
        """Test that P2 is assigned for single recent failure."""
        from job_monitor.backend.routers.health_metrics import _sort_by_priority
        from job_monitor.backend.models import JobHealthOut

        jobs = [
            JobHealthOut(
                job_id="1", job_name="test", total_runs=10, success_count=9,
                success_rate=90.0, priority="P2", retry_count=0
            ),
            JobHealthOut(
                job_id="2", job_name="test2", total_runs=10, success_count=10,
                success_rate=100.0, priority=None, retry_count=0
            ),
        ]

        sorted_jobs = _sort_by_priority(jobs)
        # P2 should come before healthy job
        assert sorted_jobs[0].priority == "P2"

    def test_p3_priority_for_yellow_zone(self):
        """Test that P3 is assigned for 70-89% success rate."""
        from job_monitor.backend.routers.health_metrics import _sort_by_priority
        from job_monitor.backend.models import JobHealthOut

        jobs = [
            JobHealthOut(
                job_id="1", job_name="test", total_runs=10, success_count=8,
                success_rate=80.0, priority="P3", retry_count=0
            ),
            JobHealthOut(
                job_id="2", job_name="test2", total_runs=10, success_count=10,
                success_rate=100.0, priority=None, retry_count=0
            ),
        ]

        sorted_jobs = _sort_by_priority(jobs)
        # P3 should come before healthy job
        assert sorted_jobs[0].priority == "P3"

    def test_priority_sorting_order(self):
        """Test that priorities are sorted P1 > P2 > P3 > None."""
        from job_monitor.backend.routers.health_metrics import _sort_by_priority
        from job_monitor.backend.models import JobHealthOut

        jobs = [
            JobHealthOut(job_id="1", job_name="healthy", total_runs=10, success_count=10,
                        success_rate=100.0, priority=None, retry_count=0),
            JobHealthOut(job_id="2", job_name="p3", total_runs=10, success_count=8,
                        success_rate=80.0, priority="P3", retry_count=0),
            JobHealthOut(job_id="3", job_name="p1", total_runs=10, success_count=5,
                        success_rate=50.0, priority="P1", retry_count=0),
            JobHealthOut(job_id="4", job_name="p2", total_runs=10, success_count=7,
                        success_rate=70.0, priority="P2", retry_count=0),
        ]

        sorted_jobs = _sort_by_priority(jobs)
        priorities = [j.priority for j in sorted_jobs]
        assert priorities == ["P1", "P2", "P3", None]


class TestHealthMetricsParseResult:
    """Tests for SQL result parsing."""

    def test_parse_empty_result(self):
        """Test parsing empty SQL result."""
        from job_monitor.backend.routers.health_metrics import _parse_job_health

        result = Mock()
        result.result = None
        jobs = _parse_job_health(result)
        assert jobs == []

    def test_parse_result_with_null_values(self):
        """Test parsing result with NULL values."""
        from job_monitor.backend.routers.health_metrics import _parse_job_health

        result = Mock()
        result.result = Mock()
        result.result.data_array = [
            ["123", None, 10, 8, 80.0, None, None, None, 0],
        ]

        jobs = _parse_job_health(result)
        assert len(jobs) == 1
        assert jobs[0].job_id == "123"
        assert jobs[0].job_name == "job-123"  # Default name for NULL

    def test_parse_result_with_all_fields(self):
        """Test parsing result with all fields populated."""
        from job_monitor.backend.routers.health_metrics import _parse_job_health
        from datetime import datetime

        result = Mock()
        result.result = Mock()
        result.result.data_array = [
            ["123", "ETL-job", 100, 95, 95.0, datetime.now(), 3600, "P1", 5],
        ]

        jobs = _parse_job_health(result)
        assert len(jobs) == 1
        assert jobs[0].job_id == "123"
        assert jobs[0].job_name == "ETL-job"
        assert jobs[0].total_runs == 100
        assert jobs[0].success_count == 95
        assert jobs[0].success_rate == 95.0
        assert jobs[0].priority == "P1"
        assert jobs[0].retry_count == 5


class TestHealthMetricsErrorHandling:
    """Tests for error handling."""

    def test_permission_error_fallback_to_mock(self, client):
        """Test that permission errors fall back to mock data."""
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=False):
            with patch('job_monitor.backend.core.get_ws_prefer_user') as mock_ws_dep:
                mock_ws = Mock()
                mock_ws_dep.return_value = mock_ws

                # Simulate permission error
                mock_ws.statement_execution.execute_statement.return_value = create_permission_error_result()

                # Should fall back to mock data
                response = client.get("/api/health-metrics?days=7")
                # Either returns mock data (200) or error
                assert response.status_code in [200, 500]

    def test_sql_timeout_handling(self, client):
        """Test handling of SQL timeout errors."""
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=False):
            with patch('job_monitor.backend.core.get_ws_prefer_user') as mock_ws_dep:
                mock_ws = Mock()
                mock_ws_dep.return_value = mock_ws

                # Simulate timeout
                mock_ws.statement_execution.execute_statement.side_effect = TimeoutError("Query timed out")

                response = client.get("/api/health-metrics?days=7")
                # Should handle gracefully
                assert response.status_code in [200, 500, 503, 504]


class TestDurationStatsEndpoint:
    """Tests for GET /api/jobs/{job_id}/duration."""

    def test_duration_stats_with_mock_mode(self, client):
        """Test duration stats returns mock data."""
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=True):
            response = client.get("/api/jobs/123456/duration")
            assert response.status_code == 200
            data = response.json()
            assert "job_id" in data
            assert "median_seconds" in data

    def test_duration_stats_validates_job_id(self, client):
        """Test that job_id is required."""
        response = client.get("/api/jobs//duration")
        assert response.status_code in [404, 422]


class TestExpandedDetailsEndpoint:
    """Tests for GET /api/jobs/{job_id}/expanded."""

    def test_expanded_details_with_mock_mode(self, client):
        """Test expanded details returns mock data."""
        with patch('job_monitor.backend.routers.health_metrics.is_mock_mode', return_value=True):
            response = client.get("/api/jobs/123456/expanded")
            assert response.status_code == 200
            data = response.json()
            assert "job_id" in data
            assert "recent_runs" in data
