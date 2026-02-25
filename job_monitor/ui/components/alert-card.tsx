/**
 * Alert card component.
 * Displays individual alert with severity, details, and inline remediation.
 */
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type Alert,
  SEVERITY_CONFIG,
  CATEGORY_LABELS,
  formatTimeAgo,
} from "@/lib/alert-utils";
import { AlertSeverityBadge } from "./alert-severity-badge";

interface AlertCardProps {
  alert: Alert;
  onAcknowledge?: (alertId: string) => void;
  isAcknowledging?: boolean;
}

export function AlertCard({
  alert,
  onAcknowledge,
  isAcknowledging = false,
}: AlertCardProps) {
  const config = SEVERITY_CONFIG[alert.severity];

  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3 transition-opacity",
        config.cardClassName,
        alert.acknowledged && "opacity-60"
      )}
    >
      {/* Header row: severity badge, category, time */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertSeverityBadge severity={alert.severity} />
          <span className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[alert.category]}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatTimeAgo(alert.created_at)}
        </span>
      </div>

      {/* Title and description */}
      <div>
        <h4 className="font-semibold text-sm">{alert.title}</h4>
        <p className="text-sm text-muted-foreground mt-1">
          {alert.description}
        </p>
      </div>

      {/* Inline remediation - NO extra click needed */}
      <div className="bg-white/50 rounded px-3 py-2">
        <p className="text-xs font-medium text-gray-700">Recommended action:</p>
        <p className="text-sm text-gray-600 mt-0.5">{alert.remediation}</p>
      </div>

      {/* Action row: acknowledge button and view link */}
      <div className="flex items-center justify-between pt-1">
        {!alert.acknowledged && onAcknowledge && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAcknowledge(alert.id)}
            disabled={isAcknowledging}
            className="gap-1"
          >
            <Check className="h-3 w-3" />
            Acknowledge
          </Button>
        )}
        {alert.acknowledged && (
          <span className="text-xs text-muted-foreground">
            Acknowledged {alert.acknowledged_at ? formatTimeAgo(alert.acknowledged_at) : ""}
          </span>
        )}
        <a
          href={`/job-health?job=${alert.job_id}`}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          View job <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
