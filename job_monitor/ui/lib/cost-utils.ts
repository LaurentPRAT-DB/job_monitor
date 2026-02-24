/**
 * Cost monitoring utility functions and constants.
 * Provides DBU/dollar formatting, trend calculation, and SKU visualization helpers.
 */

/**
 * Format DBU value with appropriate precision.
 */
export function formatDBUs(dbus: number): string {
  if (dbus < 0.01) return '<0.01';
  if (dbus < 1) return dbus.toFixed(2);
  if (dbus < 10) return dbus.toFixed(1);
  return Math.round(dbus).toLocaleString();
}

/**
 * Format dollar amount from DBUs using configurable rate.
 */
export function formatCostDollars(dbus: number, dbuRate: number): string {
  const cost = dbus * dbuRate;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cost < 1 ? 2 : 0,
    maximumFractionDigits: cost < 1 ? 2 : 0,
  }).format(cost);
}

/**
 * Format cost with toggle between DBU and dollars.
 */
export function formatCost(
  dbus: number,
  showDollars: boolean,
  dbuRate: number
): string {
  if (showDollars && dbuRate > 0) {
    return formatCostDollars(dbus, dbuRate);
  }
  return `${formatDBUs(dbus)} DBU`;
}

/**
 * Calculate and format trend percentage.
 */
export function formatTrend(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(0)}%`;
}

/**
 * Format trend percentage from a pre-calculated value.
 */
export function formatTrendPercent(changePercent: number): string {
  const sign = changePercent > 0 ? '+' : '';
  return `${sign}${changePercent.toFixed(0)}%`;
}

/**
 * Get trend indicator color (cost increase is bad).
 */
export function getTrendColor(changePercent: number): string {
  if (changePercent > 10) return 'text-red-600';
  if (changePercent < -10) return 'text-green-600';
  return 'text-gray-500';
}

/**
 * Get trend background color for badges.
 */
export function getTrendBgColor(changePercent: number): string {
  if (changePercent > 10) return 'bg-red-50';
  if (changePercent < -10) return 'bg-green-50';
  return 'bg-gray-50';
}

/**
 * SKU category colors for visualization.
 */
export const SKU_COLORS: Record<string, string> = {
  'Jobs Compute': '#3b82f6',    // blue
  'All-Purpose': '#8b5cf6',     // violet
  'SQL Warehouse': '#06b6d4',   // cyan
  'Serverless': '#10b981',      // emerald
  'Other': '#6b7280',           // gray
};

/**
 * Get CSS class for SKU badge based on category.
 */
export function getSkuBadgeClass(skuCategory: string): string {
  switch (skuCategory) {
    case 'Jobs Compute':
      return 'bg-blue-100 text-blue-800';
    case 'All-Purpose':
      return 'bg-violet-100 text-violet-800';
    case 'SQL Warehouse':
      return 'bg-cyan-100 text-cyan-800';
    case 'Serverless':
      return 'bg-emerald-100 text-emerald-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
