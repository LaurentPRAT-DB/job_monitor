/**
 * Tests for cost-utils.ts
 *
 * Tests:
 * - formatDBUs number formatting
 * - formatCostDollars currency formatting
 * - formatCost toggle formatting
 * - formatTrend percentage calculations
 * - formatTrendPercent display
 * - getTrendColor CSS classes
 * - getTrendBgColor CSS classes
 * - getSkuBadgeClass CSS classes
 * - SKU_COLORS constants
 */

import { describe, it, expect } from 'vitest';
import {
  formatDBUs,
  formatCostDollars,
  formatCost,
  formatTrend,
  formatTrendPercent,
  getTrendColor,
  getTrendBgColor,
  getSkuBadgeClass,
  SKU_COLORS,
} from '../cost-utils';

describe('formatDBUs', () => {
  it('formats tiny values as <0.01', () => {
    expect(formatDBUs(0)).toBe('<0.01');
    expect(formatDBUs(0.001)).toBe('<0.01');
    expect(formatDBUs(0.009)).toBe('<0.01');
  });

  it('formats small values with 2 decimal places', () => {
    expect(formatDBUs(0.01)).toBe('0.01');
    expect(formatDBUs(0.5)).toBe('0.50');
    expect(formatDBUs(0.99)).toBe('0.99');
  });

  it('formats medium values with 1 decimal place', () => {
    expect(formatDBUs(1)).toBe('1.0');
    expect(formatDBUs(5.5)).toBe('5.5');
    expect(formatDBUs(9.99)).toBe('10.0');
  });

  it('formats large values as rounded integers with commas', () => {
    expect(formatDBUs(10)).toBe('10');
    expect(formatDBUs(100)).toBe('100');
    expect(formatDBUs(1000)).toBe('1,000');
    expect(formatDBUs(10000)).toBe('10,000');
    expect(formatDBUs(1000000)).toBe('1,000,000');
  });

  it('rounds large values appropriately', () => {
    expect(formatDBUs(99.5)).toBe('100');
    expect(formatDBUs(100.4)).toBe('100');
  });
});

describe('formatCostDollars', () => {
  it('formats small costs with decimals', () => {
    const result = formatCostDollars(1, 0.15);
    expect(result).toBe('$0.15');
  });

  it('formats larger costs without decimals', () => {
    const result = formatCostDollars(100, 0.15);
    expect(result).toBe('$15');
  });

  it('formats with different DBU rates', () => {
    expect(formatCostDollars(100, 0.10)).toBe('$10');
    expect(formatCostDollars(100, 0.20)).toBe('$20');
  });

  it('handles zero DBUs', () => {
    expect(formatCostDollars(0, 0.15)).toBe('$0.00');
  });

  it('formats large costs with commas', () => {
    const result = formatCostDollars(10000, 0.15);
    expect(result).toBe('$1,500');
  });
});

describe('formatCost', () => {
  it('returns DBU format when showDollars is false', () => {
    expect(formatCost(100, false, 0.15)).toBe('100 DBU');
  });

  it('returns dollar format when showDollars is true', () => {
    const result = formatCost(100, true, 0.15);
    expect(result).toBe('$15');
  });

  it('returns DBU format when rate is 0', () => {
    expect(formatCost(100, true, 0)).toBe('100 DBU');
  });

  it('returns DBU format when rate is negative', () => {
    expect(formatCost(100, true, -0.15)).toBe('100 DBU');
  });
});

describe('formatTrend', () => {
  it('calculates positive trend', () => {
    expect(formatTrend(150, 100)).toBe('+50%');
    expect(formatTrend(200, 100)).toBe('+100%');
  });

  it('calculates negative trend', () => {
    expect(formatTrend(50, 100)).toBe('-50%');
    expect(formatTrend(75, 100)).toBe('-25%');
  });

  it('handles no change', () => {
    expect(formatTrend(100, 100)).toBe('0%');
  });

  it('handles zero previous value', () => {
    expect(formatTrend(100, 0)).toBe('+100%');
    expect(formatTrend(0, 0)).toBe('0%');
  });

  it('rounds to whole numbers', () => {
    expect(formatTrend(133, 100)).toBe('+33%');
    expect(formatTrend(166.6, 100)).toBe('+67%');
  });
});

