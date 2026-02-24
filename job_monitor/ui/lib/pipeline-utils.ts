/**
 * Pipeline integrity utilities.
 * Types and helpers for row count tracking and schema drift detection.
 */

// Row count delta threshold for anomaly detection
export const ROW_COUNT_ANOMALY_THRESHOLD = 20; // +/- 20%

// Types matching backend models
export interface RowCountDelta {
  table_name: string;
  current_row_count: number;
  baseline_row_count: number;
  delta_percent: number;
  is_anomaly: boolean;
  trend: { date: string; count: number }[];
}

export interface ColumnChange {
  column_name: string;
  change_type: 'added' | 'removed' | 'type_changed';
  old_type: string | null;
  new_type: string | null;
}

export interface SchemaDrift {
  table_name: string;
  has_drift: boolean;
  added_columns: string[];
  removed_columns: string[];
  type_changes: ColumnChange[];
  detected_at: string;
}

// Formatting helpers
export function formatRowCount(count: number): string {
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(1)}B`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

export function formatDeltaPercent(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

export function getDeltaColor(delta: number, isAnomaly: boolean): string {
  if (!isAnomaly) return 'text-gray-600';
  return delta > 0 ? 'text-amber-600' : 'text-red-600';
}

export function getChangeTypeColor(changeType: string): string {
  switch (changeType) {
    case 'added': return 'text-green-600';
    case 'removed': return 'text-red-600';
    case 'type_changed': return 'text-amber-600';
    default: return 'text-gray-600';
  }
}

export function getChangeTypeLabel(changeType: string): string {
  switch (changeType) {
    case 'added': return 'Added';
    case 'removed': return 'Removed';
    case 'type_changed': return 'Type changed';
    default: return changeType;
  }
}
