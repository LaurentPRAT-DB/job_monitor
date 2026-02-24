/**
 * Job expanded details component.
 * Shows recent runs, metrics summary, and duration chart when a job row is expanded.
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DurationChart } from '@/components/duration-chart';
import { cn } from '@/lib/utils';
import {
  formatDuration,
  formatTimeAgo,
  isAnomalousDuration,
  formatAnomalyComparison,
} from '@/lib/health-utils';

// Types matching backend models
interface JobRunDetail {
  run_id: string;
  job_id: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  result_state: string | null;
  is_anomaly: boolean;
}

interface DurationStats {
  job_id: string;
  median_duration_seconds: number | null;
  p90_duration_seconds: number | null;
  avg_duration_seconds: number | null;
  max_duration_seconds: number | null;
  run_count: number;
  baseline_30d_median: number | null;
  has_sufficient_data: boolean;
}

interface JobExpanded {
  job_id: string;
  job_name: string;
  recent_runs: JobRunDetail[];
  duration_stats: DurationStats;
  retry_count_7d: number;
  failure_reasons: string[];
}

interface JobExpandedDetailsProps {
  jobId: string;
  jobName: string;
}

async function fetchJobDetails(jobId: string): Promise<JobExpanded> {
  const response = await fetch(`/api/health-metrics/${jobId}/details`);
  if (!response.ok) {
    throw new Error(`Failed to fetch job details: ${response.statusText}`);
  }
  return response.json();
}

export function JobExpandedDetails({ jobId }: JobExpandedDetailsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['job-details', jobId],
    queryFn: () => fetchJobDetails(jobId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="p-4 animate-pulse">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 bg-gray-100 rounded"></div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-32 bg-gray-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">
        <p>Failed to load job details: {(error as Error).message}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { recent_runs, duration_stats, retry_count_7d, failure_reasons } = data;
  const baseline = duration_stats.baseline_30d_median;

  // Prepare chart data
  const chartData = recent_runs
    .filter((run) => run.duration_seconds !== null)
    .map((run) => ({
      run_time: run.start_time,
      duration_seconds: run.duration_seconds!,
    }))
    .reverse(); // Oldest first for chart

  return (
    <TooltipProvider>
      <div className="p-4 bg-gray-50 border-t">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Recent Runs */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Recent Runs (Last 10)
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recent_runs.length === 0 ? (
                <p className="text-gray-500 text-sm">No recent runs</p>
              ) : (
                recent_runs.map((run) => (
                  <RunItem key={run.run_id} run={run} />
                ))
              )}
            </div>
          </div>

          {/* Right: Metrics Summary */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Metrics Summary
            </h4>

            {/* Duration Stats Table */}
            <div className="bg-white rounded border p-3 mb-3">
              {!duration_stats.has_sufficient_data ? (
                <p className="text-amber-600 text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Need 5+ runs for baseline
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Median:</span>{' '}
                    <span className="font-medium">
                      {duration_stats.median_duration_seconds
                        ? formatDuration(duration_stats.median_duration_seconds)
                        : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">P90:</span>{' '}
                    <span className="font-medium">
                      {duration_stats.p90_duration_seconds
                        ? formatDuration(duration_stats.p90_duration_seconds)
                        : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Max:</span>{' '}
                    <span className="font-medium">
                      {duration_stats.max_duration_seconds
                        ? formatDuration(duration_stats.max_duration_seconds)
                        : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Runs:</span>{' '}
                    <span className="font-medium">{duration_stats.run_count}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Last Run Comparison */}
            {recent_runs.length > 0 && baseline && recent_runs[0].duration_seconds && (
              <div className="bg-white rounded border p-3 mb-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Last run:</span>
                  <span className="font-medium">
                    {formatDuration(recent_runs[0].duration_seconds)}
                  </span>
                  <span
                    className={cn(
                      'text-xs',
                      isAnomalousDuration(recent_runs[0].duration_seconds, baseline)
                        ? 'text-red-600'
                        : 'text-gray-500'
                    )}
                  >
                    ({formatAnomalyComparison(recent_runs[0].duration_seconds, baseline)})
                  </span>
                  {recent_runs[0].is_anomaly && (
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Duration anomaly: exceeds 2x baseline
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            )}

            {/* Retry Count */}
            <div className="bg-white rounded border p-3 mb-3">
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500">Retries (7d):</span>
                <span className="font-medium">{retry_count_7d}</span>
                {retry_count_7d > 2 && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs">
                    High retries
                  </Badge>
                )}
              </div>
            </div>

            {/* Failure Reasons */}
            {failure_reasons.length > 0 && (
              <div className="bg-white rounded border p-3">
                <h5 className="text-xs font-medium text-gray-500 mb-2">
                  Failure Reasons
                </h5>
                <ul className="space-y-1">
                  {failure_reasons.slice(0, 3).map((reason, idx) => (
                    <li key={idx} className="text-xs text-red-600 truncate">
                      {reason}
                    </li>
                  ))}
                  {failure_reasons.length > 3 && (
                    <li className="text-xs text-gray-500">
                      +{failure_reasons.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Duration Chart - Full Width */}
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Duration Trend
          </h4>
          <div className="bg-white rounded border p-3">
            <DurationChart
              data={chartData}
              medianBaseline={baseline || 0}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Helper component for individual run item
function RunItem({ run }: { run: JobRunDetail }) {
  const isSuccess = run.result_state === 'SUCCESS';
  const isFailed = run.result_state === 'FAILED';
  const isAnomaly = run.is_anomaly;

  return (
    <div className="flex items-center justify-between bg-white rounded border px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        {/* Result icon */}
        {isSuccess ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : isFailed ? (
          <XCircle className="h-4 w-4 text-red-500" />
        ) : (
          <Clock className="h-4 w-4 text-gray-400" />
        )}

        {/* Start time */}
        <span className="text-gray-600">{formatTimeAgo(run.start_time)}</span>

        {/* Result badge */}
        <Badge
          variant={isSuccess ? 'default' : isFailed ? 'destructive' : 'secondary'}
          className={cn(
            'text-xs',
            isSuccess && 'bg-green-100 text-green-700 hover:bg-green-100',
            !isSuccess && !isFailed && 'bg-gray-100 text-gray-600'
          )}
        >
          {run.result_state || 'UNKNOWN'}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        {/* Duration */}
        {run.duration_seconds && (
          <span
            className={cn('text-gray-600', isAnomaly && 'text-red-600 font-medium')}
          >
            {formatDuration(run.duration_seconds)}
          </span>
        )}

        {/* Anomaly indicator */}
        {isAnomaly && (
          <Tooltip>
            <TooltipTrigger>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>
              Duration anomaly: exceeds 2x baseline
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
