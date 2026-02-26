/**
 * Alerts page.
 * Dedicated page for reviewing all alerts with severity sections and category filtering.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCard } from '@/components/alert-card';
import {
  fetchAlerts,
  acknowledgeAlert,
  type AlertCategory,
  SEVERITY_CONFIG,
} from '@/lib/alert-utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { queryPresets, queryKeys } from '@/lib/query-config';

export default function AlertsPage() {
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | 'all'>('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.alerts.list(
      categoryFilter === 'all' ? undefined : { category: categoryFilter }
    ),
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

  // Group alerts by severity for display
  const p1Alerts = data?.alerts.filter(a => a.severity === 'P1') || [];
  const p2Alerts = data?.alerts.filter(a => a.severity === 'P2') || [];
  const p3Alerts = data?.alerts.filter(a => a.severity === 'P3') || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Alerts</h1>
        <div className="flex items-center gap-4">
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
      </div>

      {/* Summary badges */}
      <div className="flex gap-2">
        <Badge className={SEVERITY_CONFIG.P1.className}>
          {data?.by_severity.P1 || 0} Critical
        </Badge>
        <Badge className={SEVERITY_CONFIG.P2.className}>
          {data?.by_severity.P2 || 0} Warning
        </Badge>
        <Badge className={SEVERITY_CONFIG.P3.className}>
          {data?.by_severity.P3 || 0} Info
        </Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading alerts...</div>
      ) : data?.total === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No active alerts. All systems healthy.
        </div>
      ) : (
        <div className="space-y-8">
          {/* P1 Section */}
          {p1Alerts.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
                Critical ({p1Alerts.length})
              </h2>
              <div className="space-y-3">
                {p1Alerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* P2 Section */}
          {p2Alerts.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-orange-700 mb-3">
                Warning ({p2Alerts.length})
              </h2>
              <div className="space-y-3">
                {p2Alerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* P3 Section */}
          {p3Alerts.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-yellow-700 mb-3">
                Info ({p3Alerts.length})
              </h2>
              <div className="space-y-3">
                {p3Alerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
