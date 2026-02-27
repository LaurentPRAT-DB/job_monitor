/**
 * Tests for filter-utils.ts
 *
 * Tests:
 * - wildcardToRegex conversion
 * - matchesJobPatterns matching logic
 * - validateWildcardPattern validation
 * - getGranularity time range calculations
 * - getDaysFromRange conversions
 * - formatDateForAPI formatting
 */

import { describe, it, expect } from 'vitest';
import {
  wildcardToRegex,
  matchesJobPatterns,
  validateWildcardPattern,
  getGranularity,
  getDaysFromRange,
  formatDateForAPI,
  getDateRangeFromFilters,
  buildFilterQueryParams,
} from '../filter-utils';
import type { FilterState } from '../filter-context';

describe('wildcardToRegex', () => {
  it('converts exact match pattern', () => {
    const regex = wildcardToRegex('ETL-daily');
    expect(regex.test('ETL-daily')).toBe(true);
    expect(regex.test('ETL-daily-v2')).toBe(false);
    expect(regex.test('my-ETL-daily')).toBe(false);
  });

  it('converts prefix wildcard pattern', () => {
    const regex = wildcardToRegex('ETL-*');
    expect(regex.test('ETL-daily')).toBe(true);
    expect(regex.test('ETL-weekly')).toBe(true);
    expect(regex.test('ETL-')).toBe(true);
    expect(regex.test('my-ETL-daily')).toBe(false);
  });

  it('converts suffix wildcard pattern', () => {
    const regex = wildcardToRegex('*-daily');
    expect(regex.test('ETL-daily')).toBe(true);
    expect(regex.test('report-daily')).toBe(true);
    expect(regex.test('daily')).toBe(false);
    expect(regex.test('ETL-daily-v2')).toBe(false);
  });

  it('converts middle wildcard pattern', () => {
    const regex = wildcardToRegex('ETL-*-prod');
    expect(regex.test('ETL-daily-prod')).toBe(true);
    expect(regex.test('ETL-weekly-prod')).toBe(true);
    expect(regex.test('ETL--prod')).toBe(true);
    expect(regex.test('ETL-daily-dev')).toBe(false);
  });

  it('converts single character wildcard (?)', () => {
    const regex = wildcardToRegex('job-?');
    expect(regex.test('job-1')).toBe(true);
    expect(regex.test('job-A')).toBe(true);
    expect(regex.test('job-12')).toBe(false);
    expect(regex.test('job-')).toBe(false);
  });

  it('is case insensitive', () => {
    const regex = wildcardToRegex('ETL-*');
    expect(regex.test('ETL-daily')).toBe(true);
    expect(regex.test('etl-daily')).toBe(true);
    expect(regex.test('Etl-Daily')).toBe(true);
  });

  it('escapes special regex characters', () => {
    const regex = wildcardToRegex('job.name[1]');
    expect(regex.test('job.name[1]')).toBe(true);
    expect(regex.test('jobXname11')).toBe(false);
  });

  it('handles multiple wildcards', () => {
    const regex = wildcardToRegex('*-ETL-*');
    expect(regex.test('prod-ETL-daily')).toBe(true);
    expect(regex.test('dev-ETL-weekly')).toBe(true);
    expect(regex.test('ETL-daily')).toBe(false);
  });
});

describe('matchesJobPatterns', () => {
  it('returns true when patterns array is empty', () => {
    expect(matchesJobPatterns('any-job', [])).toBe(true);
  });

  it('matches exact pattern', () => {
    expect(matchesJobPatterns('ETL-daily', ['ETL-daily'])).toBe(true);
    expect(matchesJobPatterns('ETL-weekly', ['ETL-daily'])).toBe(false);
  });

  it('matches any of multiple patterns', () => {
    const patterns = ['ETL-*', 'report-*'];
    expect(matchesJobPatterns('ETL-daily', patterns)).toBe(true);
    expect(matchesJobPatterns('report-weekly', patterns)).toBe(true);
    expect(matchesJobPatterns('job-123', patterns)).toBe(false);
  });

  it('handles complex patterns', () => {
    const patterns = ['*-prod-*', 'ETL-*'];
    expect(matchesJobPatterns('job-prod-daily', patterns)).toBe(true);
    expect(matchesJobPatterns('ETL-dev', patterns)).toBe(true);
    expect(matchesJobPatterns('dev-job', patterns)).toBe(false);
  });
});

describe('validateWildcardPattern', () => {
  it('returns null for valid patterns', () => {
    expect(validateWildcardPattern('ETL-*')).toBeNull();
    expect(validateWildcardPattern('job-name')).toBeNull();
    expect(validateWildcardPattern('*')).toBeNull();
  });

  it('returns error for empty pattern', () => {
    expect(validateWildcardPattern('')).toBe('Pattern cannot be empty');
    expect(validateWildcardPattern('   ')).toBe('Pattern cannot be empty');
  });

  it('returns error for pattern exceeding max length', () => {
    const longPattern = 'a'.repeat(101);
    expect(validateWildcardPattern(longPattern)).toBe('Pattern is too long (max 100 characters)');
  });

  it('returns error for invalid characters', () => {
    expect(validateWildcardPattern('job<name')).toBe('Pattern contains invalid characters');
    expect(validateWildcardPattern('job|name')).toBe('Pattern contains invalid characters');
    expect(validateWildcardPattern('job;name')).toBe('Pattern contains invalid characters');
    expect(validateWildcardPattern('job`name')).toBe('Pattern contains invalid characters');
    expect(validateWildcardPattern('$job')).toBe('Pattern contains invalid characters');
  });

  it('allows wildcards and common characters', () => {
    expect(validateWildcardPattern('ETL-*-v2.1')).toBeNull();
    expect(validateWildcardPattern('job_name?')).toBeNull();
    expect(validateWildcardPattern('job-name-123')).toBeNull();
  });
});

