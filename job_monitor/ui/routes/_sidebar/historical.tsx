/**
 * Historical dashboard page with trend visualizations.
 * Shows cost, success rate, and failure trends with previous period comparison.
 */
import { useQuery } from '@tanstack/react-query';
import { useFilters } from '@/lib/filter-context';
import { getDaysFromRange } from '@/lib/filter-utils';
import { HistoricalChart } from '@/components/historical-chart';
import { MetricSummaryCard } from '@/components/metric-summary-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';
import { queryKeys, queryPresets } from '@/lib/query-config';
import { getCurrentUser, type UserInfo } from '@/lib/api';

interface HistoricalData {
  data: { date: string; current: number; previous: number }[];
  granularity: 'hourly' | 'daily' | 'weekly';
  current_total: number;
  previous_total: number;
  change_percent: number;
}

export default function HistoricalDashboard() {
  const { filters } = useFilters();
  const days = getDaysFromRange(filters.timeRange);

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

  // Helper to build query params from queryKey values (avoids closure issues)
  const buildQueryParams = (daysVal: number, team: string | null, jobId: string | null, wsId: string) => {
    const params = new URLSearchParams();
    params.set('days', String(daysVal));
    if (team) params.set('team', team);
    if (jobId) params.set('job_id', jobId);
    if (wsId && wsId !== 'all' && wsId !== 'pending') {
      params.set('workspace_id', wsId);
    }
    return params;
  };

  // Fetch historical cost data (static - past data doesn't change)
  const { data: costData, isLoading: costLoading } = useQuery<HistoricalData>({
    queryKey: ['historical-costs', days, filters.team, filters.jobId, effectiveWorkspaceId],
    queryFn: async ({ queryKey }) => {
      // Extract from queryKey to avoid closure issues
      const params = buildQueryParams(
        queryKey[1] as number,
        queryKey[2] as string | null,
        queryKey[3] as string | null,
        queryKey[4] as string
      );
      const res = await fetch(`/api/historical/costs?${params}`);
      if (!res.ok) throw new Error('Failed to fetch cost data');
      return res.json();
    },
    ...queryPresets.static, // Historical data never changes
    enabled: effectiveWorkspaceId !== 'pending',
  });

  // Fetch historical success rate data (static - past data doesn't change)
  const { data: successData, isLoading: successLoading } = useQuery<HistoricalData>({
    queryKey: ['historical-success', days, filters.team, filters.jobId, effectiveWorkspaceId],
    queryFn: async ({ queryKey }) => {
      const params = buildQueryParams(
        queryKey[1] as number,
        queryKey[2] as string | null,
        queryKey[3] as string | null,
        queryKey[4] as string
      );
      const res = await fetch(`/api/historical/success-rate?${params}`);
      if (!res.ok) throw new Error('Failed to fetch success rate data');
      return res.json();
    },
    ...queryPresets.static,
    enabled: effectiveWorkspaceId !== 'pending',
  });

  // Fetch historical SLA breach data (static - past data doesn't change)
  const { data: slaData, isLoading: slaLoading } = useQuery<HistoricalData>({
    queryKey: ['historical-sla', days, filters.team, filters.jobId, effectiveWorkspaceId],
    queryFn: async ({ queryKey }) => {
      const params = buildQueryParams(
        queryKey[1] as number,
        queryKey[2] as string | null,
        queryKey[3] as string | null,
        queryKey[4] as string
      );
      const res = await fetch(`/api/historical/sla-breaches?${params}`);
      if (!res.ok) throw new Error('Failed to fetch SLA data');
      return res.json();
    },
    ...queryPresets.static,
    enabled: effectiveWorkspaceId !== 'pending',
  });

  const isLoading = costLoading || successLoading || slaLoading;

  const granularityLabel = costData?.granularity === 'hourly'
    ? 'Hourly'
    : costData?.granularity === 'daily'
    ? 'Daily'
    : 'Weekly';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Historical Trends</h1>
          <p className="text-muted-foreground">
            {days}-day view with {granularityLabel.toLowerCase()} granularity
            {filters.team && ` | Team: ${filters.team}`}
            {filters.jobId && ` | Job filtered`}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricSummaryCard
          title="Total DBUs"
          currentValue={costData?.current_total ?? 0}
          previousValue={costData?.previous_total}
          changePercent={costData?.change_percent}
          invertColors={true}  // Lower cost is better
        />
        <MetricSummaryCard
          title="Avg Success Rate"
          currentValue={successData?.current_total ?? 0}
          previousValue={successData?.previous_total}
          changePercent={successData?.change_percent}
          format="percentage"
        />
        <MetricSummaryCard
          title="Total Failures"
          currentValue={slaData?.current_total ?? 0}
          previousValue={slaData?.previous_total}
          changePercent={slaData?.change_percent}
          invertColors={true}  // Fewer failures is better
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="costs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="costs" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Cost Trends
            </TabsTrigger>
            <TabsTrigger value="success" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Success Rate
            </TabsTrigger>
            <TabsTrigger value="failures" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Failures
            </TabsTrigger>
          </TabsList>

          <TabsContent value="costs" className="space-y-4">
            <div className="bg-card border rounded-lg p-4">
              <h3 className="font-medium mb-4">DBU Consumption Over Time</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Solid line shows current period, dashed line shows previous {days}-day period for comparison
              </p>
              {costData && (
                <HistoricalChart
                  data={costData.data}
                  granularity={costData.granularity}
                  formatValue={(v) => `${v.toLocaleString()} DBUs`}
                  currentLabel={`Current ${days}d`}
                  previousLabel={`Previous ${days}d`}
                  color="#3b82f6"
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="success" className="space-y-4">
            <div className="bg-card border rounded-lg p-4">
              <h3 className="font-medium mb-4">Success Rate Over Time</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Percentage of successful job runs per time period
              </p>
              {successData && (
                <HistoricalChart
                  data={successData.data}
                  granularity={successData.granularity}
                  formatValue={(v) => `${v.toFixed(1)}%`}
                  currentLabel={`Current ${days}d`}
                  previousLabel={`Previous ${days}d`}
                  color="#22c55e"
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="failures" className="space-y-4">
            <div className="bg-card border rounded-lg p-4">
              <h3 className="font-medium mb-4">Failures Over Time</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Count of failed job runs per time period
              </p>
              {slaData && (
                <HistoricalChart
                  data={slaData.data}
                  granularity={slaData.granularity}
                  formatValue={(v) => `${v.toLocaleString()} failures`}
                  currentLabel={`Current ${days}d`}
                  previousLabel={`Previous ${days}d`}
                  color="#ef4444"
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
