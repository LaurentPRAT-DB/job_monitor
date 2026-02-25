/**
 * Alert drawer component.
 * Slide-out panel displaying alerts grouped by severity with toast notifications.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  type Alert,
  type AlertSeverity,
  fetchAlerts,
  acknowledgeAlert,
  groupAlertsBySeverity,
  SEVERITY_CONFIG,
} from "@/lib/alert-utils";
import { AlertCard } from "./alert-card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface AlertDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional job filter - when set, only shows alerts for this job */
  jobFilter?: { jobId: string; jobName: string } | null;
  /** Callback to clear the job filter */
  onClearFilter?: () => void;
}

const SEVERITY_ORDER: AlertSeverity[] = ["P1", "P2", "P3"];

export function AlertDrawer({ open, onOpenChange, jobFilter, onClearFilter }: AlertDrawerProps) {
  const queryClient = useQueryClient();
  const previousAlertsRef = useRef<Set<string>>(new Set());
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Fetch alerts with 60s polling interval
  const { data, isLoading, error } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetchAlerts(),
    refetchInterval: 60000, // 60 seconds
  });

  // Acknowledge mutation with optimistic update
  const acknowledgeMutation = useMutation({
    mutationFn: acknowledgeAlert,
    onMutate: async (alertId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["alerts"] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(["alerts"]);

      // Optimistically update
      queryClient.setQueryData(
        ["alerts"],
        (old: { alerts: Alert[]; total: number; by_severity: Record<AlertSeverity, number> } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            alerts: old.alerts.map((alert) =>
              alert.id === alertId
                ? {
                    ...alert,
                    acknowledged: true,
                    acknowledged_at: new Date().toISOString(),
                  }
                : alert
            ),
          };
        }
      );

      return { previousData };
    },
    onError: (_err, _alertId, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["alerts"], context.previousData);
      }
      toast.error("Failed to acknowledge alert");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  // Toast notifications for new P1/P2 alerts
  useEffect(() => {
    if (!data?.alerts || isInitialLoad) {
      // Mark initial load complete after first fetch
      if (data?.alerts) {
        const initialIds = new Set(data.alerts.map((a) => a.id));
        previousAlertsRef.current = initialIds;
        setIsInitialLoad(false);
      }
      return;
    }

    const currentIds = new Set(data.alerts.map((a) => a.id));
    const previousIds = previousAlertsRef.current;

    // Find new alerts
    for (const alert of data.alerts) {
      if (!previousIds.has(alert.id) && !alert.acknowledged) {
        const config = SEVERITY_CONFIG[alert.severity];
        if (config.toastType) {
          // Only toast for P1/P2
          toast[config.toastType](alert.title, {
            description: alert.job_name,
            duration: config.toastDuration,
          });
        }
      }
    }

    previousAlertsRef.current = currentIds;
  }, [data?.alerts, isInitialLoad]);

  // Filter alerts by job if jobFilter is set
  const allAlerts = data?.alerts ?? [];
  const alerts = jobFilter
    ? allAlerts.filter((a) => a.job_id === jobFilter.jobId)
    : allAlerts;
  const groupedAlerts = groupAlertsBySeverity(alerts);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] sm:max-w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {jobFilter ? `Alerts for ${jobFilter.jobName}` : "Alerts"}
          </SheetTitle>
          <SheetDescription>
            {jobFilter ? (
              <span className="flex items-center gap-2">
                {alerts.length} alert{alerts.length !== 1 ? "s" : ""} for this job
                {onClearFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearFilter}
                    className="h-5 px-2 text-xs"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear filter
                  </Button>
                )}
              </span>
            ) : data ? (
              `${data.total} total alerts`
            ) : (
              "Loading..."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {isLoading && (
            <div className="text-center text-muted-foreground py-8">
              Loading alerts...
            </div>
          )}

          {error && (
            <div className="text-center text-red-500 py-8">
              Failed to load alerts
            </div>
          )}

          {!isLoading && !error && alerts.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No alerts at this time
            </div>
          )}

          {!isLoading &&
            !error &&
            SEVERITY_ORDER.map((severity) => {
              const severityAlerts = groupedAlerts[severity];
              if (severityAlerts.length === 0) return null;

              return (
                <div key={severity}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        severity === "P1"
                          ? "bg-red-600"
                          : severity === "P2"
                            ? "bg-orange-500"
                            : "bg-yellow-500"
                      }`}
                    />
                    {SEVERITY_CONFIG[severity].label} ({severityAlerts.length})
                  </h3>
                  <div className="space-y-3">
                    {severityAlerts.map((alert) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                        isAcknowledging={acknowledgeMutation.isPending}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
