/**
 * Running Jobs page.
 * Displays currently running/active jobs with real-time data from Jobs API.
 * Features: sortable columns, clickable filter cards, expandable rows.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw, Play, ExternalLink, Clock, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
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
}

async function fetchActiveRuns(): Promise<ActiveRunsResponse> {
  // Use fast endpoint, fetch history separately per-row
  const response = await fetch('/api/jobs-api/active');
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
  };
}

function formatDuration(startTime: string | null): string {
  if (!startTime) return '--';
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);

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
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDurationMs(startTime: string | null): number {
  if (!startTime) return 0;
  const start = new Date(startTime);
  const now = new Date();
  return now.getTime() - start.getTime();
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

// Fetch recent runs for a single job
async function fetchJobHistory(jobId: number): Promise<RecentRunStatus[]> {
  try {
    const response = await fetch(`/api/jobs-api/runs/${jobId}?limit=6`);
    if (!response.ok) return [];
    const runs = await response.json();
    // Filter to completed runs and take first 5
    return runs
      .filter((r: any) => r.result_state !== null)
      .slice(0, 5)
      .map((r: any) => ({
        run_id: r.run_id,
        result_state: r.result_state,
      }));
  } catch {
    return [];
  }
}

function RunningJobRow({ run }: { run: ActiveRunWithHistory }) {
  const [isOpen, setIsOpen] = useState(false);

  // Lazy-load recent runs history for this job
  const { data: recentRuns } = useQuery({
    queryKey: ['job-history', run.job_id],
    queryFn: () => fetchJobHistory(run.job_id),
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <>
        <TableRow className={cn(
          'cursor-pointer hover:bg-muted/50',
          isOpen && 'bg-muted/50'
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

          {/* Job name */}
          <TableCell className="font-medium" onClick={() => setIsOpen(!isOpen)}>
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-green-500 animate-pulse" />
              {run.run_name || `Job ${run.job_id}`}
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
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['active-runs'],
    queryFn: fetchActiveRuns,
    refetchInterval: 30000, // Refresh every 30 seconds for real-time updates
    staleTime: 10000, // Consider data stale after 10 seconds
    refetchOnWindowFocus: true,
  });

  // Filter and sort runs
  const filteredAndSortedRuns = useMemo(() => {
    if (!data?.runs) return [];

    let result = data.runs;

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
  }, [data?.runs, stateFilter, sortColumn, sortDirection]);

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

  // Count by state for filter cards
  const runningCount = data?.runs.filter(r => r.state === 'RUNNING').length ?? 0;
  const pendingCount = data?.runs.filter(r => r.state === 'PENDING' || r.state === 'QUEUED').length ?? 0;
  const terminatingCount = data?.runs.filter(r => r.state === 'TERMINATING').length ?? 0;

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

      {/* Summary stats - clickable to filter */}
      {data && !isLoading && (
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
              {data.total_active}
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
                <SortableHeader column="start_time">Started</SortableHeader>
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
                        {stateFilter !== 'all' ? `No ${stateFilter.toLowerCase()} jobs` : 'No jobs currently running'}
                      </p>
                      <p className="text-sm mt-1">
                        {stateFilter !== 'all'
                          ? 'Try clearing the filter to see all jobs.'
                          : 'All jobs are idle. Check back later or trigger a job run.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedRuns.map((run) => (
                  <RunningJobRow key={run.run_id} run={run} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Active filter indicator */}
      {stateFilter !== 'all' && data && (
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
        {data && ` Currently ${data.total_active} active job${data.total_active !== 1 ? 's' : ''}.`}
      </p>
    </div>
  );
}
