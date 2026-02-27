/**
 * Alerts page.
 * Dedicated page for reviewing all alerts with sortable table view and category filtering.
 */
import { useState, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { queryPresets } from '@/lib/query-config';
import { RefreshCw, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFilters } from '@/lib/filter-context';
import { getCurrentUser, type UserInfo } from '@/lib/api';

const PAGE_SIZE = 50;

export default function AlertsPage() {
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const queryClient = useQueryClient();
  const { filters } = useFilters();

  // Fetch user info first (session preset - rarely changes)
  const { data: user } = useQuery<UserInfo>({
    queryKey: ['user'],
    queryFn: getCurrentUser,
    staleTime: Infinity,
  });

  // Determine effective workspace ID
  const userWorkspaceId = user?.workspace_id;
  const effectiveWorkspaceId = filters.workspaceId === 'all'
    ? 'all'
    : (filters.workspaceId || userWorkspaceId || 'pending');

  // Use the same query key as dashboard when no filter is applied
  // This ensures cache hits when navigating from dashboard to alerts
  // NOTE: Alerts endpoint is slow (15-30s) so use slow preset to reduce API calls
  const {
    data: alertsData,
    isLoading,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['alerts', categoryFilter, effectiveWorkspaceId],
    queryFn: async ({ queryKey, pageParam = 1 }) => {
      // Extract from queryKey to avoid closure issues
      const category = queryKey[1] as AlertCategory | 'all';
      const wsId = queryKey[2] as string;
      const workspaceId = wsId && wsId !== 'all' && wsId !== 'pending' ? wsId : undefined;
      return fetchAlerts({
        ...(category === 'all' ? {} : { category: [category] }),
        workspaceId,
        page: pageParam,
        page_size: PAGE_SIZE,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    ...queryPresets.slow, // Alerts query is expensive (15-30s), cache aggressively
    enabled: effectiveWorkspaceId !== 'pending',
  });

  // Flatten alerts from all pages, keep metadata from first page
  const data = useMemo(() => {
    if (!alertsData?.pages || alertsData.pages.length === 0) return null;
    const firstPage = alertsData.pages[0];
    const allAlerts = alertsData.pages.flatMap((page) => page.alerts);
    return {
      alerts: allAlerts,
      total: firstPage.total,
      by_severity: firstPage.by_severity,
    };
  }, [alertsData?.pages]);

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

      {/* Load More button */}
      {hasNextPage && (
        <div className="flex justify-center py-4">
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
              `Load More (${data?.alerts.length ?? 0} of ${data?.total ?? 0})`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
