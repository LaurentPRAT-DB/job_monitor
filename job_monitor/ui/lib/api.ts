/**
 * API client for Job Monitor backend.
 */

const API_BASE = "";

export interface UserInfo {
  email: string;
  display_name: string | null;
  workspace_host: string | null;
  workspace_name: string | null;
}

export interface HealthResponse {
  status: string;
  version: string;
  user: string | null;
}

/**
 * Fetch wrapper with error handling.
 */
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get current user information.
 */
export async function getCurrentUser(): Promise<UserInfo> {
  return fetchApi<UserInfo>("/api/me");
}

/**
 * Get health status.
 */
export async function getHealth(): Promise<HealthResponse> {
  return fetchApi<HealthResponse>("/api/health");
}

/**
 * Job tags update request.
 */
export interface TagUpdateRequest {
  sla_minutes?: number;
  team?: string;
  owner?: string;
}

/**
 * Job tags update response.
 */
export interface TagUpdateResponse {
  job_id: string;
  tags: Record<string, string>;
}

/**
 * Update job tags (SLA, team, owner).
 * Uses PATCH to merge with existing tags.
 */
export async function updateJobTags(
  jobId: string,
  tags: TagUpdateRequest
): Promise<TagUpdateResponse> {
  return fetchApi<TagUpdateResponse>(`/api/jobs/${jobId}/tags`, {
    method: "PATCH",
    body: JSON.stringify(tags),
  });
}
