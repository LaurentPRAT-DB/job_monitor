/**
 * Over-provisioned badge for job list.
 * Matches visual weight of P1/P2/P3 priority badges.
 */
import { Badge } from '@/components/ui/badge';
import { Gauge } from 'lucide-react';

interface OverProvisionedBadgeProps {
  show: boolean;
}

export function OverProvisionedBadge({ show }: OverProvisionedBadgeProps) {
  if (!show) return null;

  return (
    <Badge
      variant="outline"
      className="bg-orange-50 text-orange-700 border-orange-300 text-xs gap-1"
    >
      <Gauge className="h-3 w-3" />
      Over-provisioned
    </Badge>
  );
}
