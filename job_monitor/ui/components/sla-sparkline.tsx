/**
 * SLA breach history sparkline visualization.
 * Compact step chart showing breach/met status over recent runs.
 */
import { LineChart, Line, ResponsiveContainer } from 'recharts';

export interface BreachDataPoint {
  date: string;
  breached: boolean;
}

interface SlaSparklineProps {
  data: BreachDataPoint[];
  width?: number;
  height?: number;
}

/**
 * Compact sparkline showing SLA breach history.
 * Red if any breaches, green if all met.
 * Displays breach count badge next to sparkline.
 */
export function SlaSparkline({
  data,
  width = 100,
  height = 24,
}: SlaSparklineProps) {
  // Handle empty data gracefully
  if (!data || data.length === 0) {
    return <span className="text-gray-400 text-sm">--</span>;
  }

  // Convert breached boolean to numeric for chart (1 = met, 0 = breached)
  // Inverted so breaches dip down visually
  const chartData = data.map((point) => ({
    date: point.date,
    value: point.breached ? 0 : 1,
  }));

  // Count breaches
  const breachCount = data.filter((d) => d.breached).length;
  const hasBreaches = breachCount > 0;

  // Color based on breach status
  const lineColor = hasBreaches ? '#ef4444' : '#22c55e'; // red-500 : green-500

  return (
    <div className="flex items-center gap-2">
      <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line
              type="stepAfter"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {hasBreaches && (
        <span className="text-xs text-red-600 whitespace-nowrap">
          {breachCount} {breachCount === 1 ? 'breach' : 'breaches'}
        </span>
      )}
    </div>
  );
}
