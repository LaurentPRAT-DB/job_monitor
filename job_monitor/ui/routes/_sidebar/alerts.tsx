/**
 * Alerts page.
 * Dedicated page for reviewing all alerts with sortable table view and category filtering.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTable } from '@/components/alert-table';
import {
  fetchAlerts,
  acknowledgeAlert,
  type AlertCategory,
  type AlertSeverity,
  SEVERITY_CONFIG,
} from '@/lib/alert-utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { queryPresets, queryKeys } from '@/lib/query-config';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function AlertsPage() {
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const queryClient = useQueryClient();

  // Use the same query key as dashboard when no filter is applied
  // This ensures cache hits when navigating from dashboard to alerts
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: categoryFilter === 'all'
      ? queryKeys.alerts.all
      : queryKeys.alerts.list({ category: categoryFilter }),
    queryFn: () => fetchAlerts(
      categoryFilter === 'all' ? {} : { category: [categoryFilter] }
    ),
    ...queryPresets.live, // Alerts need freshness
    refetchInterval: 60000, // Also poll every minute
  });

  const acknowledgeMutation = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Alerts</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Category filter tabs */}
        <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as AlertCategory | 'all')}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="failure">Failure</TabsTrigger>
            <TabsTrigger value="sla">SLA</TabsTrigger>
            <TabsTrigger value="cost">Cost</TabsTrigger>
            <TabsTrigger value="cluster">Cluster</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary badges - clickable to filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={cn(
            SEVERITY_CONFIG.P1.className,
            'cursor-pointer transition-all',
            severityFilter === 'P1' && 'ring-2 ring-offset-2 ring-red-500'
          )}
          onClick={() => setSeverityFilter(severityFilter === 'P1' ? 'all' : 'P1')}
        >
          {data?.by_severity.P1 || 0} Critical
        </Badge>
        <Badge
          className={cn(
            SEVERITY_CONFIG.P2.className,
            'cursor-pointer transition-all',
            severityFilter === 'P2' && 'ring-2 ring-offset-2 ring-orange-500'
          )}
          onClick={() => setSeverityFilter(severityFilter === 'P2' ? 'all' : 'P2')}
        >
          {data?.by_severity.P2 || 0} Warning
        </Badge>
        <Badge
          className={cn(
            SEVERITY_CONFIG.P3.className,
            'cursor-pointer transition-all',
            severityFilter === 'P3' && 'ring-2 ring-offset-2 ring-yellow-500'
          )}
          onClick={() => setSeverityFilter(severityFilter === 'P3' ? 'all' : 'P3')}
        >
          {data?.by_severity.P3 || 0} Info
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            'ml-2 cursor-pointer transition-all',
            severityFilter === 'all' && 'ring-2 ring-offset-2 ring-gray-400'
          )}
          onClick={() => setSeverityFilter('all')}
        >
          {data?.total || 0} Total
        </Badge>
        {severityFilter !== 'all' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSeverityFilter('all')}
            className="h-6 px-2 text-xs text-muted-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Clear filter
          </Button>
        )}
      </div>

      {/* Alert Table */}
      <AlertTable
        alerts={data?.alerts || []}
        isLoading={isLoading}
        onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
        isAcknowledging={acknowledgeMutation.isPending}
        severityFilter={severityFilter}
      />
    </div>
  );
}
