/**
 * Running Jobs page.
 * Displays currently running/active jobs with real-time data from Jobs API.
 * Features: sortable columns, clickable filter cards, expandable rows.
 */
import { useState, useMemo, useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw, Play, ExternalLink, Clock, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, CheckCircle, XCircle, MinusCircle, Radio, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { JobExpandedDetails } from '@/components/job-expanded-details';
import { useFilters } from '@/lib/filter-context';
import { matchesJobPatterns } from '@/lib/filter-utils';

// Sort and filter types
type SortColumn = 'job_name' | 'state' | 'start_time' | 'duration';
type SortDirection = 'asc' | 'desc';
type StateFilter = 'all' | 'RUNNING' | 'PENDING' | 'TERMINATING';

interface RecentRunStatus {
  run_id: number;
  result_state: string | null;  // SUCCESS, FAILED, CANCELED, SKIPPED, null
}

interface ActiveRunWithHistory {
  run_id: number;
  job_id: number;
  run_name: string | null;
  state: string;
  result_state: string | null;
  start_time: string | null;
  end_time: string | null;
  run_page_url: string | null;
  recent_runs: RecentRunStatus[];
}

interface ActiveRunsResponse {
  total_active: number;
  runs: ActiveRunWithHistory[];
  page: number;
  page_size: number;
  has_more: boolean;
}

const PAGE_SIZE = 50;

async function fetchActiveRuns(page: number = 1): Promise<ActiveRunsResponse> {
  // Use paginated endpoint, fetch history separately per-row
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  const response = await fetch(`/api/jobs-api/active?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch active runs: ${response.statusText}`);
  }
  const data = await response.json();
  // Add empty recent_runs array to each run (will be populated lazily)
  return {
    total_active: data.total_active,
    runs: data.runs.map((run: any) => ({
      ...run,
      recent_runs: [], // Will be fetched per-row
    })),
    page: data.page,
    page_size: data.page_size,
    has_more: data.has_more,
  };
}

// Ensure timestamp is parsed as UTC (append 'Z' if no timezone info)
function parseAsUtc(timestamp: string): Date {
  // If already has timezone info (Z or +/-), parse directly
  if (/[Zz]$/.test(timestamp) || /[+-]\d{2}:?\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }
  // Otherwise, assume UTC and append Z
  return new Date(timestamp + 'Z');
}

