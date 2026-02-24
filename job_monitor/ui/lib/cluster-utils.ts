/**
 * Cluster utilization utilities.
 * Color scheme: INVERTED traffic light
 * - Green = HIGH utilization (efficient, good)
 * - Yellow = MEDIUM utilization (could optimize)
 * - Red = LOW utilization (<40%, wasting resources)
 */

// Thresholds for utilization coloring (inverted: low = bad)
export const UTILIZATION_THRESHOLDS = {
  HIGH: 60,      // >= 60% = Green (efficient)
  MEDIUM: 40,    // >= 40% = Yellow (could optimize)
  // < 40% = Red (over-provisioned, wasting resources)
} as const;

export function getUtilizationColor(percentage: number | null): string {
  if (percentage === null) return '#9ca3af'; // Gray for no data
  if (percentage >= UTILIZATION_THRESHOLDS.HIGH) return '#22c55e'; // Green
  if (percentage >= UTILIZATION_THRESHOLDS.MEDIUM) return '#eab308'; // Yellow
  return '#ef4444'; // Red
}

export function getUtilizationLabel(percentage: number | null): string {
  if (percentage === null) return 'No data';
  if (percentage >= UTILIZATION_THRESHOLDS.HIGH) return 'Efficient';
  if (percentage >= UTILIZATION_THRESHOLDS.MEDIUM) return 'Fair';
  return 'Low';
}

export function formatPercentage(value: number | null): string {
  if (value === null) return '--';
  return `${Math.round(value)}%`;
}

// Types matching backend ClusterUtilization model
export interface ClusterUtilization {
  job_id: string;
  driver_cpu_percent: number | null;
  driver_memory_percent: number | null;
  worker_cpu_percent: number | null;
  worker_memory_percent: number | null;
  is_over_provisioned: boolean;
  recommendation: string | null;
  runs_analyzed: number;
}
