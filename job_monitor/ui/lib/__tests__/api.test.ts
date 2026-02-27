/**
 * Tests for api.ts
 *
 * Tests:
 * - fetchApi error handling
 * - getCurrentUser API call
 * - getHealth API call
 * - updateJobTags API call
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentUser, getHealth, updateJobTags } from '../api';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('getCurrentUser', () => {
  it('fetches user info from /api/me', async () => {
    const mockUser = {
      email: 'test@example.com',
      display_name: 'Test User',
      workspace_host: 'https://test.cloud.databricks.com',
      workspace_name: 'Test Workspace',
      workspace_id: '123456789',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const result = await getCurrentUser();
    expect(mockFetch).toHaveBeenCalledWith('/api/me', expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }));
    expect(result).toEqual(mockUser);
  });

  it('throws error on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(getCurrentUser()).rejects.toThrow('API error: 401 Unauthorized');
  });
});

describe('getHealth', () => {
  it('fetches health status from /api/health', async () => {
    const mockHealth = {
      status: 'healthy',
      version: '1.1.0',
      user: 'test@example.com',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHealth),
    });

    const result = await getHealth();
    expect(mockFetch).toHaveBeenCalledWith('/api/health', expect.any(Object));
    expect(result).toEqual(mockHealth);
  });

  it('throws error on server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(getHealth()).rejects.toThrow('API error: 500 Internal Server Error');
  });
});

describe('updateJobTags', () => {
  it('sends PATCH request to /api/jobs/:id/tags', async () => {
    const mockResponse = {
      job_id: 'job-123',
      tags: { sla_minutes: '60', team: 'data-eng' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await updateJobTags('job-123', { sla_minutes: 60, team: 'data-eng' });

    expect(mockFetch).toHaveBeenCalledWith('/api/jobs/job-123/tags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sla_minutes: 60, team: 'data-eng' }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('handles partial tag updates', async () => {
    const mockResponse = {
      job_id: 'job-456',
      tags: { owner: 'alice' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await updateJobTags('job-456', { owner: 'alice' });
    expect(result.tags.owner).toBe('alice');
  });

  it('throws error on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(updateJobTags('nonexistent', {})).rejects.toThrow('API error: 404 Not Found');
  });
});
