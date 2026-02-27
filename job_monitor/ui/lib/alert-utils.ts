/**
 * Alert utility types, API functions, and UI configuration.
 */
import { formatTimeAgo } from "./health-utils";

// Re-export formatTimeAgo for convenience
export { formatTimeAgo };

/**
 * Alert severity levels matching backend models.
 */
export type AlertSeverity = "P1" | "P2" | "P3";

/**
 * Alert category types matching backend models.
 */
export type AlertCategory = "failure" | "sla" | "cost" | "cluster";

/**
 * Alert interface matching backend Alert model.
 */
export interface Alert {
  id: string;
  job_id: string;
  job_name: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  remediation: string;
  created_at: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  condition_key: string;
}

/**
 * Response from GET /api/alerts endpoint.
 */
export interface AlertListResponse {
  alerts: Alert[];
  total: number;
  by_severity: Record<AlertSeverity, number>;
  // Pagination fields
  page: number;
  page_size: number;
  has_more: boolean;
}

/**
 * Fetch alerts from the API with optional filters.
 */
export async function fetchAlerts(params?: {
  severity?: AlertSeverity[];
  category?: AlertCategory[];
  acknowledged?: boolean;
  workspaceId?: string | null;  // null = all workspaces, string = specific workspace
  page?: number;
  page_size?: number;
}): Promise<AlertListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.severity) {
    params.severity.forEach((s) => searchParams.append("severity", s));
  }
  if (params?.category) {
    params.category.forEach((c) => searchParams.append("category", c));
  }
  if (params?.acknowledged !== undefined) {
    searchParams.set("acknowledged", String(params.acknowledged));
  }
  // Pass workspace_id if provided (null means no filter = all workspaces)
  if (params?.workspaceId) {
    searchParams.set("workspace_id", params.workspaceId);
  }
  // Pagination parameters
  if (params?.page) {
    searchParams.set("page", String(params.page));
  }
  if (params?.page_size) {
    searchParams.set("page_size", String(params.page_size));
  }
  const queryString = searchParams.toString();
  const url = queryString ? `/api/alerts?${queryString}` : "/api/alerts";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch alerts");
  }
  return response.json();
}

/**
 * Acknowledge an alert by ID.
 */
export async function acknowledgeAlert(alertId: string): Promise<Alert> {
  const response = await fetch(`/api/alerts/${alertId}/acknowledge`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to acknowledge alert");
  }
  return response.json();
}

/**
 * Severity configuration for UI rendering.
 * Provides consistent styling and behavior across components.
 */
export const SEVERITY_CONFIG = {
  P1: {
    label: "Critical",
    className: "bg-red-600 text-white hover:bg-red-700",
    cardClassName: "border-red-200 bg-red-50",
    toastType: "error" as const,
    toastDuration: 10000,
  },
  P2: {
    label: "Warning",
    className: "bg-orange-500 text-white hover:bg-orange-600",
    cardClassName: "border-orange-200 bg-orange-50",
    toastType: "warning" as const,
    toastDuration: 5000,
  },
  P3: {
    label: "Info",
    className: "bg-yellow-500 text-black hover:bg-yellow-600",
    cardClassName: "border-yellow-200 bg-yellow-50",
    toastType: null, // No toast for P3
    toastDuration: 0,
  },
} as const;

/**
 * Human-readable labels for alert categories.
 */
export const CATEGORY_LABELS: Record<AlertCategory, string> = {
  failure: "Failure",
  sla: "SLA",
  cost: "Cost",
  cluster: "Cluster",
};

/**
 * Get the count of unacknowledged alerts.
 */
export function getUnacknowledgedCount(alerts: Alert[]): number {
  return alerts.filter((a) => !a.acknowledged).length;
}

/**
 * Group alerts by severity for display.
 */
export function groupAlertsBySeverity(
  alerts: Alert[]
): Record<AlertSeverity, Alert[]> {
  const grouped: Record<AlertSeverity, Alert[]> = {
    P1: [],
    P2: [],
    P3: [],
  };

  for (const alert of alerts) {
    grouped[alert.severity].push(alert);
  }

  return grouped;
}

/**
 * Get alerts for a specific job.
 */
export function getAlertsForJob(alerts: Alert[], jobId: string): Alert[] {
  return alerts.filter((a) => a.job_id === jobId);
}

/**
 * Get the highest severity level from a list of alerts.
 * Returns null if no alerts.
 */
export function getHighestSeverity(alerts: Alert[]): AlertSeverity | null {
  if (alerts.length === 0) return null;
  if (alerts.some((a) => a.severity === "P1")) return "P1";
  if (alerts.some((a) => a.severity === "P2")) return "P2";
  return "P3";
}
