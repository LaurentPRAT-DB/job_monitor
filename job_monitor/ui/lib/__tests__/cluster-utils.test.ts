/**
 * Tests for cluster-utils.ts
 *
 * Tests:
 * - UTILIZATION_THRESHOLDS constants
 * - getUtilizationColor color mapping
 * - getUtilizationLabel label mapping
 * - formatPercentage number formatting
 */

import { describe, it, expect } from 'vitest';
import {
  UTILIZATION_THRESHOLDS,
  getUtilizationColor,
  getUtilizationLabel,
  formatPercentage,
} from '../cluster-utils';

describe('UTILIZATION_THRESHOLDS', () => {
  it('has correct threshold values', () => {
    expect(UTILIZATION_THRESHOLDS.HIGH).toBe(60);
    expect(UTILIZATION_THRESHOLDS.MEDIUM).toBe(40);
  });
});

describe('getUtilizationColor', () => {
  it('returns gray for null', () => {
    expect(getUtilizationColor(null)).toBe('#9ca3af');
  });

  it('returns green for high utilization (>= 60%)', () => {
    expect(getUtilizationColor(60)).toBe('#22c55e');
    expect(getUtilizationColor(80)).toBe('#22c55e');
    expect(getUtilizationColor(100)).toBe('#22c55e');
  });

  it('returns yellow for medium utilization (40-59%)', () => {
    expect(getUtilizationColor(40)).toBe('#eab308');
    expect(getUtilizationColor(50)).toBe('#eab308');
    expect(getUtilizationColor(59)).toBe('#eab308');
  });

  it('returns red for low utilization (< 40%)', () => {
    expect(getUtilizationColor(0)).toBe('#ef4444');
    expect(getUtilizationColor(20)).toBe('#ef4444');
    expect(getUtilizationColor(39)).toBe('#ef4444');
  });
});

describe('getUtilizationLabel', () => {
  it('returns "No data" for null', () => {
    expect(getUtilizationLabel(null)).toBe('No data');
  });

  it('returns "Efficient" for high utilization (>= 60%)', () => {
    expect(getUtilizationLabel(60)).toBe('Efficient');
    expect(getUtilizationLabel(90)).toBe('Efficient');
  });

  it('returns "Fair" for medium utilization (40-59%)', () => {
    expect(getUtilizationLabel(40)).toBe('Fair');
    expect(getUtilizationLabel(55)).toBe('Fair');
  });

  it('returns "Low" for low utilization (< 40%)', () => {
    expect(getUtilizationLabel(0)).toBe('Low');
    expect(getUtilizationLabel(30)).toBe('Low');
  });
});

describe('formatPercentage', () => {
  it('returns "--" for null', () => {
    expect(formatPercentage(null)).toBe('--');
  });

  it('formats percentage with rounding', () => {
    expect(formatPercentage(50)).toBe('50%');
    expect(formatPercentage(75.4)).toBe('75%');
    expect(formatPercentage(75.6)).toBe('76%');
    expect(formatPercentage(0)).toBe('0%');
    expect(formatPercentage(100)).toBe('100%');
  });
});
