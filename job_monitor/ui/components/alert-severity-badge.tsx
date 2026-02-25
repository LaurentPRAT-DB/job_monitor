/**
 * Alert severity badge component.
 * Displays severity with color-coded icon and optional label.
 * Uses distinct colors from PriorityBadge (P1/P2/P3 job priorities).
 */
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type AlertSeverity, SEVERITY_CONFIG } from "@/lib/alert-utils";

interface AlertSeverityBadgeProps {
  severity: AlertSeverity;
  showLabel?: boolean;
  className?: string;
}

const SEVERITY_ICONS = {
  P1: AlertCircle,
  P2: AlertTriangle,
  P3: Info,
} as const;

export function AlertSeverityBadge({
  severity,
  showLabel = false,
  className,
}: AlertSeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = SEVERITY_ICONS[severity];

  return (
    <Badge className={cn("font-bold gap-1", config.className, className)}>
      <Icon className="h-3 w-3" />
      {showLabel ? config.label : severity}
    </Badge>
  );
}