describe('formatTrendPercent', () => {
  it('formats positive trends with plus sign', () => {
    expect(formatTrendPercent(50)).toBe('+50%');
    expect(formatTrendPercent(100)).toBe('+100%');
    expect(formatTrendPercent(0.5)).toBe('+1%');
  });

  it('formats negative trends', () => {
    expect(formatTrendPercent(-50)).toBe('-50%');
    expect(formatTrendPercent(-25)).toBe('-25%');
  });

  it('formats zero without sign', () => {
    expect(formatTrendPercent(0)).toBe('0%');
  });

  it('rounds to whole numbers', () => {
    expect(formatTrendPercent(33.3)).toBe('+33%');
    expect(formatTrendPercent(-33.7)).toBe('-34%');
  });
});

describe('getTrendColor', () => {
  it('returns red for increase > 10%', () => {
    expect(getTrendColor(11)).toBe('text-red-600');
    expect(getTrendColor(50)).toBe('text-red-600');
    expect(getTrendColor(100)).toBe('text-red-600');
  });

  it('returns green for decrease > 10%', () => {
    expect(getTrendColor(-11)).toBe('text-green-600');
    expect(getTrendColor(-50)).toBe('text-green-600');
  });

  it('returns gray for changes <= 10%', () => {
    expect(getTrendColor(10)).toBe('text-gray-500');
    expect(getTrendColor(-10)).toBe('text-gray-500');
    expect(getTrendColor(0)).toBe('text-gray-500');
    expect(getTrendColor(5)).toBe('text-gray-500');
  });
});

describe('getTrendBgColor', () => {
  it('returns red background for increase > 10%', () => {
    expect(getTrendBgColor(11)).toBe('bg-red-50');
    expect(getTrendBgColor(50)).toBe('bg-red-50');
  });

  it('returns green background for decrease > 10%', () => {
    expect(getTrendBgColor(-11)).toBe('bg-green-50');
    expect(getTrendBgColor(-50)).toBe('bg-green-50');
  });

  it('returns gray background for small changes', () => {
    expect(getTrendBgColor(10)).toBe('bg-gray-50');
    expect(getTrendBgColor(-10)).toBe('bg-gray-50');
    expect(getTrendBgColor(0)).toBe('bg-gray-50');
  });
});

describe('getSkuBadgeClass', () => {
  it('returns blue for Jobs Compute', () => {
    expect(getSkuBadgeClass('Jobs Compute')).toBe('bg-blue-100 text-blue-800');
  });

  it('returns violet for All-Purpose', () => {
    expect(getSkuBadgeClass('All-Purpose')).toBe('bg-violet-100 text-violet-800');
  });

  it('returns cyan for SQL Warehouse', () => {
    expect(getSkuBadgeClass('SQL Warehouse')).toBe('bg-cyan-100 text-cyan-800');
  });

  it('returns emerald for Serverless', () => {
    expect(getSkuBadgeClass('Serverless')).toBe('bg-emerald-100 text-emerald-800');
  });

  it('returns gray for unknown SKUs', () => {
    expect(getSkuBadgeClass('Unknown')).toBe('bg-gray-100 text-gray-800');
    expect(getSkuBadgeClass('Other')).toBe('bg-gray-100 text-gray-800');
  });
});

describe('SKU_COLORS', () => {
  it('has colors for all standard SKU categories', () => {
    expect(SKU_COLORS['Jobs Compute']).toBeDefined();
    expect(SKU_COLORS['All-Purpose']).toBeDefined();
    expect(SKU_COLORS['SQL Warehouse']).toBeDefined();
    expect(SKU_COLORS['Serverless']).toBeDefined();
    expect(SKU_COLORS['Other']).toBeDefined();
  });

  it('has 5 color entries', () => {
    expect(Object.keys(SKU_COLORS)).toHaveLength(5);
  });

  it('uses hex color format', () => {
    Object.values(SKU_COLORS).forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});
