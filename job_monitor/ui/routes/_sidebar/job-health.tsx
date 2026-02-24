/**
 * Job Health Dashboard page.
 * Displays job health metrics with traffic light indicators, priority badges,
 * and expandable rows for detailed views.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { JobHealthTable } from '@/components/job-health-table';

// Types matching backend models
interface JobHealth {
  job_id: string;
  job_name: string;
  total_runs: number;
  success_count: number;
  success_rate: number;
  last_run_time: string;
  last_duration_seconds: number | null;
  priority: 'P1' | 'P2' | 'P3' | null;
  retry_count: number;
  status: 'green' | 'yellow' | 'red';
}

interface JobHealthListResponse {
  jobs: JobHealth[];
  window_days: number;
  total_count: number;
}

async function fetchHealthMetrics(days: number): Promise<JobHealthListResponse> {
  const response = await fetch(`/api/health-metrics?days=${days}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch health metrics: ${response.statusText}`);
  }
  return response.json();
}

export default function JobHealthPage() {
  const [days, setDays] = useState<7 | 30>(7);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['health-metrics', { days }],
    queryFn: () => fetchHealthMetrics(days),
    staleTime: 5 * 60 * 1000, // 5 minutes (system tables have 5-15 min latency)
    refetchOnWindowFocus: true,
  });

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Job Health</h1>
          <p className="text-gray-500 text-sm mt-1">
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

      {/* Summary stats */}
      {data && !isLoading && (
        <div className="flex gap-6 mb-6">
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="text-sm text-gray-500">Total Jobs</div>
            <div className="text-xl font-semibold">{data.total_count}</div>
          </div>
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="text-sm text-gray-500">Critical (P1)</div>
            <div className="text-xl font-semibold text-red-600">
              {data.jobs.filter((j) => j.priority === 'P1').length}
            </div>
          </div>
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="text-sm text-gray-500">Failing (P2)</div>
            <div className="text-xl font-semibold text-orange-500">
              {data.jobs.filter((j) => j.priority === 'P2').length}
            </div>
          </div>
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="text-sm text-gray-500">Warning (P3)</div>
            <div className="text-xl font-semibold text-yellow-600">
              {data.jobs.filter((j) => j.priority === 'P3').length}
            </div>
          </div>
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

      {/* Job health table */}
      <div className="bg-white rounded-lg border shadow-sm">
        <JobHealthTable
          jobs={data?.jobs ?? []}
          isLoading={isLoading}
        />
      </div>

      {/* Footer note about data latency */}
      <p className="text-xs text-gray-400 mt-4">
        Data refreshes every 5-15 minutes from Databricks system tables.
        {data && ` Showing ${days}-day window with ${data.total_count} jobs.`}
      </p>
    </div>
  );
}
