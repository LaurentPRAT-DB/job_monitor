/**
 * Priority badge component for P1/P2/P3 job priorities.
 * P1: Red - 2+ consecutive failures
 * P2: Orange - most recent run failed (single failure)
 * P3: Yellow - success rate in yellow zone (70-89%)
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Priority = "P1" | "P2" | "P3" | null;

const PRIORITY_STYLES: Record<Exclude<Priority, null>, string> = {
  P1: "bg-red-600 hover:bg-red-700 text-white",
  P2: "bg-orange-500 hover:bg-orange-600 text-white",
  P3: "bg-yellow-500 hover:bg-yellow-600 text-black",
};

interface PriorityBadgeProps {
  priority: Priority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (!priority) return null;

  return (
    <Badge className={cn("font-bold", PRIORITY_STYLES[priority])}>
      {priority}
    </Badge>
  );
}
