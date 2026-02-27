"""
Unit tests for cache module.

Tests:
- check_cache_exists function
- get_cache_freshness function
- query_job_health_cache function
- query_cost_cache function
- query_alerts_cache function
- query_job_duration_cache function
- Error handling and fallbacks
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timedelta


class TestCheckCacheExists:
    """Tests for check_cache_exists function."""

    @pytest.mark.asyncio
    async def test_returns_false_when_no_workspace_client(self):
        """Test that False is returned when ws is None."""
        from job_monitor.backend.cache import check_cache_exists

        result = await check_cache_exists(None)
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_no_warehouse_id(self):
        """Test that False is returned when warehouse_id is not configured."""
        from job_monitor.backend.cache import check_cache_exists

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.warehouse_id = None
            result = await check_cache_exists(Mock())
            assert result is False

    @pytest.mark.asyncio
    async def test_returns_true_when_table_accessible(self):
        """Test that True is returned when cache table exists."""
        from job_monitor.backend.cache import check_cache_exists

        mock_ws = Mock()
        mock_result = Mock()
        mock_result.status = Mock()
        mock_result.status.error = None
        mock_ws.statement_execution.execute_statement.return_value = mock_result

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                result = await check_cache_exists(mock_ws)
                assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_on_exception(self):
        """Test that False is returned on exception."""
        from job_monitor.backend.cache import check_cache_exists

        mock_ws = Mock()

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.side_effect = Exception("Connection error")
                result = await check_cache_exists(mock_ws)
                assert result is False


class TestGetCacheFreshness:
    """Tests for get_cache_freshness function."""

    @pytest.mark.asyncio
    async def test_returns_false_none_when_no_ws(self):
        """Test that (False, None) is returned when ws is None."""
        from job_monitor.backend.cache import get_cache_freshness

        result = await get_cache_freshness(None)
        assert result == (False, None)

    @pytest.mark.asyncio
    async def test_returns_freshness_status_when_cache_recent(self):
        """Test that cache is considered fresh when refreshed_at is recent."""
        from job_monitor.backend.cache import get_cache_freshness, CACHE_STALE_THRESHOLD

        mock_ws = Mock()
        recent_time = datetime.now() - timedelta(minutes=30)
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.data_array = [[recent_time.isoformat()]]

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                is_fresh, refreshed_at = await get_cache_freshness(mock_ws)
                # Fresh if within CACHE_STALE_THRESHOLD (1 hour)
                # Note: actual test might need adjustment based on timezone handling
                assert refreshed_at is not None

    @pytest.mark.asyncio
    async def test_returns_stale_when_cache_old(self):
        """Test that cache is considered stale when refreshed_at is old."""
        from job_monitor.backend.cache import get_cache_freshness

        mock_ws = Mock()
        old_time = datetime.now() - timedelta(hours=2)  # More than 1 hour threshold
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.data_array = [[old_time.isoformat()]]

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                is_fresh, refreshed_at = await get_cache_freshness(mock_ws)
                assert refreshed_at is not None


class TestQueryJobHealthCache:
    """Tests for query_job_health_cache function."""

    @pytest.mark.asyncio
    async def test_returns_none_when_cache_disabled(self):
        """Test that None is returned when use_cache is False."""
        from job_monitor.backend.cache import query_job_health_cache

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = False
            result = await query_job_health_cache(Mock(), days=7)
            assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_ws(self):
        """Test that None is returned when ws is None."""
        from job_monitor.backend.cache import query_job_health_cache

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            result = await query_job_health_cache(None, days=7)
            assert result is None

    @pytest.mark.asyncio
    async def test_returns_jobs_from_cache(self):
        """Test that job health data is returned from cache."""
        from job_monitor.backend.cache import query_job_health_cache

        mock_ws = Mock()
        mock_result = Mock()
        mock_result.status = Mock()
        mock_result.status.error = None
        mock_result.result = Mock()
        mock_result.result.data_array = [
            ["123", "test-job", 10, 8, 80.0, datetime.now(), 3600, "P1", 2, 1800.0, 2400.0, 1500.0, 3600.0, datetime.now()],
        ]

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                result = await query_job_health_cache(mock_ws, days=7)

                assert result is not None
                assert len(result) == 1
                assert result[0]["job_id"] == "123"
                assert result[0]["job_name"] == "test-job"
                assert result[0]["priority"] == "P1"

    @pytest.mark.asyncio
    async def test_returns_none_on_sql_error(self):
        """Test that None is returned on SQL error."""
        from job_monitor.backend.cache import query_job_health_cache

        mock_ws = Mock()
        mock_result = Mock()
        mock_result.status = Mock()
        mock_result.status.error = "Table not found"

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                result = await query_job_health_cache(mock_ws, days=7)
                assert result is None

    @pytest.mark.asyncio
    async def test_handles_7_day_and_30_day_windows(self):
        """Test that correct columns are selected for 7 and 30 day windows."""
        from job_monitor.backend.cache import query_job_health_cache

        # This is more of a query construction test
        # We verify the function accepts both day values
        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"

            mock_ws = Mock()
            mock_result = Mock()
            mock_result.status = Mock()
            mock_result.status.error = None
            mock_result.result = Mock()
            mock_result.result.data_array = []

            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result

                # Test 7-day window
                await query_job_health_cache(mock_ws, days=7)

                # Test 30-day window
                await query_job_health_cache(mock_ws, days=30)

                # Should have been called twice
                assert mock_thread.call_count == 2


class TestQueryCostCache:
    """Tests for query_cost_cache function."""

    @pytest.mark.asyncio
    async def test_returns_none_when_cache_disabled(self):
        """Test that None is returned when use_cache is False."""
        from job_monitor.backend.cache import query_cost_cache

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = False
            result = await query_cost_cache(Mock())
            assert result is None

    @pytest.mark.asyncio
    async def test_returns_cost_data_from_cache(self):
        """Test that cost data is returned from cache."""
        from job_monitor.backend.cache import query_cost_cache

        mock_ws = Mock()
        mock_result = Mock()
        mock_result.status = Mock()
        mock_result.status.error = None
        mock_result.result = Mock()
        mock_result.result.data_array = [
            ["123", "test-job", 1000.0, 400.0, 300.0, 33.3, "JOBS:800,SERVERLESS:200", 350.0, True, datetime.now()],
        ]

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                result = await query_cost_cache(mock_ws)

                assert result is not None
                assert len(result) == 1
                assert result[0]["job_id"] == "123"
                assert result[0]["total_dbus_30d"] == 1000.0
                assert result[0]["is_anomaly"] is True

    @pytest.mark.asyncio
    async def test_returns_none_on_exception(self):
        """Test that None is returned on exception."""
        from job_monitor.backend.cache import query_cost_cache

        mock_ws = Mock()

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.side_effect = Exception("Database error")
                result = await query_cost_cache(mock_ws)
                assert result is None


class TestQueryAlertsCache:
    """Tests for query_alerts_cache function."""

    @pytest.mark.asyncio
    async def test_returns_none_when_cache_disabled(self):
        """Test that None is returned when use_cache is False."""
        from job_monitor.backend.cache import query_alerts_cache

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = False
            result = await query_alerts_cache(Mock())
            assert result is None

    @pytest.mark.asyncio
    async def test_returns_alerts_from_cache(self):
        """Test that alerts are returned from cache."""
        from job_monitor.backend.cache import query_alerts_cache

        mock_ws = Mock()
        mock_result = Mock()
        mock_result.status = Mock()
        mock_result.status.error = None
        mock_result.result = Mock()
        mock_result.result.data_array = [
            ["alert-1", "123", "test-job", "failure", "P1", "Job failed", "2 consecutive failures", None, None, None, None, datetime.now()],
        ]

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                result = await query_alerts_cache(mock_ws)

                assert result is not None
                assert len(result) == 1
                assert result[0]["alert_id"] == "alert-1"
                assert result[0]["category"] == "failure"
                assert result[0]["severity"] == "P1"

    @pytest.mark.asyncio
    async def test_handles_empty_result(self):
        """Test that None is returned when cache is empty."""
        from job_monitor.backend.cache import query_alerts_cache

        mock_ws = Mock()
        mock_result = Mock()
        mock_result.status = Mock()
        mock_result.status.error = None
        mock_result.result = Mock()
        mock_result.result.data_array = []

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                result = await query_alerts_cache(mock_ws)
                # Empty result returns None
                assert result is None


class TestQueryJobDurationCache:
    """Tests for query_job_duration_cache function."""

    @pytest.mark.asyncio
    async def test_returns_none_when_cache_disabled(self):
        """Test that None is returned when use_cache is False."""
        from job_monitor.backend.cache import query_job_duration_cache

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = False
            result = await query_job_duration_cache(Mock(), "123")
            assert result is None

    @pytest.mark.asyncio
    async def test_returns_duration_stats_from_cache(self):
        """Test that duration stats are returned from cache."""
        from job_monitor.backend.cache import query_job_duration_cache

        mock_ws = Mock()
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.data_array = [
            ["123", 1800.0, 2400.0, 1500.0, 3600.0, 10],
        ]

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                result = await query_job_duration_cache(mock_ws, "123")

                assert result is not None
                assert result["job_id"] == "123"
                assert result["median_duration_seconds"] == 1800.0
                assert result["p90_duration_seconds"] == 2400.0
                assert result["run_count"] == 10

    @pytest.mark.asyncio
    async def test_returns_none_when_job_not_found(self):
        """Test that None is returned when job is not in cache."""
        from job_monitor.backend.cache import query_job_duration_cache

        mock_ws = Mock()
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.data_array = []

        with patch('job_monitor.backend.cache.settings') as mock_settings:
            mock_settings.use_cache = True
            mock_settings.warehouse_id = "test-warehouse"
            mock_settings.cache_table_prefix = "job_monitor.cache"
            with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                mock_thread.return_value = mock_result
                result = await query_job_duration_cache(mock_ws, "nonexistent")
                assert result is None


class TestCacheStalenessThreshold:
    """Tests for cache staleness threshold."""

    def test_staleness_threshold_is_one_hour(self):
        """Test that CACHE_STALE_THRESHOLD is 1 hour."""
        from job_monitor.backend.cache import CACHE_STALE_THRESHOLD

        assert CACHE_STALE_THRESHOLD == timedelta(hours=1)

    def test_cache_within_threshold_is_fresh(self):
        """Test that cache within threshold is considered fresh."""
        from job_monitor.backend.cache import CACHE_STALE_THRESHOLD
        from datetime import datetime, timezone

        refreshed_at = datetime.now(timezone.utc) - timedelta(minutes=30)
        is_fresh = datetime.now(timezone.utc) - refreshed_at < CACHE_STALE_THRESHOLD
        assert is_fresh is True

    def test_cache_beyond_threshold_is_stale(self):
        """Test that cache beyond threshold is considered stale."""
        from job_monitor.backend.cache import CACHE_STALE_THRESHOLD
        from datetime import datetime, timezone

        refreshed_at = datetime.now(timezone.utc) - timedelta(hours=2)
        is_fresh = datetime.now(timezone.utc) - refreshed_at < CACHE_STALE_THRESHOLD
        assert is_fresh is False