function formatDuration(startTime: string | null): string {
  if (!startTime) return '--';
  const start = parseAsUtc(startTime);
  const nowUtc = Date.now(); // Always UTC milliseconds
  const diffMs = nowUtc - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 0) return '0m'; // Handle edge case
  if (diffMins < 60) {
    return `${diffMins}m`;
  }
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m`;
}

function formatStartTime(startTime: string | null): string {
  if (!startTime) return '--';
  const date = new Date(startTime);
  // Show in UTC for consistency with Databricks
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  });
}

function getDurationMs(startTime: string | null): number {
  if (!startTime) return 0;
  const start = parseAsUtc(startTime);
  const nowUtc = Date.now();
  return nowUtc - start.getTime();
}

// Clock component showing both local and UTC time
function TimeClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const utcTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded px-3 py-1.5">
      <Clock className="h-3.5 w-3.5" />
      <span>Local: <span className="font-mono">{localTime}</span></span>
      <span className="text-gray-300 dark:text-gray-600">|</span>
      <span>UTC: <span className="font-mono font-medium text-blue-600 dark:text-blue-400">{utcTime}</span></span>
    </div>
  );
}

// Streaming job detection patterns
const STREAMING_PATTERNS = [
  /stream/i,
  /\bcdc\b/i,
  /continuous/i,
  /real.?time/i,
  /kafka/i,
  /kinesis/i,
  /event.?hub/i,
  /ingest/i,
  /pipeline/i,
];

function isStreamingJob(jobName: string | null): boolean {
  if (!jobName) return false;
  return STREAMING_PATTERNS.some(pattern => pattern.test(jobName));
}

// Long-running thresholds
const LONG_RUNNING_MS = 4 * 60 * 60 * 1000; // 4 hours for batch jobs
const VERY_LONG_RUNNING_MS = 24 * 60 * 60 * 1000; // 24 hours for any job

function isLongRunning(startTime: string | null, isStreaming: boolean): boolean {
  const durationMs = getDurationMs(startTime);
  // Streaming jobs: only flag if > 24h (unusual even for streaming)
  if (isStreaming) return durationMs > VERY_LONG_RUNNING_MS;
  // Batch jobs: flag if > 4h
  return durationMs > LONG_RUNNING_MS;
}

// State sort order (RUNNING first, then PENDING/QUEUED, then TERMINATING)
const stateOrder: Record<string, number> = { RUNNING: 3, PENDING: 2, QUEUED: 2, TERMINATING: 1 };

function compareRuns(a: ActiveRunWithHistory, b: ActiveRunWithHistory, column: SortColumn, direction: SortDirection): number {
  let result = 0;

  switch (column) {
    case 'job_name':
      result = (a.run_name || `Job ${a.job_id}`).localeCompare(b.run_name || `Job ${b.job_id}`);
      break;
    case 'state':
      result = (stateOrder[a.state] ?? 0) - (stateOrder[b.state] ?? 0);
      break;
    case 'start_time':
      result = new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime();
      break;
    case 'duration':
      result = getDurationMs(a.start_time) - getDurationMs(b.start_time);
      break;
  }

  return direction === 'asc' ? result : -result;
}

// Recent runs status icons component (like Databricks UI)
function RecentRunsIndicator({ runs }: { runs: RecentRunStatus[] }) {
  // Pad to always show 5 slots
  const slots = [...runs];
  while (slots.length < 5) {
    slots.push({ run_id: -slots.length, result_state: null });
  }

  return (
    <div className="flex items-center gap-1">
      {slots.slice(0, 5).map((run, idx) => {
        const state = run.result_state;
        if (state === 'SUCCESS') {
          return (
            <span key={run.run_id || idx} title="Success">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </span>
          );
        } else if (state === 'FAILED') {
          return (
            <span key={run.run_id || idx} title="Failed">
              <XCircle className="h-4 w-4 text-red-500" />
            </span>
          );
        } else if (state === 'CANCELED') {
          return (
            <span key={run.run_id || idx} title="Canceled">
              <XCircle className="h-4 w-4 text-orange-400" />
            </span>
          );
        } else if (state === 'SKIPPED') {
          return (
            <span key={run.run_id || idx} title="Skipped">
              <MinusCircle className="h-4 w-4 text-gray-400" />
            </span>
          );
        } else {
          // No data or currently running - show empty circle
          return (
            <div
              key={run.run_id || idx}
              className="h-4 w-4 rounded-full border-2 border-gray-300 dark:border-gray-600"
              title="No data"
            />
          );
        }
      })}
    </div>
  );
}

function getStateBadgeVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'RUNNING':
      return 'default';
    case 'PENDING':
    case 'QUEUED':
      return 'secondary';
    case 'TERMINATING':
      return 'outline';
    default:
      return 'secondary';
  }
}

// Batch fetch recent runs for multiple jobs in one request
// This solves the N+1 query problem (50 requests -> 1 request)
interface BatchRunsResponse {
  runs_by_job: Record<string, Array<{ run_id: number; result_state: string | null }>>;
}

async function fetchBatchJobHistory(jobIds: number[]): Promise<Record<string, RecentRunStatus[]>> {
  if (jobIds.length === 0) return {};

  try {
    const response = await fetch('/api/jobs-api/runs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_ids: jobIds, limit: 6 }),
    });
    if (!response.ok) return {};

    const data: BatchRunsResponse = await response.json();

    // Process each job's runs: filter to completed and take first 5
    const result: Record<string, RecentRunStatus[]> = {};
    for (const [jobId, runs] of Object.entries(data.runs_by_job)) {
      result[jobId] = runs
        .filter((r) => r.result_state !== null)
        .slice(0, 5)
        .map((r) => ({
          run_id: r.run_id,
          result_state: r.result_state,
        }));
    }
    return result;
  } catch {
    return {};
  }
}

function RunningJobRow({ run, recentRuns }: { run: ActiveRunWithHistory; recentRuns?: RecentRunStatus[] }) {
  const [isOpen, setIsOpen] = useState(false);

  // Detect streaming and long-running
  const streaming = isStreamingJob(run.run_name);
  const longRunning = isLongRunning(run.start_time, streaming);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <>
        <TableRow className={cn(
          'cursor-pointer hover:bg-muted/50',
          isOpen && 'bg-muted/50',
          longRunning && 'bg-amber-50 dark:bg-amber-900/20'
        )}>
          {/* Expand button */}
          <TableCell className="w-12">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    isOpen && 'rotate-180'
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </TableCell>

          {/* Job name with streaming/long-running indicators */}
          <TableCell className="font-medium" onClick={() => setIsOpen(!isOpen)}>
            <div className="flex items-center gap-2">
              {streaming ? (
                <span title="Streaming job">
                  <Radio className="h-4 w-4 text-blue-500" />
                </span>
              ) : (
                <Play className="h-4 w-4 text-green-500 animate-pulse" />
              )}
              <span className={cn(longRunning && 'text-amber-700 dark:text-amber-400')}>
                {run.run_name || `Job ${run.job_id}`}
              </span>
              {streaming && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                  Streaming
                </Badge>
              )}
              {longRunning && (
                <span title={streaming ? "Running > 24h" : "Running > 4h"}>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </span>
              )}
            </div>
          </TableCell>

          {/* Recent runs - Databricks-style icons */}
          <TableCell onClick={() => setIsOpen(!isOpen)}>
            <RecentRunsIndicator runs={recentRuns || []} />
          </TableCell>

          {/* State */}
          <TableCell onClick={() => setIsOpen(!isOpen)}>
            <Badge variant={getStateBadgeVariant(run.state)} className={cn(
              run.state === 'RUNNING' && 'bg-green-600 hover:bg-green-700'
            )}>
              {run.state}
            </Badge>
          </TableCell>

          {/* Start time */}
          <TableCell className="text-muted-foreground" onClick={() => setIsOpen(!isOpen)}>
            {formatStartTime(run.start_time)}
          </TableCell>

          {/* Duration */}
          <TableCell onClick={() => setIsOpen(!isOpen)}>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDuration(run.start_time)}
            </div>
          </TableCell>

          {/* Link to Databricks */}
          <TableCell>
            {run.run_page_url && (
              <a
                href={run.run_page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                View
              </a>
            )}
          </TableCell>
        </TableRow>

        {/* Expanded row - detailed view */}
        <CollapsibleContent asChild>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={7} className="p-0">
              <JobExpandedDetails jobId={String(run.job_id)} jobName={run.run_name || `Job ${run.job_id}`} />
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}

export default function RunningJobsPage() {
  const [sortColumn, setSortColumn] = useState<SortColumn>('start_time');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [stateFilter, setStateFilter] = useState<StateFilter>('RUNNING');
  const { filters } = useFilters();

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
    queryKey: ['active-runs'],
    queryFn: ({ pageParam = 1 }) => fetchActiveRuns(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    refetchInterval: 30000, // Refresh every 30 seconds for real-time updates
    staleTime: 10000, // Consider data stale after 10 seconds
    refetchOnWindowFocus: true,
  });

  // Flatten all pages into a single array of runs
  const allRuns = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.runs);
  }, [data?.pages]);

  // Get unique job IDs for batch fetching history
  const uniqueJobIds = useMemo(() => {
    const ids = new Set(allRuns.map(r => r.job_id));
    return Array.from(ids);
  }, [allRuns]);

  // Batch fetch job history for all visible jobs (1 request instead of N)
  const { data: batchHistory } = useQuery({
    queryKey: ['batch-job-history', uniqueJobIds],
    queryFn: () => fetchBatchJobHistory(uniqueJobIds),
    enabled: uniqueJobIds.length > 0,
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  // Get total count from first page
  const totalActive = data?.pages?.[0]?.total_active ?? 0;

  // Filter and sort runs
  const filteredAndSortedRuns = useMemo(() => {
    if (allRuns.length === 0) return [];

    let result = allRuns;

    // Apply job name pattern filter (wildcard matching)
    if (filters.jobNamePatterns.length > 0) {
      result = result.filter(r =>
        matchesJobPatterns(r.run_name || `Job ${r.job_id}`, filters.jobNamePatterns)
      );
    }

    // Apply state filter
    if (stateFilter !== 'all') {
      if (stateFilter === 'PENDING') {
        result = result.filter(r => r.state === 'PENDING' || r.state === 'QUEUED');
      } else {
        result = result.filter(r => r.state === stateFilter);
      }
    }

    // Apply sorting
    return [...result].sort((a, b) => compareRuns(a, b, sortColumn, sortDirection));
  }, [allRuns, stateFilter, sortColumn, sortDirection, filters.jobNamePatterns]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      // Default to descending for most columns, ascending for job_name
      setSortDirection(column === 'job_name' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-30" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const SortableHeader = ({ column, children, className }: { column: SortColumn; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={cn('cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none', className)}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center">
        {children}
        <SortIcon column={column} />
      </div>
    </TableHead>
  );

  // Count by state for filter cards (from loaded runs)
  const runningCount = allRuns.filter(r => r.state === 'RUNNING').length;
  const pendingCount = allRuns.filter(r => r.state === 'PENDING' || r.state === 'QUEUED').length;
  const terminatingCount = allRuns.filter(r => r.state === 'TERMINATING').length;

  return (
    <div className="p-4 md:p-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Running Jobs</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Real-time view of currently executing jobs
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Time clock */}
          <TimeClock />

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
      </div>

      {/* Summary stats - clickable to filter */}
      {totalActive > 0 && !isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => setStateFilter(stateFilter === 'all' ? 'all' : 'all')}
            className={cn(
              'bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-3 text-left transition-all hover:shadow-md cursor-pointer',
              stateFilter === 'all' && 'ring-2 ring-blue-500 border-blue-500'
            )}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Active</div>
            <div className="text-2xl font-semibold text-green-600 dark:text-green-400">
              {totalActive}
            </div>
          </button>
          <button
            onClick={() => setStateFilter(stateFilter === 'RUNNING' ? 'all' : 'RUNNING')}
            className={cn(
              'bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-3 text-left transition-all hover:shadow-md cursor-pointer',
              stateFilter === 'RUNNING' && 'ring-2 ring-green-500 border-green-500'
            )}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Running</div>
            <div className="text-xl font-semibold text-green-600 dark:text-green-400">
              {runningCount}
            </div>
          </button>
          <button
            onClick={() => setStateFilter(stateFilter === 'PENDING' ? 'all' : 'PENDING')}
            className={cn(
              'bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-3 text-left transition-all hover:shadow-md cursor-pointer',
              stateFilter === 'PENDING' && 'ring-2 ring-yellow-500 border-yellow-500'
            )}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Pending/Queued</div>
            <div className="text-xl font-semibold text-yellow-600 dark:text-yellow-400">
              {pendingCount}
            </div>
          </button>
          <button
            onClick={() => setStateFilter(stateFilter === 'TERMINATING' ? 'all' : 'TERMINATING')}
            className={cn(
              'bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-3 text-left transition-all hover:shadow-md cursor-pointer',
              stateFilter === 'TERMINATING' && 'ring-2 ring-gray-500 border-gray-500'
            )}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Terminating</div>
            <div className="text-xl font-semibold text-gray-600 dark:text-gray-400">
              {terminatingCount}
            </div>
          </button>
        </div>
      )}

      {/* Pattern filter active indicator */}
      {filters.jobNamePatterns.length > 0 && totalActive > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg px-4 py-2">
          <span className="text-sm text-purple-700 dark:text-purple-300">
            Job name filter active: <span className="font-mono font-semibold">{filters.jobNamePatterns.join(', ')}</span>
            <span className="ml-2 text-purple-500">
              ({filteredAndSortedRuns.length} of {allRuns.length} jobs match)
            </span>
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">
                Failed to load running jobs
              </p>
              <p className="text-sm text-red-600 dark:text-red-300">
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

      {/* Running jobs table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-x-auto">
        <div className="min-w-[850px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <SortableHeader column="job_name">Job Name</SortableHeader>
                <TableHead>Recent Runs</TableHead>
                <SortableHeader column="state">State</SortableHeader>
                <SortableHeader column="start_time">Started (UTC)</SortableHeader>
                <SortableHeader column="duration">Duration</SortableHeader>
                <TableHead>Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div></TableCell>
                    <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48"></div></TableCell>
                    <TableCell><div className="flex gap-1">{Array.from({ length: 5 }).map((_, j) => <div key={j} className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded-full"></div>)}</div></TableCell>
                    <TableCell><div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-20"></div></TableCell>
                    <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div></TableCell>
                    <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12"></div></TableCell>
                    <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12"></div></TableCell>
                  </TableRow>
                ))
              ) : filteredAndSortedRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="text-gray-500 dark:text-gray-400">
                      <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">
                        {filters.jobNamePatterns.length > 0
                          ? 'No jobs match your filter'
                          : stateFilter !== 'all'
                          ? `No ${stateFilter.toLowerCase()} jobs`
                          : 'No jobs currently running'}
                      </p>
                      <p className="text-sm mt-1">
                        {filters.jobNamePatterns.length > 0
                          ? `Pattern "${filters.jobNamePatterns.join(', ')}" doesn't match any running jobs.`
                          : stateFilter !== 'all'
                          ? 'Try clearing the filter to see all jobs.'
                          : 'All jobs are idle. Check back later or trigger a job run.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedRuns.map((run) => (
                  <RunningJobRow key={run.run_id} run={run} recentRuns={batchHistory?.[String(run.job_id)]} />
                ))
              )}
            </TableBody>
          </Table>
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
              `Load More (${allRuns.length} of ${totalActive})`
            )}
          </Button>
        </div>
      )}

      {/* Active filter indicator */}
      {stateFilter !== 'all' && totalActive > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing {filteredAndSortedRuns.length} {stateFilter.toLowerCase()} job{filteredAndSortedRuns.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setStateFilter('all')}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Footer note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
        Data refreshes automatically every 30 seconds from Databricks Jobs API.
        {totalActive > 0 && ` Showing ${allRuns.length}${totalActive > allRuns.length ? ` of ${totalActive}` : ''} active job${totalActive !== 1 ? 's' : ''}.`}
      </p>
    </div>
  );
}
