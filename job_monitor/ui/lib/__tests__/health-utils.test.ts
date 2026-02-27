/**
 * Tests for health-utils.ts
 *
 * Tests:
 * - getStatusColor traffic light logic
 * - formatDuration time formatting
 * - formatTimeAgo relative time
 * - isAnomalousDuration threshold detection
 * - formatAnomalyComparison ratio formatting
 * - STATUS_THRESHOLDS constants
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStatusColor,
  formatDuration,
  formatTimeAgo,
  isAnomalousDuration,
  formatAnomalyComparison,
  STATUS_THRESHOLDS,
} from '../health-utils';

describe('STATUS_THRESHOLDS', () => {
  it('has correct threshold values', () => {
    expect(STATUS_THRESHOLDS.green).toBe(90);
    expect(STATUS_THRESHOLDS.yellow).toBe(70);
    expect(STATUS_THRESHOLDS.red).toBe(0);
  });
});

describe('getStatusColor', () => {
  it('returns green for success rate >= 90%', () => {
    expect(getStatusColor(90)).toBe('green');
    expect(getStatusColor(95)).toBe('green');
    expect(getStatusColor(100)).toBe('green');
  });

  it('returns yellow for success rate 70-89%', () => {
    expect(getStatusColor(70)).toBe('yellow');
    expect(getStatusColor(80)).toBe('yellow');
    expect(getStatusColor(89)).toBe('yellow');
    expect(getStatusColor(89.9)).toBe('yellow');
  });

  it('returns red for success rate < 70%', () => {
    expect(getStatusColor(0)).toBe('red');
    expect(getStatusColor(50)).toBe('red');
    expect(getStatusColor(69)).toBe('red');
    expect(getStatusColor(69.9)).toBe('red');
  });

  it('handles boundary cases exactly', () => {
    // Exactly at boundaries
    expect(getStatusColor(90)).toBe('green');
    expect(getStatusColor(70)).toBe('yellow');
  });
});

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('formats minutes only', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(3540)).toBe('59m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(7200)).toBe('2h');
    expect(formatDuration(7320)).toBe('2h 2m');
  });

  it('formats hours without trailing minutes', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(7200)).toBe('2h');
  });

  it('handles zero seconds', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('handles negative values', () => {
    expect(formatDuration(-1)).toBe('--');
    expect(formatDuration(-3600)).toBe('--');
  });

  it('handles infinity', () => {
    expect(formatDuration(Infinity)).toBe('--');
    expect(formatDuration(-Infinity)).toBe('--');
  });

  it('handles large values', () => {
    expect(formatDuration(86400)).toBe('24h'); // 1 day
    expect(formatDuration(172800)).toBe('48h'); // 2 days
  });
});

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for recent times', () => {
    expect(formatTimeAgo('2024-01-15T11:59:30Z')).toBe('just now');
    expect(formatTimeAgo('2024-01-15T12:00:00Z')).toBe('just now');
  });

  it('formats minutes ago', () => {
    expect(formatTimeAgo('2024-01-15T11:59:00Z')).toBe('1m ago');
    expect(formatTimeAgo('2024-01-15T11:30:00Z')).toBe('30m ago');
    expect(formatTimeAgo('2024-01-15T11:01:00Z')).toBe('59m ago');
  });

  it('formats hours ago', () => {
    expect(formatTimeAgo('2024-01-15T11:00:00Z')).toBe('1h ago');
    expect(formatTimeAgo('2024-01-15T06:00:00Z')).toBe('6h ago');
    expect(formatTimeAgo('2024-01-14T13:00:00Z')).toBe('23h ago');
  });

  it('formats days ago', () => {
    expect(formatTimeAgo('2024-01-14T12:00:00Z')).toBe('1d ago');
    expect(formatTimeAgo('2024-01-10T12:00:00Z')).toBe('5d ago');
    expect(formatTimeAgo('2024-01-01T12:00:00Z')).toBe('14d ago');
  });

  it('accepts Date objects', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    expect(formatTimeAgo(date)).toBe('2h ago');
  });

  it('handles future dates as "just now"', () => {
    expect(formatTimeAgo('2024-01-15T13:00:00Z')).toBe('just now');
  });
});

describe('isAnomalousDuration', () => {
  it('returns true when duration > 2x baseline', () => {
    expect(isAnomalousDuration(300, 100)).toBe(true); // 3x
    expect(isAnomalousDuration(250, 100)).toBe(true); // 2.5x
    expect(isAnomalousDuration(201, 100)).toBe(true); // 2.01x
  });

  it('returns false when duration <= 2x baseline', () => {
    expect(isAnomalousDuration(200, 100)).toBe(false); // exactly 2x
    expect(isAnomalousDuration(150, 100)).toBe(false); // 1.5x
    expect(isAnomalousDuration(100, 100)).toBe(false); // 1x
    expect(isAnomalousDuration(50, 100)).toBe(false); // 0.5x
  });

  it('returns false for zero baseline', () => {
    expect(isAnomalousDuration(100, 0)).toBe(false);
  });

  it('returns false for negative baseline', () => {
    expect(isAnomalousDuration(100, -50)).toBe(false);
  });

  it('returns false for infinite baseline', () => {
    expect(isAnomalousDuration(100, Infinity)).toBe(false);
  });
});

describe('formatAnomalyComparison', () => {
  it('formats ratio correctly', () => {
    expect(formatAnomalyComparison(200, 100)).toBe('2.0x baseline');
    expect(formatAnomalyComparison(150, 100)).toBe('1.5x baseline');
    expect(formatAnomalyComparison(333, 100)).toBe('3.3x baseline');
  });

  it('returns "no baseline" for zero baseline', () => {
    expect(formatAnomalyComparison(100, 0)).toBe('no baseline');
  });

  it('returns "no baseline" for negative baseline', () => {
    expect(formatAnomalyComparison(100, -50)).toBe('no baseline');
  });

  it('returns "no baseline" for infinite baseline', () => {
    expect(formatAnomalyComparison(100, Infinity)).toBe('no baseline');
  });

  it('formats small ratios correctly', () => {
    expect(formatAnomalyComparison(50, 100)).toBe('0.5x baseline');
    expect(formatAnomalyComparison(10, 100)).toBe('0.1x baseline');
  });

  it('formats large ratios correctly', () => {
    expect(formatAnomalyComparison(1000, 100)).toBe('10.0x baseline');
    expect(formatAnomalyComparison(5050, 100)).toBe('50.5x baseline');
  });
});
