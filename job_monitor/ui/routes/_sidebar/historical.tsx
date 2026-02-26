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
import { queryPresets } from '@/lib/query-config';

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

  // Build query params from filters
  const queryParams = new URLSearchParams();
  queryParams.set('days', String(days));
  if (filters.team) queryParams.set('team', filters.team);
  if (filters.jobId) queryParams.set('job_id', filters.jobId);

  // Fetch historical cost data (static - past data doesn't change)
  const { data: costData, isLoading: costLoading } = useQuery<HistoricalData>({
    queryKey: ['historical-costs', days, filters.team, filters.jobId],
    queryFn: async () => {
      const res = await fetch(`/api/historical/costs?${queryParams}`);
      if (!res.ok) throw new Error('Failed to fetch cost data');
      return res.json();
    },
    ...queryPresets.static, // Historical data never changes
  });

  // Fetch historical success rate data (static - past data doesn't change)
  const { data: successData, isLoading: successLoading } = useQuery<HistoricalData>({
    queryKey: ['historical-success', days, filters.team, filters.jobId],
    queryFn: async () => {
      const res = await fetch(`/api/historical/success-rate?${queryParams}`);
      if (!res.ok) throw new Error('Failed to fetch success rate data');
      return res.json();
    },
    ...queryPresets.static,
  });

  // Fetch historical SLA breach data (static - past data doesn't change)
  const { data: slaData, isLoading: slaLoading } = useQuery<HistoricalData>({
    queryKey: ['historical-sla', days, filters.team, filters.jobId],
    queryFn: async () => {
      const res = await fetch(`/api/historical/sla-breaches?${queryParams}`);
      if (!res.ok) throw new Error('Failed to fetch SLA data');
      return res.json();
    },
    ...queryPresets.static,
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
