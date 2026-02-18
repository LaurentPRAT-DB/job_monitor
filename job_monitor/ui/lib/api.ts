/**
 * API client for Job Monitor backend.
 */

const API_BASE = "";

export interface UserInfo {
  email: string;
  display_name: string | null;
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
