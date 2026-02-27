/**
 * Tests for pipeline-utils.ts
 *
 * Tests:
 * - ROW_COUNT_ANOMALY_THRESHOLD constant
 * - formatRowCount number formatting (K, M, B)
 * - formatDeltaPercent delta formatting
 * - getDeltaColor color logic
 * - getChangeTypeColor schema change colors
 * - getChangeTypeLabel schema change labels
 */

import { describe, it, expect } from 'vitest';
import {
  ROW_COUNT_ANOMALY_THRESHOLD,
  formatRowCount,
  formatDeltaPercent,
  getDeltaColor,
  getChangeTypeColor,
  getChangeTypeLabel,
} from '../pipeline-utils';

describe('ROW_COUNT_ANOMALY_THRESHOLD', () => {
  it('is set to 20 percent', () => {
    expect(ROW_COUNT_ANOMALY_THRESHOLD).toBe(20);
  });
});

describe('formatRowCount', () => {
  it('formats small numbers as-is', () => {
    expect(formatRowCount(0)).toBe('0');
    expect(formatRowCount(100)).toBe('100');
    expect(formatRowCount(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(formatRowCount(1000)).toBe('1.0K');
    expect(formatRowCount(1500)).toBe('1.5K');
    expect(formatRowCount(999999)).toBe('1000.0K');
  });

  it('formats millions with M suffix', () => {
    expect(formatRowCount(1000000)).toBe('1.0M');
    expect(formatRowCount(5500000)).toBe('5.5M');
    expect(formatRowCount(999999999)).toBe('1000.0M');
  });

  it('formats billions with B suffix', () => {
    expect(formatRowCount(1000000000)).toBe('1.0B');
    expect(formatRowCount(2500000000)).toBe('2.5B');
  });
});

describe('formatDeltaPercent', () => {
  it('formats positive deltas with + sign', () => {
    expect(formatDeltaPercent(10)).toBe('+10.0%');
    expect(formatDeltaPercent(5.5)).toBe('+5.5%');
    expect(formatDeltaPercent(0)).toBe('+0.0%');
  });

  it('formats negative deltas with - sign', () => {
    expect(formatDeltaPercent(-10)).toBe('-10.0%');
    expect(formatDeltaPercent(-25.7)).toBe('-25.7%');
  });
});

describe('getDeltaColor', () => {
  it('returns gray when not anomaly', () => {
    expect(getDeltaColor(50, false)).toBe('text-gray-600');
    expect(getDeltaColor(-50, false)).toBe('text-gray-600');
  });

  it('returns amber for positive anomaly', () => {
    expect(getDeltaColor(25, true)).toBe('text-amber-600');
    expect(getDeltaColor(100, true)).toBe('text-amber-600');
  });

  it('returns red for negative anomaly', () => {
    expect(getDeltaColor(-25, true)).toBe('text-red-600');
    expect(getDeltaColor(-100, true)).toBe('text-red-600');
  });
});

describe('getChangeTypeColor', () => {
  it('returns green for added columns', () => {
    expect(getChangeTypeColor('added')).toBe('text-green-600');
  });

  it('returns red for removed columns', () => {
    expect(getChangeTypeColor('removed')).toBe('text-red-600');
  });

  it('returns amber for type changes', () => {
    expect(getChangeTypeColor('type_changed')).toBe('text-amber-600');
  });

  it('returns gray for unknown change types', () => {
    expect(getChangeTypeColor('unknown')).toBe('text-gray-600');
  });
});

describe('getChangeTypeLabel', () => {
  it('returns correct labels for known types', () => {
    expect(getChangeTypeLabel('added')).toBe('Added');
    expect(getChangeTypeLabel('removed')).toBe('Removed');
    expect(getChangeTypeLabel('type_changed')).toBe('Type changed');
  });

  it('returns input for unknown types', () => {
    expect(getChangeTypeLabel('custom_type')).toBe('custom_type');
  });
});
