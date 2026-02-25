/**
 * Metric summary card component with trend indicator.
 * Displays current value, previous value comparison, and change percentage.
 */
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricSummaryCardProps {
  title: string;
  currentValue: string | number;
  previousValue?: string | number;
  changePercent?: number;
  format?: 'number' | 'percentage' | 'currency';
  invertColors?: boolean;  // For metrics where decrease is good (e.g., failures)
}

export function MetricSummaryCard({
  title,
  currentValue,
  previousValue,
  changePercent = 0,
  format = 'number',
  invertColors = false,
}: MetricSummaryCardProps) {
  const isPositive = changePercent > 0;
  const isNegative = changePercent < 0;
  const isNeutral = Math.abs(changePercent) < 0.5;

  // Determine if change is "good" based on invertColors
  const isGood = invertColors ? isNegative : isPositive;
  const isBad = invertColors ? isPositive : isNegative;

  const TrendIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

  const formatValue = (value: string | number): string => {
    if (typeof value === 'string') return value;
    switch (format) {
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'currency':
        return `$${value.toLocaleString()}`;
      default:
        return value.toLocaleString();
    }
  };

  return (
    <div className="bg-card border rounded-lg p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold mt-1">{formatValue(currentValue)}</p>

      {previousValue !== undefined && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm text-muted-foreground">
            vs {formatValue(previousValue)}
          </span>
          <div
            className={cn(
              'flex items-center gap-1 text-sm',
              isNeutral && 'text-muted-foreground',
              isGood && 'text-green-600',
              isBad && 'text-red-600'
            )}
          >
            <TrendIcon className="h-3 w-3" />
            <span>{Math.abs(changePercent).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
