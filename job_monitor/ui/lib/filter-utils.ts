import { subDays, format, parseISO } from 'date-fns';
import type { FilterState } from './filter-context';

export type Granularity = 'hourly' | 'daily' | 'weekly';

export function getGranularity(timeRange: FilterState['timeRange'], startDate?: string | null, endDate?: string | null): Granularity {
  if (timeRange === 'custom' && startDate && endDate) {
    const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 7) return 'hourly';
    if (days <= 30) return 'daily';
    return 'weekly';
  }
  if (timeRange === '7d') return 'hourly';
  if (timeRange === '30d') return 'daily';
  return 'weekly';  // 90d
}

export function getDaysFromRange(timeRange: FilterState['timeRange']): number {
  switch (timeRange) {
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    default: return 7;
  }
}

export function getDateRangeFromFilters(filters: FilterState): { start: Date; end: Date } {
  const end = filters.endDate ? parseISO(filters.endDate) : new Date();

  if (filters.timeRange === 'custom' && filters.startDate) {
    return { start: parseISO(filters.startDate), end };
  }

  const days = getDaysFromRange(filters.timeRange);
  return { start: subDays(end, days), end };
}

export function formatDateForAPI(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function buildFilterQueryParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.team) params.set('team', filters.team);
  if (filters.jobId) params.set('job_id', filters.jobId);
  if (filters.jobNamePatterns.length > 0) {
    params.set('job_name_patterns', filters.jobNamePatterns.join(','));
  }

  const { start, end } = getDateRangeFromFilters(filters);
  params.set('start_date', formatDateForAPI(start));
  params.set('end_date', formatDateForAPI(end));

  return params;
}

/**
 * Convert a wildcard pattern to a RegExp.
 * Supports * (match any characters) and ? (match single character).
 * Examples:
 *   "ETL-*" -> /^ETL-.*$/i
 *   "*-daily" -> /^.*-daily$/i
 *   "job-?" -> /^job-.$/i
 */
export function wildcardToRegex(pattern: string): RegExp {
  // Escape special regex characters except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Convert wildcards: * -> .*, ? -> .
  const regexPattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regexPattern}$`, 'i');
}

/**
 * Check if a job name matches any of the given wildcard patterns.
 * Returns true if patterns array is empty (no filtering).
 */
export function matchesJobPatterns(jobName: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  return patterns.some((pattern) => wildcardToRegex(pattern).test(jobName));
}

/**
 * Validate a wildcard pattern for basic correctness.
 * Returns an error message if invalid, or null if valid.
 */
export function validateWildcardPattern(pattern: string): string | null {
  if (!pattern.trim()) {
    return 'Pattern cannot be empty';
  }
  if (pattern.length > 100) {
    return 'Pattern is too long (max 100 characters)';
  }
  // Check for invalid characters
  if (/[<>|&;`$]/.test(pattern)) {
    return 'Pattern contains invalid characters';
  }
  return null;
}
