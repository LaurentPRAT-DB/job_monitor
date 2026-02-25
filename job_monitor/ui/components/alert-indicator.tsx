/**
 * Alert indicator component for job rows.
 * Shows a small pill with bell icon and count for jobs with active alerts.
 */
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertSeverity } from '@/lib/alert-utils';

interface AlertIndicatorProps {
  alertCount: number;
  highestSeverity: AlertSeverity | null;
  onClick: () => void;
}

export function AlertIndicator({ alertCount, highestSeverity, onClick }: AlertIndicatorProps) {
  if (alertCount === 0 || !highestSeverity) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation(); // Don't trigger row expand
        onClick();
      }}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors',
        highestSeverity === 'P1' && 'bg-red-100 text-red-700 hover:bg-red-200',
        highestSeverity === 'P2' && 'bg-orange-100 text-orange-700 hover:bg-orange-200',
        highestSeverity === 'P3' && 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
      )}
      title={`${alertCount} active alert${alertCount > 1 ? 's' : ''}`}
    >
      <Bell className="h-3 w-3" />
      {alertCount}
    </button>
  );
}
