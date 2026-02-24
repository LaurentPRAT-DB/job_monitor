/**
 * Costs Dashboard page.
 * Displays cost breakdown by team and job, with anomaly detection for cost spikes and zombie jobs.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw, DollarSign } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TeamCostTable, type TeamCost } from '@/components/team-cost-table';
import { CostBreakdown, type JobCost } from '@/components/cost-breakdown';
import { AnomaliesTab, type CostAnomaly } from '@/components/anomalies-tab';
import { formatCost } from '@/lib/cost-utils';

// Types matching backend models
interface CostSummaryResponse {
  total_dbus_30d: number;
  dbu_rate: number;
  teams: TeamCost[];
  jobs: JobCost[];
  anomaly_count: number;
}

interface AnomaliesResponse {
  anomalies: CostAnomaly[];
  total_count: number;
}

async function fetchCostSummary(): Promise<CostSummaryResponse> {
  const response = await fetch('/api/costs/summary');
  if (!response.ok) {
    throw new Error(`Failed to fetch cost summary: ${response.statusText}`);
  }
  return response.json();
}

async function fetchAnomalies(): Promise<AnomaliesResponse> {
  const response = await fetch('/api/costs/anomalies');
  if (!response.ok) {
    throw new Error(`Failed to fetch anomalies: ${response.statusText}`);
  }
  return response.json();
}

export default function CostsPage() {
  const [showDollars, setShowDollars] = useState(false);
  const [activeTab, setActiveTab] = useState('by-team');

  const {
    data: costSummary,
    isLoading: isLoadingSummary,
    error: summaryError,
    refetch: refetchSummary,
    isFetching: isFetchingSummary,
  } = useQuery({
    queryKey: ['costs', 'summary'],
    queryFn: fetchCostSummary,
    staleTime: 5 * 60 * 1000, // 5 minutes (match system table latency)
    refetchOnWindowFocus: true,
  });

  const {
    data: anomaliesData,
    isLoading: isLoadingAnomalies,
  } = useQuery({
    queryKey: ['costs', 'anomalies'],
    queryFn: fetchAnomalies,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const dbuRate = costSummary?.dbu_rate ?? 0;
  const canShowDollars = dbuRate > 0;

  const handleRefresh = () => {
    refetchSummary();
  };

  const handleToggleDollars = () => {
    if (canShowDollars) {
      setShowDollars(!showDollars);
    }
  };

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cost Overview</h1>
          <p className="text-gray-500 text-sm mt-1">
            Track DBU consumption, cost attribution by team, and identify anomalies
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Dollar toggle */}
          <Button
            variant={showDollars ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleDollars}
            disabled={!canShowDollars}
            title={canShowDollars ? 'Toggle dollar display' : 'DBU rate not configured'}
          >
            <DollarSign className="h-4 w-4 mr-1" />
            {showDollars ? 'Show DBUs' : 'Show $'}
          </Button>

          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetchingSummary}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetchingSummary ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      {costSummary && !isLoadingSummary && (
        <div className="flex gap-6 mb-6">
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="text-sm text-gray-500">Total Cost (30d)</div>
            <div className="text-xl font-semibold font-mono">
              {formatCost(costSummary.total_dbus_30d, showDollars, dbuRate)}
            </div>
          </div>
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="text-sm text-gray-500">Teams</div>
            <div className="text-xl font-semibold">{costSummary.teams.length}</div>
          </div>
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="text-sm text-gray-500">Jobs</div>
            <div className="text-xl font-semibold">{costSummary.jobs.length}</div>
          </div>
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="text-sm text-gray-500">Anomalies</div>
            <div className={`text-xl font-semibold ${costSummary.anomaly_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {costSummary.anomaly_count}
            </div>
          </div>
          {!canShowDollars && (
            <div className="bg-amber-50 rounded-lg border border-amber-200 px-4 py-3">
              <div className="text-sm text-amber-700">DBU rate not configured</div>
              <div className="text-xs text-amber-600 mt-0.5">
                Set dbu_rate in config for $ display
              </div>
            </div>
          )}
        </div>
      )}

      {/* Time period badge */}
      <div className="mb-4">
        <Badge variant="secondary" className="text-xs">
          Last 30 days
        </Badge>
      </div>

      {/* Error state */}
      {summaryError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-medium text-red-800">
                Failed to load cost data
              </p>
              <p className="text-sm text-red-600">
                {(summaryError as Error).message}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="ml-auto"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main content tabs */}
      <div className="bg-white rounded-lg border shadow-sm">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="border-b px-4">
            <TabsList className="h-12">
              <TabsTrigger value="by-team" className="text-sm">
                By Team
              </TabsTrigger>
              <TabsTrigger value="by-job" className="text-sm">
                By Job
              </TabsTrigger>
              <TabsTrigger value="anomalies" className="text-sm relative">
                Anomalies
                {(anomaliesData?.total_count ?? 0) > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                    {anomaliesData?.total_count}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="by-team" className="m-0">
            <TeamCostTable
              teams={costSummary?.teams ?? []}
              showDollars={showDollars}
              dbuRate={dbuRate}
              isLoading={isLoadingSummary}
            />
          </TabsContent>

          <TabsContent value="by-job" className="m-0">
            <CostBreakdown
              jobs={costSummary?.jobs ?? []}
              showDollars={showDollars}
              dbuRate={dbuRate}
              isLoading={isLoadingSummary}
            />
          </TabsContent>

          <TabsContent value="anomalies" className="m-0">
            <AnomaliesTab
              anomalies={anomaliesData?.anomalies ?? []}
              showDollars={showDollars}
              dbuRate={dbuRate}
              isLoading={isLoadingAnomalies}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer note about data latency */}
      <p className="text-xs text-gray-400 mt-4">
        Data refreshes every 5-15 minutes from Databricks system tables.
        {costSummary && ` Showing 30-day cost data across ${costSummary.jobs.length} jobs.`}
      </p>
    </div>
  );
}
