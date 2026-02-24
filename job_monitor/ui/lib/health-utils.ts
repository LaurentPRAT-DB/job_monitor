/**
 * Health monitoring utility functions and constants.
 */

/**
 * Success rate thresholds for traffic light status.
 */
export const STATUS_THRESHOLDS = {
  green: 90,  // >= 90% success rate
  yellow: 70, // 70-89% success rate
  red: 0,     // < 70% success rate
} as const;

export type StatusColor = "green" | "yellow" | "red";

/**
 * Get status color based on success rate.
 * Green >= 90%, Yellow 70-89%, Red < 70%
 */
export function getStatusColor(successRate: number): StatusColor {
  if (successRate >= STATUS_THRESHOLDS.green) {
    return "green";
  }
  if (successRate >= STATUS_THRESHOLDS.yellow) {
    return "yellow";
  }
  return "red";
}

/**
 * Format duration in seconds to human-readable string.
 * Examples: "2h 15m", "45m", "30s"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) {
    return "--";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${secs}s`;
}

/**
 * Format a date/time to relative time ago string.
 * Examples: "2h ago", "1d ago", "5m ago"
 */
export function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const then = typeof date === "string" ? new Date(date) : date;

  const diffMs = now.getTime() - then.getTime();

  if (diffMs < 0) {
    return "just now";
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  }
  if (diffHours > 0) {
    return `${diffHours}h ago`;
  }
  if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  }
  return "just now";
}

/**
 * Check if duration is anomalous (> 2x baseline).
 */
export function isAnomalousDuration(
  durationSeconds: number,
  baselineMedianSeconds: number
): boolean {
  if (baselineMedianSeconds <= 0 || !isFinite(baselineMedianSeconds)) {
    return false;
  }
  return durationSeconds > 2 * baselineMedianSeconds;
}

/**
 * Format anomaly comparison string.
 * Example: "2.3x baseline"
 */
export function formatAnomalyComparison(
  durationSeconds: number,
  baselineMedianSeconds: number
): string {
  if (baselineMedianSeconds <= 0 || !isFinite(baselineMedianSeconds)) {
    return "no baseline";
  }
  const ratio = durationSeconds / baselineMedianSeconds;
  return `${ratio.toFixed(1)}x baseline`;
}
