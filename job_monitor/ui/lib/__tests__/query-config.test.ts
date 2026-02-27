/**
 * Tests for query-config.ts
 *
 * Tests:
 * - queryPresets timing values
 * - queryKeys factory functions
 * - withPreset helper
 * - defaultQueryClientOptions
 */

import { describe, it, expect } from 'vitest';
import {
  queryPresets,
  queryKeys,
  withPreset,
  defaultQueryClientOptions,
} from '../query-config';

describe('queryPresets', () => {
  describe('static preset', () => {
    it('has infinite staleTime', () => {
      expect(queryPresets.static.staleTime).toBe(Infinity);
    });

    it('has 30 minute gcTime', () => {
      expect(queryPresets.static.gcTime).toBe(30 * 60 * 1000);
    });

    it('disables all refetch options', () => {
      expect(queryPresets.static.refetchOnWindowFocus).toBe(false);
      expect(queryPresets.static.refetchOnMount).toBe(false);
      expect(queryPresets.static.refetchOnReconnect).toBe(false);
    });
  });

  describe('semiLive preset', () => {
    it('has 5 minute staleTime', () => {
      expect(queryPresets.semiLive.staleTime).toBe(5 * 60 * 1000);
    });

    it('has 15 minute gcTime', () => {
      expect(queryPresets.semiLive.gcTime).toBe(15 * 60 * 1000);
    });

    it('enables all refetch options', () => {
      expect(queryPresets.semiLive.refetchOnWindowFocus).toBe(true);
      expect(queryPresets.semiLive.refetchOnMount).toBe(true);
      expect(queryPresets.semiLive.refetchOnReconnect).toBe(true);
    });
  });

  describe('slow preset', () => {
    it('has 10 minute staleTime', () => {
      expect(queryPresets.slow.staleTime).toBe(10 * 60 * 1000);
    });

    it('has 30 minute gcTime', () => {
      expect(queryPresets.slow.gcTime).toBe(30 * 60 * 1000);
    });

    it('disables all refetch options', () => {
      expect(queryPresets.slow.refetchOnWindowFocus).toBe(false);
      expect(queryPresets.slow.refetchOnMount).toBe(false);
      expect(queryPresets.slow.refetchOnReconnect).toBe(false);
    });
  });

  describe('live preset', () => {
    it('has 1 minute staleTime', () => {
      expect(queryPresets.live.staleTime).toBe(60 * 1000);
    });

    it('has 5 minute gcTime', () => {
      expect(queryPresets.live.gcTime).toBe(5 * 60 * 1000);
    });
  });

  describe('session preset', () => {
    it('has 30 minute staleTime', () => {
      expect(queryPresets.session.staleTime).toBe(30 * 60 * 1000);
    });

    it('has 60 minute gcTime', () => {
      expect(queryPresets.session.gcTime).toBe(60 * 60 * 1000);
    });
  });
});

