/**
 * Tests for alert-utils.ts
 *
 * Tests:
 * - getUnacknowledgedCount counting
 * - groupAlertsBySeverity grouping
 * - getAlertsForJob filtering
 * - getHighestSeverity priority
 * - SEVERITY_CONFIG structure
 * - CATEGORY_LABELS structure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getUnacknowledgedCount,
  groupAlertsBySeverity,
  getAlertsForJob,
  getHighestSeverity,
  fetchAlerts,
  acknowledgeAlert,
  SEVERITY_CONFIG,
  CATEGORY_LABELS,
  type Alert,
  type AlertSeverity,
  type AlertCategory,
} from '../alert-utils';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// Test data factory
function createAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    job_id: 'job-123',
    job_name: 'Test Job',
    category: 'failure' as AlertCategory,
    severity: 'P1' as AlertSeverity,
    title: 'Test Alert',
    description: 'Test description',
    remediation: 'Test remediation',
    created_at: '2024-01-15T10:00:00Z',
    acknowledged: false,
    acknowledged_at: null,
    condition_key: 'test-condition',
    ...overrides,
  };
}

describe('getUnacknowledgedCount', () => {
  it('returns 0 for empty array', () => {
    expect(getUnacknowledgedCount([])).toBe(0);
  });

  it('returns count of unacknowledged alerts', () => {
    const alerts = [
      createAlert({ id: '1', acknowledged: false }),
      createAlert({ id: '2', acknowledged: true }),
      createAlert({ id: '3', acknowledged: false }),
    ];
    expect(getUnacknowledgedCount(alerts)).toBe(2);
  });

  it('returns 0 when all alerts are acknowledged', () => {
    const alerts = [
      createAlert({ id: '1', acknowledged: true }),
      createAlert({ id: '2', acknowledged: true }),
    ];
    expect(getUnacknowledgedCount(alerts)).toBe(0);
  });

  it('returns total count when no alerts are acknowledged', () => {
    const alerts = [
      createAlert({ id: '1', acknowledged: false }),
      createAlert({ id: '2', acknowledged: false }),
      createAlert({ id: '3', acknowledged: false }),
    ];
    expect(getUnacknowledgedCount(alerts)).toBe(3);
  });
});

describe('groupAlertsBySeverity', () => {
  it('returns empty groups for empty array', () => {
    const grouped = groupAlertsBySeverity([]);
    expect(grouped).toEqual({ P1: [], P2: [], P3: [] });
  });

  it('groups alerts correctly by severity', () => {
    const alerts = [
      createAlert({ id: '1', severity: 'P1' }),
      createAlert({ id: '2', severity: 'P2' }),
      createAlert({ id: '3', severity: 'P1' }),
      createAlert({ id: '4', severity: 'P3' }),
    ];

    const grouped = groupAlertsBySeverity(alerts);
    expect(grouped.P1.length).toBe(2);
    expect(grouped.P2.length).toBe(1);
    expect(grouped.P3.length).toBe(1);
  });

  it('handles single severity type', () => {
    const alerts = [
      createAlert({ id: '1', severity: 'P2' }),
      createAlert({ id: '2', severity: 'P2' }),
    ];

    const grouped = groupAlertsBySeverity(alerts);
    expect(grouped.P1.length).toBe(0);
    expect(grouped.P2.length).toBe(2);
    expect(grouped.P3.length).toBe(0);
  });
});

describe('getAlertsForJob', () => {
  it('returns empty array when no alerts match', () => {
    const alerts = [
      createAlert({ job_id: 'job-123' }),
      createAlert({ job_id: 'job-456' }),
    ];
    expect(getAlertsForJob(alerts, 'job-789')).toEqual([]);
  });

  it('returns matching alerts for a job', () => {
    const alerts = [
      createAlert({ id: '1', job_id: 'job-123' }),
      createAlert({ id: '2', job_id: 'job-456' }),
      createAlert({ id: '3', job_id: 'job-123' }),
    ];

    const result = getAlertsForJob(alerts, 'job-123');
    expect(result.length).toBe(2);
    expect(result.every((a) => a.job_id === 'job-123')).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(getAlertsForJob([], 'job-123')).toEqual([]);
  });
});

describe('getHighestSeverity', () => {
  it('returns null for empty array', () => {
    expect(getHighestSeverity([])).toBeNull();
  });

  it('returns P1 when P1 alerts exist', () => {
    const alerts = [
      createAlert({ severity: 'P2' }),
      createAlert({ severity: 'P1' }),
      createAlert({ severity: 'P3' }),
    ];
    expect(getHighestSeverity(alerts)).toBe('P1');
  });

  it('returns P2 when P2 is highest (no P1)', () => {
    const alerts = [
      createAlert({ severity: 'P2' }),
      createAlert({ severity: 'P3' }),
      createAlert({ severity: 'P3' }),
    ];
    expect(getHighestSeverity(alerts)).toBe('P2');
  });

  it('returns P3 when only P3 alerts exist', () => {
    const alerts = [
      createAlert({ severity: 'P3' }),
      createAlert({ severity: 'P3' }),
    ];
    expect(getHighestSeverity(alerts)).toBe('P3');
  });

  it('returns P1 for single P1 alert', () => {
    const alerts = [createAlert({ severity: 'P1' })];
    expect(getHighestSeverity(alerts)).toBe('P1');
  });
});

describe('SEVERITY_CONFIG', () => {
  it('has configuration for all severity levels', () => {
    expect(SEVERITY_CONFIG.P1).toBeDefined();
    expect(SEVERITY_CONFIG.P2).toBeDefined();
    expect(SEVERITY_CONFIG.P3).toBeDefined();
  });

  it('P1 has correct label and styling', () => {
    expect(SEVERITY_CONFIG.P1.label).toBe('Critical');
    expect(SEVERITY_CONFIG.P1.className).toContain('red');
    expect(SEVERITY_CONFIG.P1.toastType).toBe('error');
  });

  it('P2 has correct label and styling', () => {
    expect(SEVERITY_CONFIG.P2.label).toBe('Warning');
    expect(SEVERITY_CONFIG.P2.className).toContain('orange');
    expect(SEVERITY_CONFIG.P2.toastType).toBe('warning');
  });

  it('P3 has correct label and no toast', () => {
    expect(SEVERITY_CONFIG.P3.label).toBe('Info');
    expect(SEVERITY_CONFIG.P3.className).toContain('yellow');
    expect(SEVERITY_CONFIG.P3.toastType).toBeNull();
  });
});

describe('CATEGORY_LABELS', () => {
  it('has labels for all categories', () => {
    expect(CATEGORY_LABELS.failure).toBe('Failure');
    expect(CATEGORY_LABELS.sla).toBe('SLA');
    expect(CATEGORY_LABELS.cost).toBe('Cost');
    expect(CATEGORY_LABELS.cluster).toBe('Cluster');
  });

  it('has exactly 4 categories', () => {
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(4);
  });
});

describe('fetchAlerts', () => {
  const mockResponse = {
    alerts: [createAlert()],
    total: 1,
    by_severity: { P1: 1, P2: 0, P3: 0 },
  };

  it('fetches alerts from /api/alerts', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchAlerts();
    expect(mockFetch).toHaveBeenCalledWith('/api/alerts');
    expect(result).toEqual(mockResponse);
  });

  it('includes severity filter in query params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await fetchAlerts({ severity: ['P1', 'P2'] });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/alerts\?.*severity=P1.*severity=P2/)
    );
  });

  it('includes category filter in query params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await fetchAlerts({ category: ['failure', 'sla'] });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/alerts\?.*category=failure.*category=sla/)
    );
  });

  it('includes acknowledged filter in query params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await fetchAlerts({ acknowledged: false });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/alerts\?.*acknowledged=false/)
    );
  });

  it('includes workspace_id filter in query params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await fetchAlerts({ workspaceId: 'ws-123' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/alerts\?.*workspace_id=ws-123/)
    );
  });

  it('throws error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
    });

    await expect(fetchAlerts()).rejects.toThrow('Failed to fetch alerts');
  });
});

describe('acknowledgeAlert', () => {
  const mockAlert = createAlert({ acknowledged: true, acknowledged_at: '2024-01-15T12:00:00Z' });

  it('posts to /api/alerts/:id/acknowledge', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAlert),
    });

    const result = await acknowledgeAlert('alert-123');
    expect(mockFetch).toHaveBeenCalledWith('/api/alerts/alert-123/acknowledge', {
      method: 'POST',
    });
    expect(result).toEqual(mockAlert);
  });

  it('throws error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
    });

    await expect(acknowledgeAlert('alert-123')).rejects.toThrow('Failed to acknowledge alert');
  });
});
