/**
 * Alert badge component for header.
 * Displays bell icon with unacknowledged alert count.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAlerts, getUnacknowledgedCount } from "@/lib/alert-utils";
import { AlertDrawer } from "./alert-drawer";

export function AlertBadge() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [jobFilter, setJobFilter] = useState<{ jobId: string; jobName: string } | null>(null);

  // Fetch alerts for badge count
  const { data } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetchAlerts(),
    refetchInterval: 60000, // 60 seconds
  });

  const unacknowledgedCount = data ? getUnacknowledgedCount(data.alerts) : 0;
  const displayCount = unacknowledgedCount > 9 ? "9+" : unacknowledgedCount;

  const handleClearFilter = () => {
    setJobFilter(null);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={() => {
          setJobFilter(null); // Clear any filter when opening from header
          setDrawerOpen(true);
        }}
        aria-label={`Alerts (${unacknowledgedCount} unacknowledged)`}
      >
        <Bell className="h-5 w-5" />
        {unacknowledgedCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center bg-red-600 text-white text-xs font-bold rounded-full">
            {displayCount}
          </span>
        )}
      </Button>
      <AlertDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        jobFilter={jobFilter}
        onClearFilter={handleClearFilter}
      />
    </>
  );
}
