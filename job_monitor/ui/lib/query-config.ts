/**
 * TanStack Query configuration with tiered caching strategy.
 *
 * Data is categorized by volatility:
 * - STATIC: Historical data that never changes (completed runs, past metrics)
 * - SEMI_LIVE: Data that updates periodically (job health, costs)
 * - LIVE: Data that needs freshness (alerts, running jobs)
 */

import type { UseQueryOptions } from '@tanstack/react-query'

/**
 * Query option presets for different data volatility levels.
 *
 * staleTime: How long data is considered fresh (won't refetch)
 * gcTime: How long inactive data stays in cache before garbage collection
 */
export const queryPresets = {
  /**
   * Static/historical data - never changes once created.
   * Examples: completed job runs, historical metrics, past alerts
   *
   * - staleTime: Infinity (never automatically refetch)
   * - gcTime: 30 minutes (keep in cache while navigating)
   * - refetchOnWindowFocus: false (no need to refresh)
   */
  static: {
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  } as const,

  /**
   * Semi-live data - updates periodically (every 5-15 min from system tables).
   * Examples: job health metrics, cost summaries, job lists
   *
   * - staleTime: 5 minutes (matches system table latency)
   * - gcTime: 15 minutes (survives navigation)
   * - refetchOnWindowFocus: true (refresh when user returns)
   */
  semiLive: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
  } as const,

  /**
   * Live data - needs freshness, changes frequently.
   * Examples: active alerts, currently running jobs, real-time status
   *
   * - staleTime: 1 minute (refresh more often)
   * - gcTime: 5 minutes
   * - refetchOnWindowFocus: true
   */
  live: {
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
  } as const,

  /**
   * User session data - rarely changes during a session.
   * Examples: current user info, workspace config
   *
   * - staleTime: 30 minutes
   * - gcTime: 60 minutes
   * - refetchOnWindowFocus: false
   */
  session: {
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  } as const,
} satisfies Record<string, Partial<UseQueryOptions>>

/**
 * Query key factories for consistent cache key generation.
 * Using factories ensures cache hits across components.
 */
export const queryKeys = {
  // Health metrics
  healthMetrics: {
    all: ['health-metrics'] as const,
    list: (days: number) => ['health-metrics', { days }] as const,
    detail: (jobId: string) => ['health-metrics', 'detail', jobId] as const,
    duration: (jobId: string) => ['health-metrics', 'duration', jobId] as const,
  },

  // Alerts
  alerts: {
    all: ['alerts'] as const,
    list: (filters?: { severity?: string; category?: string }) =>
      ['alerts', filters ?? {}] as const,
    detail: (alertId: string) => ['alerts', 'detail', alertId] as const,
  },

  // Costs
  costs: {
    all: ['costs'] as const,
    summary: () => ['costs', 'summary'] as const,
    byTeam: () => ['costs', 'by-team'] as const,
    byJob: (jobId: string) => ['costs', 'job', jobId] as const,
    anomalies: () => ['costs', 'anomalies'] as const,
  },

  // Jobs
  jobs: {
    all: ['jobs'] as const,
    list: () => ['jobs', 'list'] as const,
    detail: (jobId: string) => ['jobs', 'detail', jobId] as const,
    runs: (jobId: string) => ['jobs', 'runs', jobId] as const,
    running: () => ['jobs', 'running'] as const,
  },

  // Historical data (static - never changes)
  historical: {
    all: ['historical'] as const,
    runs: (jobId: string, startDate: string, endDate: string) =>
      ['historical', 'runs', jobId, startDate, endDate] as const,
    metrics: (startDate: string, endDate: string) =>
      ['historical', 'metrics', startDate, endDate] as const,
  },

  // Pipeline integrity
  pipeline: {
    all: ['pipeline'] as const,
    status: () => ['pipeline', 'status'] as const,
    tables: (jobId: string) => ['pipeline', 'tables', jobId] as const,
  },

  // User/session
  user: {
    current: () => ['current-user'] as const,
  },

  // Cache status
  cache: {
    status: () => ['cache', 'status'] as const,
  },
} as const

/**
 * Helper to create query options with a preset.
 * Merges preset defaults with custom options.
 */
export function withPreset<T>(
  preset: keyof typeof queryPresets,
  options: Omit<UseQueryOptions<T>, 'queryKey'>
): Omit<UseQueryOptions<T>, 'queryKey'> {
  return {
    ...queryPresets[preset],
    ...options,
  }
}

/**
 * Default query client options.
 * Applied globally in main.tsx.
 */
export const defaultQueryClientOptions = {
  queries: {
    // Default to semi-live for most queries
    staleTime: queryPresets.semiLive.staleTime,
    gcTime: queryPresets.semiLive.gcTime,
    refetchOnWindowFocus: true,
    // Retry failed queries up to 2 times
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
  },
}
