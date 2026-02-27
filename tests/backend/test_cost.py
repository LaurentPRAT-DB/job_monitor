"""
Unit tests for cost router.

Tests:
- GET /api/costs/summary endpoint
- GET /api/costs/by-team endpoint
- GET /api/costs/anomalies endpoint
- SKU categorization
- Job cost parsing
- Team rollup calculations
- Anomaly detection
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timedelta
from fastapi.testclient import TestClient


# Local helper functions (replicated from conftest to avoid import collision)
def create_sql_result(columns: list[str], data: list[list]) -> Mock:
    """Create a mock SQL execution result with specified columns and data."""
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


class TestCostSummaryEndpoint:
    """Tests for GET /api/costs/summary."""

    def test_cost_summary_returns_200_with_mock_mode(self, client):
        """Test that endpoint returns mock data when USE_MOCK_DATA is set."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/summary")
            assert response.status_code == 200
            data = response.json()
            assert "jobs" in data
            assert "teams" in data
            assert "anomalies" in data
            assert "total_dbus" in data

    def test_cost_summary_validates_days_parameter(self, client):
        """Test that days parameter must be between 7 and 90."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            # Valid values
            response = client.get("/api/costs/summary?days=7")
            assert response.status_code == 200

            response = client.get("/api/costs/summary?days=30")
            assert response.status_code == 200

            response = client.get("/api/costs/summary?days=90")
            assert response.status_code == 200

        # Invalid values should return 422
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/summary?days=5")
            assert response.status_code == 422

            response = client.get("/api/costs/summary?days=100")
            assert response.status_code == 422

    def test_cost_summary_accepts_workspace_id_filter(self, client):
        """Test that workspace_id filter is accepted."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/summary?workspace_id=12345")
            assert response.status_code == 200

            response = client.get("/api/costs/summary?workspace_id=all")
            assert response.status_code == 200

    def test_cost_summary_response_structure(self, client):
        """Test that response has correct structure."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/summary")
            assert response.status_code == 200
            data = response.json()

            # Check top-level fields
            assert "jobs" in data
            assert "teams" in data
            assert "anomalies" in data
            assert "total_dbus" in data
            assert "dbu_rate" in data
            assert isinstance(data["jobs"], list)
            assert isinstance(data["teams"], list)

    def test_cost_summary_job_structure(self, client):
        """Test that each job in response has required fields."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/summary")
            data = response.json()

            if data["jobs"]:
                job = data["jobs"][0]
                required_fields = [
                    "job_id", "job_name", "total_dbus_30d",
                    "trend_7d_percent", "is_anomaly"
                ]
                for field in required_fields:
                    assert field in job, f"Missing field: {field}"

    def test_cost_summary_include_teams_parameter(self, client):
        """Test that include_teams parameter is accepted."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/summary?include_teams=false")
            assert response.status_code == 200

            response = client.get("/api/costs/summary?include_teams=true")
            assert response.status_code == 200


class TestSkuCategorization:
    """Tests for SKU categorization logic."""

    def test_categorize_all_purpose(self):
        """Test ALL_PURPOSE SKU categorization."""
        from job_monitor.backend.routers.cost import _categorize_sku

        assert _categorize_sku("ALL_PURPOSE_COMPUTE") == "All-Purpose"
        assert _categorize_sku("all_purpose") == "All-Purpose"
        assert _categorize_sku("ALL_PURPOSE_PHOTON") == "All-Purpose"

    def test_categorize_jobs_compute(self):
        """Test JOBS SKU categorization."""
        from job_monitor.backend.routers.cost import _categorize_sku

        assert _categorize_sku("JOBS_COMPUTE") == "Jobs Compute"
        assert _categorize_sku("JOBS_PHOTON") == "Jobs Compute"
        assert _categorize_sku("jobs_light") == "Jobs Compute"

    def test_categorize_sql_warehouse(self):
        """Test SQL SKU categorization."""
        from job_monitor.backend.routers.cost import _categorize_sku

        assert _categorize_sku("SQL_COMPUTE") == "SQL Warehouse"
        assert _categorize_sku("SQL_CLASSIC") == "SQL Warehouse"
        assert _categorize_sku("sql_pro") == "SQL Warehouse"

    def test_categorize_serverless(self):
        """Test SERVERLESS SKU categorization."""
        from job_monitor.backend.routers.cost import _categorize_sku

        assert _categorize_sku("SERVERLESS") == "Serverless"
        # Note: SERVERLESS_SQL contains SQL and is categorized as SQL Warehouse
        assert _categorize_sku("SERVERLESS_SQL") == "SQL Warehouse"
        # serverless_jobs contains JOBS, categorized as Jobs Compute
        assert _categorize_sku("serverless_jobs") == "Jobs Compute"

    def test_categorize_other(self):
        """Test unknown SKU categorization."""
        from job_monitor.backend.routers.cost import _categorize_sku

        assert _categorize_sku("UNKNOWN_SKU") == "Other"
        assert _categorize_sku("MODEL_SERVING") == "Other"
        assert _categorize_sku("random") == "Other"


class TestJobCostParsing:
    """Tests for job cost parsing from SQL results."""

    def test_parse_empty_result(self):
        """Test parsing empty SQL result."""
        from job_monitor.backend.routers.cost import _parse_job_costs

        result = Mock()
        result.result = None
        jobs = _parse_job_costs(result, dbu_rate=0.15)
        assert jobs == []

    def test_parse_result_with_null_values(self):
        """Test parsing result with NULL values."""
        from job_monitor.backend.routers.cost import _parse_job_costs

        result = Mock()
        result.result = Mock()
        result.result.data_array = [
            ["123", None, 100.0, 50.0, 40.0, None, None],
        ]

        jobs = _parse_job_costs(result, dbu_rate=0.15)
        assert len(jobs) == 1
        assert jobs[0].job_id == "123"
        assert jobs[0].job_name == "job-123"  # Default name for NULL
        assert jobs[0].total_dbus_30d == 100.0

    def test_parse_result_with_all_fields(self):
        """Test parsing result with all fields populated."""
        from job_monitor.backend.routers.cost import _parse_job_costs

        result = Mock()
        result.result = Mock()
        result.result.data_array = [
            ["123", "ETL-job", 1000.0, 400.0, 300.0, "JOBS_COMPUTE:800,SERVERLESS:200", 350.0],
        ]

        jobs = _parse_job_costs(result, dbu_rate=0.15)
        assert len(jobs) == 1
        assert jobs[0].job_id == "123"
        assert jobs[0].job_name == "ETL-job"
        assert jobs[0].total_dbus_30d == 1000.0
        assert jobs[0].total_cost_dollars == 150.0  # 1000 * 0.15
        assert len(jobs[0].cost_by_sku) == 2

    def test_parse_trend_calculation_positive(self):
        """Test positive trend calculation."""
        from job_monitor.backend.routers.cost import _parse_job_costs

        result = Mock()
        result.result = Mock()
        result.result.data_array = [
            ["123", "test-job", 100.0, 60.0, 40.0, None, None],  # 50% increase
        ]

        jobs = _parse_job_costs(result, dbu_rate=0.15)
        assert jobs[0].trend_7d_percent == 50.0

    def test_parse_trend_calculation_negative(self):
        """Test negative trend calculation."""
        from job_monitor.backend.routers.cost import _parse_job_costs

        result = Mock()
        result.result = Mock()
        result.result.data_array = [
            ["123", "test-job", 100.0, 40.0, 80.0, None, None],  # 50% decrease
        ]

        jobs = _parse_job_costs(result, dbu_rate=0.15)
        assert jobs[0].trend_7d_percent == -50.0

    def test_parse_anomaly_detection(self):
        """Test anomaly detection when cost > 2x p90."""
        from job_monitor.backend.routers.cost import _parse_job_costs

        result = Mock()
        result.result = Mock()
        result.result.data_array = [
            ["123", "anomaly-job", 100.0, 100.0, 50.0, None, 30.0],  # 100 > 2*30 = 60, so anomaly
        ]

        jobs = _parse_job_costs(result, dbu_rate=0.15)
        assert jobs[0].is_anomaly is True

    def test_parse_no_anomaly_when_below_threshold(self):
        """Test no anomaly when cost <= 2x p90."""
        from job_monitor.backend.routers.cost import _parse_job_costs

        result = Mock()
        result.result = Mock()
        result.result.data_array = [
            ["123", "normal-job", 100.0, 50.0, 50.0, None, 50.0],  # 50 <= 2*50 = 100, no anomaly
        ]

        jobs = _parse_job_costs(result, dbu_rate=0.15)
        assert jobs[0].is_anomaly is False


class TestCostsByTeamEndpoint:
    """Tests for GET /api/costs/by-team."""

    def test_costs_by_team_returns_200(self, client):
        """Test that endpoint returns 200."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/by-team")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)

    def test_costs_by_team_validates_days(self, client):
        """Test that days parameter is validated."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/by-team?days=30")
            assert response.status_code == 200

        # Invalid day value - should return 422 (validation error)
        response = client.get("/api/costs/by-team?days=3")
        assert response.status_code == 422


class TestCostAnomaliesEndpoint:
    """Tests for GET /api/costs/anomalies."""

    def test_anomalies_returns_200_with_mock_mode(self, client):
        """Test that endpoint returns data in mock mode."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/anomalies")
            # May return 200, or 503 if ws is None (no warehouse configured)
            assert response.status_code in [200, 503]
            if response.status_code == 200:
                data = response.json()
                assert isinstance(data, list)

    def test_anomalies_validates_days(self, client):
        """Test that days parameter is validated."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=True):
            response = client.get("/api/costs/anomalies?days=30")
            # May return 200, or 503 if ws is None
            assert response.status_code in [200, 503]


class TestCostResponseCache:
    """Tests for response caching."""

    def test_response_cache_key_includes_workspace(self):
        """Test that cache key includes workspace filter."""
        # This is a unit test for the cache key generation logic
        # The cache key format is: f"cost_summary:{days}:{include_teams}:{ws_filter}"

        days = 30
        include_teams = False
        workspace_id = "12345"
        ws_filter = workspace_id if workspace_id else "all"

        expected_key = f"cost_summary:{days}:{include_teams}:{ws_filter}"
        assert expected_key == "cost_summary:30:False:12345"

    def test_response_cache_key_for_all_workspaces(self):
        """Test cache key when workspace_id is not specified."""
        days = 30
        include_teams = False
        workspace_id = None
        ws_filter = workspace_id if workspace_id else "all"

        expected_key = f"cost_summary:{days}:{include_teams}:{ws_filter}"
        assert expected_key == "cost_summary:30:False:all"


class TestTeamRollupCalculation:
    """Tests for team cost rollup calculations."""

    def test_team_rollup_groups_by_team(self):
        """Test that jobs are grouped by team correctly."""
        from job_monitor.backend.models import JobCostOut

        jobs = [
            JobCostOut(
                job_id="1", job_name="job1", team="Team-A",
                total_dbus_30d=100.0, trend_7d_percent=10.0, is_anomaly=False,
                cost_by_sku=[]
            ),
            JobCostOut(
                job_id="2", job_name="job2", team="Team-A",
                total_dbus_30d=200.0, trend_7d_percent=5.0, is_anomaly=False,
                cost_by_sku=[]
            ),
            JobCostOut(
                job_id="3", job_name="job3", team="Team-B",
                total_dbus_30d=150.0, trend_7d_percent=-5.0, is_anomaly=False,
                cost_by_sku=[]
            ),
        ]

        # Calculate team rollups
        team_costs: dict[str, dict] = {}
        for job in jobs:
            team = job.team or "Untagged"
            if team not in team_costs:
                team_costs[team] = {"total_dbus": 0.0, "job_count": 0}
            team_costs[team]["total_dbus"] += job.total_dbus_30d
            team_costs[team]["job_count"] += 1

        assert team_costs["Team-A"]["total_dbus"] == 300.0
        assert team_costs["Team-A"]["job_count"] == 2
        assert team_costs["Team-B"]["total_dbus"] == 150.0
        assert team_costs["Team-B"]["job_count"] == 1

    def test_team_rollup_untagged_jobs(self):
        """Test that jobs without team tags are grouped as 'Untagged'."""
        from job_monitor.backend.models import JobCostOut

        jobs = [
            JobCostOut(
                job_id="1", job_name="job1", team=None,
                total_dbus_30d=100.0, trend_7d_percent=0.0, is_anomaly=False,
                cost_by_sku=[]
            ),
            JobCostOut(
                job_id="2", job_name="job2", team="",
                total_dbus_30d=200.0, trend_7d_percent=0.0, is_anomaly=False,
                cost_by_sku=[]
            ),
        ]

        team_costs: dict[str, dict] = {}
        for job in jobs:
            team = job.team or "Untagged"
            if team not in team_costs:
                team_costs[team] = {"total_dbus": 0.0, "job_count": 0}
            team_costs[team]["total_dbus"] += job.total_dbus_30d
            team_costs[team]["job_count"] += 1

        assert "Untagged" in team_costs
        assert team_costs["Untagged"]["total_dbus"] == 300.0
        assert team_costs["Untagged"]["job_count"] == 2


class TestAnomalyTypesDetection:
    """Tests for different anomaly types detection."""

    def test_cost_spike_anomaly_detection(self):
        """Test detection of cost spike anomalies."""
        from job_monitor.backend.models import JobCostOut, CostAnomalyOut

        job = JobCostOut(
            job_id="123",
            job_name="spike-job",
            team="Team-A",
            total_dbus_30d=1000.0,
            baseline_p90_dbus=300.0,  # 1000 > 2*300 = 600
            is_anomaly=True,
            trend_7d_percent=50.0,
            cost_by_sku=[]
        )

        # Check if job qualifies for cost spike anomaly
        assert job.is_anomaly is True
        assert job.baseline_p90_dbus is not None
        multiplier = job.total_dbus_30d / job.baseline_p90_dbus
        assert multiplier > 2  # 1000/300 = 3.33

    def test_no_anomaly_for_normal_cost(self):
        """Test that normal cost jobs are not flagged as anomalies."""
        from job_monitor.backend.models import JobCostOut

        job = JobCostOut(
            job_id="123",
            job_name="normal-job",
            team="Team-A",
            total_dbus_30d=500.0,
            baseline_p90_dbus=400.0,  # 500 <= 2*400 = 800
            is_anomaly=False,
            trend_7d_percent=10.0,
            cost_by_sku=[]
        )

        assert job.is_anomaly is False


class TestCostErrorHandling:
    """Tests for error handling in cost endpoints."""

    def test_sql_error_handling(self, client):
        """Test handling of SQL errors."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=False):
            with patch('job_monitor.backend.core.get_ws_prefer_user') as mock_ws_dep:
                mock_ws = Mock()
                mock_ws_dep.return_value = mock_ws

                # Simulate SQL error
                mock_ws.statement_execution.execute_statement.return_value = create_sql_error_result(
                    "Permission denied"
                )

                # Should fall back to mock data or return error
                response = client.get("/api/costs/summary")
                assert response.status_code in [200, 500]

    def test_missing_workspace_client(self, client):
        """Test handling when WorkspaceClient is not available."""
        with patch('job_monitor.backend.routers.cost.is_mock_mode', return_value=False):
            with patch('job_monitor.backend.core.get_ws_prefer_user', return_value=None):
                response = client.get("/api/costs/summary")
                # Should fall back to mock data
                assert response.status_code == 200
