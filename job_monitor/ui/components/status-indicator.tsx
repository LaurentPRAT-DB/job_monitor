/**
 * Traffic light status indicator for job success rate.
 * Shows colored dot (green/yellow/red) with percentage.
 */
import { cn } from "@/lib/utils";
import { getStatusColor } from "@/lib/health-utils";

const STATUS_COLORS = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
} as const;

interface StatusIndicatorProps {
  successRate: number;
}

export function StatusIndicator({ successRate }: StatusIndicatorProps) {
  const status = getStatusColor(successRate);

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "w-3 h-3 rounded-full",
          STATUS_COLORS[status]
        )}
        aria-label={`Status: ${status}`}
      />
      <span className="text-sm font-medium">
        {successRate.toFixed(1)}%
      </span>
    </div>
  );
}
