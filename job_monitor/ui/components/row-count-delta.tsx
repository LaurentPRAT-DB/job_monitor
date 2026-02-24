/**
 * Row count delta visualization.
 * Shows current vs baseline with delta percentage and mini trend chart.
 */
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import {
  formatRowCount,
  formatDeltaPercent,
  getDeltaColor,
  ROW_COUNT_ANOMALY_THRESHOLD,
  type RowCountDelta as RowCountDeltaType,
} from '@/lib/pipeline-utils';
import { cn } from '@/lib/utils';

interface RowCountDeltaProps {
  data: RowCountDeltaType;
}

export function RowCountDeltaCard({ data }: RowCountDeltaProps) {
  const { table_name, current_row_count, baseline_row_count, delta_percent, is_anomaly, trend } = data;

  const TrendIcon = delta_percent >= 0 ? TrendingUp : TrendingDown;
  const deltaColor = getDeltaColor(delta_percent, is_anomaly);

  return (
    <TooltipProvider>
      <div className={cn(
        'bg-white rounded border p-3',
        is_anomaly && 'border-amber-300 bg-amber-50/30'
      )}>
        <div className="flex items-start justify-between gap-4">
          {/* Table info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h6 className="text-sm font-medium text-gray-700 truncate" title={table_name}>
                {table_name.split('.').pop()}
              </h6>
              {is_anomaly && (
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Row count deviation exceeds {ROW_COUNT_ANOMALY_THRESHOLD}% threshold
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            <div className="mt-1 text-xs text-gray-500">
              Full path: {table_name}
            </div>

            {/* Counts */}
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-lg font-semibold text-gray-900">
                {formatRowCount(current_row_count)}
              </span>
              <span className="text-xs text-gray-400">
                vs {formatRowCount(baseline_row_count)} baseline
              </span>
            </div>

            {/* Delta */}
            <div className={cn('flex items-center gap-1 mt-1', deltaColor)}>
              <TrendIcon className="h-3 w-3" />
              <span className="text-sm font-medium">
                {formatDeltaPercent(delta_percent)}
              </span>
              {is_anomaly && (
                <Badge variant="outline" className="ml-2 text-xs bg-amber-100 text-amber-700 border-amber-300">
                  Anomaly
                </Badge>
              )}
            </div>
          </div>

          {/* Mini trend sparkline */}
          {trend && trend.length > 1 && (
            <div className="w-20 h-12 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={is_anomaly ? '#f59e0b' : '#6b7280'}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