describe('getGranularity', () => {
  it('returns hourly for 7d range', () => {
    expect(getGranularity('7d')).toBe('hourly');
  });

  it('returns daily for 30d range', () => {
    expect(getGranularity('30d')).toBe('daily');
  });

  it('returns weekly for 90d range', () => {
    expect(getGranularity('90d')).toBe('weekly');
  });

  it('returns hourly for custom range <= 7 days', () => {
    expect(getGranularity('custom', '2024-01-01', '2024-01-05')).toBe('hourly');
  });

  it('returns daily for custom range 8-30 days', () => {
    expect(getGranularity('custom', '2024-01-01', '2024-01-20')).toBe('daily');
  });

  it('returns weekly for custom range > 30 days', () => {
    expect(getGranularity('custom', '2024-01-01', '2024-03-01')).toBe('weekly');
  });
});

describe('getDaysFromRange', () => {
  it('returns correct days for each time range', () => {
    expect(getDaysFromRange('7d')).toBe(7);
    expect(getDaysFromRange('30d')).toBe(30);
    expect(getDaysFromRange('90d')).toBe(90);
  });

  it('returns 7 as default for custom range', () => {
    expect(getDaysFromRange('custom')).toBe(7);
  });
});

describe('formatDateForAPI', () => {
  it('formats date to yyyy-MM-dd string', () => {
    const date = new Date('2024-03-15T10:30:00');
    expect(formatDateForAPI(date)).toBe('2024-03-15');
  });

  it('handles month and day padding', () => {
    const date = new Date('2024-01-05T00:00:00');
    expect(formatDateForAPI(date)).toBe('2024-01-05');
  });
});

describe('getDateRangeFromFilters', () => {
  const baseFilters: FilterState = {
    timeRange: '7d',
    startDate: null,
    endDate: null,
    team: null,
    jobId: null,
    jobNamePatterns: [],
  };

  it('returns 7 days before end date for 7d range', () => {
    const filters: FilterState = { ...baseFilters, timeRange: '7d' };
    const { start, end } = getDateRangeFromFilters(filters);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it('returns 30 days before end date for 30d range', () => {
    const filters: FilterState = { ...baseFilters, timeRange: '30d' };
    const { start, end } = getDateRangeFromFilters(filters);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  it('returns 90 days before end date for 90d range', () => {
    const filters: FilterState = { ...baseFilters, timeRange: '90d' };
    const { start, end } = getDateRangeFromFilters(filters);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(90);
  });

  it('uses custom dates when timeRange is custom', () => {
    const filters: FilterState = {
      ...baseFilters,
      timeRange: 'custom',
      startDate: '2024-01-01',
      endDate: '2024-01-15',
    };
    const { start, end } = getDateRangeFromFilters(filters);
    // Check using local date formatting to avoid timezone issues
    const formatLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(formatLocal(start)).toBe('2024-01-01');
    expect(formatLocal(end)).toBe('2024-01-15');
  });

  it('uses endDate when provided', () => {
    const filters: FilterState = {
      ...baseFilters,
      timeRange: '7d',
      endDate: '2024-06-15',
    };
    const { end } = getDateRangeFromFilters(filters);
    // Check using local date formatting to avoid timezone issues
    const formatLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(formatLocal(end)).toBe('2024-06-15');
  });
});

describe('buildFilterQueryParams', () => {
  const baseFilters: FilterState = {
    timeRange: '7d',
    startDate: null,
    endDate: null,
    team: null,
    jobId: null,
    jobNamePatterns: [],
  };

  it('includes start_date and end_date always', () => {
    const params = buildFilterQueryParams(baseFilters);
    expect(params.has('start_date')).toBe(true);
    expect(params.has('end_date')).toBe(true);
  });

  it('includes team when provided', () => {
    const filters: FilterState = { ...baseFilters, team: 'data-eng' };
    const params = buildFilterQueryParams(filters);
    expect(params.get('team')).toBe('data-eng');
  });

  it('includes job_id when provided', () => {
    const filters: FilterState = { ...baseFilters, jobId: 'job-123' };
    const params = buildFilterQueryParams(filters);
    expect(params.get('job_id')).toBe('job-123');
  });

  it('includes job_name_patterns when provided', () => {
    const filters: FilterState = { ...baseFilters, jobNamePatterns: ['ETL-*', 'report-*'] };
    const params = buildFilterQueryParams(filters);
    expect(params.get('job_name_patterns')).toBe('ETL-*,report-*');
  });

  it('excludes optional params when not provided', () => {
    const params = buildFilterQueryParams(baseFilters);
    expect(params.has('team')).toBe(false);
    expect(params.has('job_id')).toBe(false);
    expect(params.has('job_name_patterns')).toBe(false);
  });
});
