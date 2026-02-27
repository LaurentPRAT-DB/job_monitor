"""
Unit tests for alerts router.

Tests:
- GET /api/alerts endpoint
- POST /api/alerts/{alert_id}/acknowledge endpoint
- Alert generation logic
- Severity filtering
- Category filtering
- Acknowledgment TTL
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timedelta
from fastapi.testclient import TestClient


class TestAlertsEndpoint:
    """Tests for GET /api/alerts."""

    def test_alerts_returns_200_with_mock_mode(self, client):
        """Test that endpoint returns mock data when USE_MOCK_DATA is set."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts")
            assert response.status_code == 200
            data = response.json()
            assert "alerts" in data
            assert "total" in data
            assert "by_severity" in data

    def test_alerts_response_structure(self, client):
        """Test that response has correct structure."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts")
            data = response.json()

            # Check top-level fields
            assert "alerts" in data
            assert "total" in data
            assert "by_severity" in data
            assert isinstance(data["alerts"], list)
            assert isinstance(data["total"], int)
            assert isinstance(data["by_severity"], dict)

            # Check severity counts
            severity_counts = data["by_severity"]
            assert "P1" in severity_counts
            assert "P2" in severity_counts
            assert "P3" in severity_counts

    def test_alerts_alert_structure(self, client):
        """Test that each alert has required fields."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts")
            data = response.json()

            if data["alerts"]:
                alert = data["alerts"][0]
                required_fields = [
                    "id", "job_id", "job_name", "category", "severity",
                    "title", "description", "remediation", "created_at"
                ]
                for field in required_fields:
                    assert field in alert, f"Missing field: {field}"

    def test_alerts_accepts_workspace_id_filter(self, client):
        """Test that workspace_id filter is accepted."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?workspace_id=12345")
            assert response.status_code == 200

            response = client.get("/api/alerts?workspace_id=all")
            assert response.status_code == 200


class TestAlertsCategoryFilter:
    """Tests for category filtering."""

    def test_filter_by_failure_category(self, client):
        """Test filtering alerts by failure category."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?category=failure")
            assert response.status_code == 200
            data = response.json()
            # All alerts should be failure category or empty
            for alert in data["alerts"]:
                assert alert["category"] == "failure"

    def test_filter_by_sla_category(self, client):
        """Test filtering alerts by SLA category."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?category=sla")
            assert response.status_code == 200

    def test_filter_by_cost_category(self, client):
        """Test filtering alerts by cost category."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?category=cost")
            assert response.status_code == 200

    def test_filter_by_cluster_category(self, client):
        """Test filtering alerts by cluster category."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?category=cluster")
            assert response.status_code == 200

    def test_filter_by_multiple_categories(self, client):
        """Test filtering by multiple categories."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?category=failure&category=sla")
            assert response.status_code == 200


class TestAlertsSeverityFilter:
    """Tests for severity filtering."""

    def test_filter_by_p1_severity(self, client):
        """Test filtering alerts by P1 severity."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?severity=P1")
            assert response.status_code == 200
            data = response.json()
            for alert in data["alerts"]:
                assert alert["severity"] == "P1"

    def test_filter_by_p2_severity(self, client):
        """Test filtering alerts by P2 severity."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?severity=P2")
            assert response.status_code == 200

    def test_filter_by_p3_severity(self, client):
        """Test filtering alerts by P3 severity."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?severity=P3")
            assert response.status_code == 200

    def test_filter_by_multiple_severities(self, client):
        """Test filtering by multiple severities."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?severity=P1&severity=P2")
            assert response.status_code == 200


class TestAlertsAcknowledgedFilter:
    """Tests for acknowledged filter."""

    def test_filter_acknowledged_true(self, client):
        """Test filtering for acknowledged alerts."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?acknowledged=true")
            assert response.status_code == 200

    def test_filter_acknowledged_false(self, client):
        """Test filtering for non-acknowledged alerts."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts?acknowledged=false")
            assert response.status_code == 200


class TestAcknowledgeEndpoint:
    """Tests for POST /api/alerts/{alert_id}/acknowledge."""

    def test_acknowledge_alert_success(self, client):
        """Test acknowledging an alert."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.post("/api/alerts/test-alert-123/acknowledge")
            # Should succeed or return appropriate status
            assert response.status_code in [200, 404]

    def test_acknowledge_alert_idempotent(self, client):
        """Test that acknowledging twice is idempotent."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response1 = client.post("/api/alerts/test-alert-123/acknowledge")
            response2 = client.post("/api/alerts/test-alert-123/acknowledge")
            # Both should succeed
            if response1.status_code == 200:
                assert response2.status_code == 200


class TestAcknowledgmentTTL:
    """Tests for acknowledgment TTL logic."""

    def test_is_acknowledged_within_ttl(self):
        """Test that acknowledgment is valid within 24 hours."""
        from job_monitor.backend.routers.alerts import _is_acknowledged, _acknowledged

        # Clear any existing acknowledgments
        _acknowledged.clear()

        condition_key = "test_condition_123"
        _acknowledged[condition_key] = datetime.now()

        is_ack, ack_time = _is_acknowledged(condition_key)
        assert is_ack is True
        assert ack_time is not None

    def test_is_acknowledged_expired_ttl(self):
        """Test that acknowledgment expires after 24 hours."""
        from job_monitor.backend.routers.alerts import _is_acknowledged, _acknowledged

        _acknowledged.clear()

        condition_key = "test_condition_456"
        # Set acknowledgment to 25 hours ago
        _acknowledged[condition_key] = datetime.now() - timedelta(hours=25)

        is_ack, ack_time = _is_acknowledged(condition_key)
        assert is_ack is False
        assert ack_time is None
        # Should be removed from store
        assert condition_key not in _acknowledged

    def test_is_acknowledged_not_found(self):
        """Test that non-existent acknowledgment returns False."""
        from job_monitor.backend.routers.alerts import _is_acknowledged, _acknowledged

        _acknowledged.clear()

        is_ack, ack_time = _is_acknowledged("nonexistent_condition")
        assert is_ack is False
        assert ack_time is None


