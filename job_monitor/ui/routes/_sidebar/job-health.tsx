/**
 * Job Health Dashboard page.
 * Displays job health metrics with traffic light indicators, priority badges,
 * SLA targets with inline editing, and breach history sparklines.
 */
import { useState, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { AlertCircle, RefreshCw, X, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { JobHealthTable } from '@/components/job-health-table';
import type { JobWithSla } from '@/lib/health-utils';
import { queryKeys, queryPresets } from '@/lib/query-config';
import { useFilters } from '@/lib/filter-context';
import { matchesJobPatterns } from '@/lib/filter-utils';
import { getCurrentUser, type UserInfo } from '@/lib/api';

// Response type matching backend with SLA data and pagination
interface JobHealthListResponse {
  jobs: JobWithSla[];
  window_days: number;
  total_count: number;
  // Pagination fields
  page: number;
  page_size: number;
  has_more: boolean;
  from_cache: boolean;
  // Priority counts for summary stats
  p1_count: number;
  p2_count: number;
  p3_count: number;
  healthy_count: number;
}

async function fetchHealthMetrics(
  days: number,
  workspaceId?: string,
  page: number = 1,
  pageSize: number = 50
): Promise<JobHealthListResponse> {
  const params = new URLSearchParams({
    days: String(days),
    page: String(page),
    page_size: String(pageSize),
  });
  if (workspaceId) {
    params.set('workspace_id', workspaceId);
  }
  const response = await fetch(`/api/health-metrics?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch health metrics: ${response.statusText}`);
  }
  return response.json();
}

type PriorityFilter = 'all' | 'P1' | 'P2' | 'P3';

export default function JobHealthPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const navigate = useNavigate();
  const { filters } = useFilters();

  // Read job filter from URL query parameter
  const search = useSearch({ strict: false }) as { job?: string };
  const jobFilterFromUrl = search?.job || null;

  // Fetch user info first (session preset - rarely changes)
  // Use standardized queryKey to enable cache sharing across components
  const { data: user } = useQuery<UserInfo>({
    queryKey: queryKeys.user.current(),
    queryFn: getCurrentUser,
    ...queryPresets.session,
  });

  // Determine effective workspace ID
  const userWorkspaceId = user?.workspace_id;
  const effectiveWorkspaceId = filters.workspaceId === 'all'
    ? 'all'
    : (filters.workspaceId || userWorkspaceId || 'pending');

  const PAGE_SIZE = 50;

  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['health-metrics', days, effectiveWorkspaceId],
    queryFn: async ({ queryKey, pageParam = 1 }) => {
      // Extract from queryKey to avoid closure issues
      const daysParam = queryKey[1] as number;
      const wsId = queryKey[2] as string;
      const workspaceId = wsId && wsId !== 'all' && wsId !== 'pending' ? wsId : undefined;
      return fetchHealthMetrics(daysParam, workspaceId, pageParam, PAGE_SIZE);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    ...queryPresets.semiLive, // System tables have 5-15 min latency
    enabled: effectiveWorkspaceId !== 'pending',
  });

  // Flatten all pages into a single array of jobs
  const allJobs = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.jobs ?? []);
  }, [data?.pages]);

  // Get summary stats from first page (contains counts for full dataset)
  const summaryStats = data?.pages?.[0];

  // Filter jobs by global wildcard patterns (client-side filtering)
  const filteredJobs = useMemo(() => {
    if (!allJobs || allJobs.length === 0) return [];
    if (!filters.jobNamePatterns || filters.jobNamePatterns.length === 0) return allJobs;
    return allJobs.filter((job) => matchesJobPatterns(job.job_name, filters.jobNamePatterns));
  }, [allJobs, filters.jobNamePatterns]);

  // Clear job filter from URL
  const clearJobFilter = () => {
    navigate({ to: '/job-health', search: {} });
  };

  return (
    <div className="p-4 md:p-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Job Health</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Monitor job success rates, failures, and duration trends
          </p>
        </div>

        {/* Refresh button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Job filter from URL indicator */}
      {jobFilterFromUrl && (
        <div className="mb-4 flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
          <span className="text-sm text-blue-700 dark:text-blue-300">
            Filtering by Job ID: <span className="font-mono font-semibold">{jobFilterFromUrl}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearJobFilter}
            className="h-6 px-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {/* Pattern filter active indicator */}
      {filters.jobNamePatterns.length > 0 && summaryStats && (
        <div className="mb-4 flex items-center gap-2 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg px-4 py-2">
          <span className="text-sm text-purple-700 dark:text-purple-300">
            Job name filter active: <span className="font-mono font-semibold">{filters.jobNamePatterns.join(', ')}</span>
            <span className="ml-2 text-purple-500">
              ({filteredJobs.length} of {summaryStats.total_count} jobs match)
            </span>
          </span>
        </div>
      )}

      {/* Tabs for 7-day / 30-day toggle */}
      <Tabs
        defaultValue="7"
        value={String(days)}
        onValueChange={(value) => setDays(Number(value) as 7 | 30)}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="7">7 Days</TabsTrigger>
          <TabsTrigger value="30">30 Days</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary stats - clickable to filter (responsive grid) */}
      {summaryStats && !isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => setPriorityFilter(priorityFilter === 'all' ? 'all' : 'all')}
            className={`bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-3 text-left transition-all hover:shadow-md cursor-pointer ${
              priorityFilter === 'all' ? 'ring-2 ring-blue-500 border-blue-500' : ''
            }`}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {filters.jobNamePatterns.length > 0 ? 'Matching Jobs' : 'Total Jobs'}
            </div>
            <div className="text-xl font-semibold dark:text-white">
              {filters.jobNamePatterns.length > 0 ? filteredJobs.length : summaryStats.total_count}
              {filters.jobNamePatterns.length > 0 && (
                <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">
                  / {summaryStats.total_count}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setPriorityFilter(priorityFilter === 'P1' ? 'all' : 'P1')}
            className={`bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-3 text-left transition-all hover:shadow-md cursor-pointer ${
              priorityFilter === 'P1' ? 'ring-2 ring-red-500 border-red-500' : ''
            }`}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Critical (P1)</div>
            <div className="text-xl font-semibold text-red-600 dark:text-red-400">
              {filters.jobNamePatterns.length > 0
                ? filteredJobs.filter((j) => j.priority === 'P1').length
                : summaryStats.p1_count}
            </div>
          </button>
          <button
            onClick={() => setPriorityFilter(priorityFilter === 'P2' ? 'all' : 'P2')}
            className={`bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-3 text-left transition-all hover:shadow-md cursor-pointer ${
              priorityFilter === 'P2' ? 'ring-2 ring-orange-500 border-orange-500' : ''
            }`}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Failing (P2)</div>
            <div className="text-xl font-semibold text-orange-500 dark:text-orange-400">
              {filters.jobNamePatterns.length > 0
                ? filteredJobs.filter((j) => j.priority === 'P2').length
                : summaryStats.p2_count}
            </div>
          </button>
          <button
            onClick={() => setPriorityFilter(priorityFilter === 'P3' ? 'all' : 'P3')}
            className={`bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-3 text-left transition-all hover:shadow-md cursor-pointer ${
              priorityFilter === 'P3' ? 'ring-2 ring-yellow-500 border-yellow-500' : ''
            }`}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Warning (P3)</div>
            <div className="text-xl font-semibold text-yellow-600 dark:text-yellow-400">
              {filters.jobNamePatterns.length > 0
                ? filteredJobs.filter((j) => j.priority === 'P3').length
                : summaryStats.p3_count}
            </div>
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-medium text-red-800">
                Failed to load health metrics
              </p>
              <p className="text-sm text-red-600">
                {(error as Error).message}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="ml-auto"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Job health table with horizontal scroll on mobile */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-x-auto">
        <div className="min-w-[800px]">
          <JobHealthTable
            jobs={
              priorityFilter === 'all'
                ? filteredJobs
                : filteredJobs.filter((j) => j.priority === priorityFilter)
            }
            isLoading={isLoading}
            onRefetch={() => refetch()}
            initialSearchQuery={jobFilterFromUrl || undefined}
          />
        </div>
      </div>

      {/* Load More button */}
      {hasNextPage && (
        <div className="flex justify-center mt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              `Load More (${allJobs.length} of ${summaryStats?.total_count || 0})`
            )}
          </Button>
        </div>
      )}

      {/* Active filter indicator */}
      {priorityFilter !== 'all' && summaryStats && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing {filteredJobs.filter((j) => j.priority === priorityFilter).length} {priorityFilter} jobs
          </span>
          <button
            onClick={() => setPriorityFilter('all')}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Footer note about data latency */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
        Data refreshes every 5-15 minutes from Databricks system tables.
        {summaryStats && ` Showing ${days}-day window with ${allJobs.length}${summaryStats.total_count > allJobs.length ? ` of ${summaryStats.total_count}` : ''} jobs${filters.jobNamePatterns.length > 0 ? ' (filtered)' : ''}.`}
        {summaryStats?.from_cache && ' (from cache)'}
      </p>
    </div>
  );
}