describe('queryKeys', () => {
  describe('healthMetrics', () => {
    it('generates correct keys', () => {
      expect(queryKeys.healthMetrics.all).toEqual(['health-metrics']);
      expect(queryKeys.healthMetrics.list(7)).toEqual(['health-metrics', { days: 7 }]);
      expect(queryKeys.healthMetrics.detail('job-123')).toEqual(['health-metrics', 'detail', 'job-123']);
      expect(queryKeys.healthMetrics.duration('job-456')).toEqual(['health-metrics', 'duration', 'job-456']);
    });
  });

  describe('alerts', () => {
    it('generates correct keys', () => {
      expect(queryKeys.alerts.all).toEqual(['alerts']);
      expect(queryKeys.alerts.list()).toEqual(['alerts', {}]);
      expect(queryKeys.alerts.list({ severity: 'P1' })).toEqual(['alerts', { severity: 'P1' }]);
      expect(queryKeys.alerts.detail('alert-789')).toEqual(['alerts', 'detail', 'alert-789']);
    });
  });

  describe('costs', () => {
    it('generates correct keys', () => {
      expect(queryKeys.costs.all).toEqual(['costs']);
      expect(queryKeys.costs.summary()).toEqual(['costs', 'summary']);
      expect(queryKeys.costs.byTeam()).toEqual(['costs', 'by-team']);
      expect(queryKeys.costs.byJob('job-abc')).toEqual(['costs', 'job', 'job-abc']);
      expect(queryKeys.costs.anomalies()).toEqual(['costs', 'anomalies']);
    });
  });

  describe('jobs', () => {
    it('generates correct keys', () => {
      expect(queryKeys.jobs.all).toEqual(['jobs']);
      expect(queryKeys.jobs.list()).toEqual(['jobs', 'list']);
      expect(queryKeys.jobs.detail('job-xyz')).toEqual(['jobs', 'detail', 'job-xyz']);
      expect(queryKeys.jobs.runs('job-xyz')).toEqual(['jobs', 'runs', 'job-xyz']);
      expect(queryKeys.jobs.running()).toEqual(['jobs', 'running']);
    });
  });

  describe('historical', () => {
    it('generates correct keys', () => {
      expect(queryKeys.historical.all).toEqual(['historical']);
      expect(queryKeys.historical.runs('job-1', '2024-01-01', '2024-01-31')).toEqual([
        'historical', 'runs', 'job-1', '2024-01-01', '2024-01-31',
      ]);
      expect(queryKeys.historical.metrics('2024-01-01', '2024-01-31')).toEqual([
        'historical', 'metrics', '2024-01-01', '2024-01-31',
      ]);
    });
  });

  describe('pipeline', () => {
    it('generates correct keys', () => {
      expect(queryKeys.pipeline.all).toEqual(['pipeline']);
      expect(queryKeys.pipeline.status()).toEqual(['pipeline', 'status']);
      expect(queryKeys.pipeline.tables('job-2')).toEqual(['pipeline', 'tables', 'job-2']);
    });
  });

  describe('user', () => {
    it('generates correct keys', () => {
      expect(queryKeys.user.current()).toEqual(['current-user']);
    });
  });

  describe('cache', () => {
    it('generates correct keys', () => {
      expect(queryKeys.cache.status()).toEqual(['cache', 'status']);
    });
  });
});

describe('withPreset', () => {
  it('merges preset with custom options', () => {
    const result = withPreset('static', {
      queryFn: () => Promise.resolve('data'),
    });

    expect(result.staleTime).toBe(Infinity);
    expect(result.gcTime).toBe(30 * 60 * 1000);
    expect(result.queryFn).toBeDefined();
  });

  it('allows custom options to override preset', () => {
    const result = withPreset('static', {
      staleTime: 1000,
      queryFn: () => Promise.resolve('data'),
    });

    expect(result.staleTime).toBe(1000); // overridden
    expect(result.gcTime).toBe(30 * 60 * 1000); // from preset
  });
});

describe('defaultQueryClientOptions', () => {
  it('uses semiLive staleTime by default', () => {
    expect(defaultQueryClientOptions.queries.staleTime).toBe(queryPresets.semiLive.staleTime);
  });

  it('uses semiLive gcTime by default', () => {
    expect(defaultQueryClientOptions.queries.gcTime).toBe(queryPresets.semiLive.gcTime);
  });

  it('enables refetchOnWindowFocus', () => {
    expect(defaultQueryClientOptions.queries.refetchOnWindowFocus).toBe(true);
  });

  it('retries failed queries twice', () => {
    expect(defaultQueryClientOptions.queries.retry).toBe(2);
  });

  it('has exponential backoff for retry delay', () => {
    const retryDelay = defaultQueryClientOptions.queries.retryDelay;
    expect(retryDelay(0)).toBe(1000); // 1 second
    expect(retryDelay(1)).toBe(2000); // 2 seconds
    expect(retryDelay(2)).toBe(4000); // 4 seconds
    expect(retryDelay(10)).toBe(10000); // capped at 10 seconds
  });
});