class TestRemediationGeneration:
    """Tests for remediation message generation."""

    def test_failure_remediation_memory_issue(self):
        """Test remediation for memory/OOM issues."""
        from job_monitor.backend.routers.alerts import _generate_failure_remediation

        result = _generate_failure_remediation(["OutOfMemoryError", "heap space"])
        assert "memory" in result.lower() or "cluster" in result.lower()

    def test_failure_remediation_timeout(self):
        """Test remediation for timeout issues."""
        from job_monitor.backend.routers.alerts import _generate_failure_remediation

        result = _generate_failure_remediation(["connection timed out"])
        assert "timeout" in result.lower() or "duration" in result.lower()

    def test_failure_remediation_permission(self):
        """Test remediation for permission issues."""
        from job_monitor.backend.routers.alerts import _generate_failure_remediation

        result = _generate_failure_remediation(["access denied", "permission denied"])
        assert "permission" in result.lower() or "access" in result.lower()

    def test_failure_remediation_generic(self):
        """Test generic remediation."""
        from job_monitor.backend.routers.alerts import _generate_failure_remediation

        result = _generate_failure_remediation(["Unknown error"])
        assert len(result) > 0

    def test_failure_remediation_empty_reasons(self):
        """Test remediation with no failure reasons."""
        from job_monitor.backend.routers.alerts import _generate_failure_remediation

        result = _generate_failure_remediation([])
        assert len(result) > 0

    def test_sla_remediation_breach(self):
        """Test SLA remediation when breached."""
        from job_monitor.backend.routers.alerts import _generate_sla_remediation

        result = _generate_sla_remediation(105.0, 60)
        assert "breach" in result.lower() or "exceeded" in result.lower()

    def test_sla_remediation_approaching(self):
        """Test SLA remediation when approaching limit."""
        from job_monitor.backend.routers.alerts import _generate_sla_remediation

        result = _generate_sla_remediation(85.0, 60)
        assert "remaining" in result.lower() or "minutes" in result.lower()

    def test_cost_remediation_spike(self):
        """Test cost remediation for spike."""
        from job_monitor.backend.routers.alerts import _generate_cost_remediation

        result = _generate_cost_remediation("spike", 3.5, 100.0)
        assert len(result) > 0

    def test_cost_remediation_budget_exceeded(self):
        """Test cost remediation for budget exceeded."""
        from job_monitor.backend.routers.alerts import _generate_cost_remediation

        result = _generate_cost_remediation("budget_exceeded", None, None)
        assert "budget" in result.lower() or "limit" in result.lower()

    def test_cluster_remediation(self):
        """Test cluster over-provisioning remediation."""
        from job_monitor.backend.routers.alerts import _generate_cluster_remediation

        result = _generate_cluster_remediation(25.0, 10)
        assert "utilization" in result.lower() or "worker" in result.lower()


class TestAlertSorting:
    """Tests for alert sorting by severity."""

    def test_alerts_sorted_by_severity(self, client):
        """Test that alerts are sorted P1 > P2 > P3."""
        with patch('job_monitor.backend.routers.alerts.is_mock_mode', return_value=True):
            response = client.get("/api/alerts")
            data = response.json()
            alerts = data["alerts"]

            if len(alerts) >= 2:
                severity_order = {"P1": 0, "P2": 1, "P3": 2}
                for i in range(len(alerts) - 1):
                    current = severity_order.get(alerts[i]["severity"], 99)
                    next_sev = severity_order.get(alerts[i + 1]["severity"], 99)
                    assert current <= next_sev


class TestAlertDeduplication:
    """Tests for alert deduplication."""

    def test_deduplicate_alerts(self):
        """Test that duplicate alerts are deduplicated."""
        from job_monitor.backend.routers.alerts import _deduplicate_alerts, Alert, AlertCategory, AlertSeverity

        alerts = [
            Alert(
                id="1", job_id="123", job_name="test", category=AlertCategory.FAILURE,
                severity=AlertSeverity.P1, title="Test", description="Test",
                remediation="Test", created_at=datetime.now(), condition_key="key1"
            ),
            Alert(
                id="2", job_id="123", job_name="test", category=AlertCategory.FAILURE,
                severity=AlertSeverity.P2, title="Test2", description="Test2",
                remediation="Test2", created_at=datetime.now(), condition_key="key1"
            ),
        ]

        result = _deduplicate_alerts(alerts)
        # Should keep only 1, the P1 (higher severity)
        assert len(result) == 1
        assert result[0].severity == AlertSeverity.P1

    def test_deduplicate_keeps_unique(self):
        """Test that unique alerts are preserved."""
        from job_monitor.backend.routers.alerts import _deduplicate_alerts, Alert, AlertCategory, AlertSeverity

        alerts = [
            Alert(
                id="1", job_id="123", job_name="test", category=AlertCategory.FAILURE,
                severity=AlertSeverity.P1, title="Test", description="Test",
                remediation="Test", created_at=datetime.now(), condition_key="key1"
            ),
            Alert(
                id="2", job_id="456", job_name="test2", category=AlertCategory.COST,
                severity=AlertSeverity.P2, title="Test2", description="Test2",
                remediation="Test2", created_at=datetime.now(), condition_key="key2"
            ),
        ]

        result = _deduplicate_alerts(alerts)
        assert len(result) == 2
