/**
 * Duration trend chart component.
 * Displays line chart of job run durations with baseline and anomaly threshold lines.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { Payload } from 'recharts/types/component/DefaultTooltipContent';
import type { ReactNode } from 'react';

interface DurationDataPoint {
  run_time: string;
  duration_seconds: number;
}

interface DurationChartProps {
  data: DurationDataPoint[];
  medianBaseline: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Payload<number, string>[];
  label?: string | number;
}

export function DurationChart({ data, medianBaseline }: DurationChartProps) {
  const anomalyThreshold = medianBaseline * 2;

  // Custom dot renderer: larger red dots for anomalous points
  const renderDot = (props: {
    cx?: number;
    cy?: number;
    payload?: DurationDataPoint;
  }): ReactNode => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || !payload) return null;

    const isAnomaly = payload.duration_seconds > anomalyThreshold;

    return (
      <circle
        key={`dot-${cx}-${cy}`}
        cx={cx}
        cy={cy}
        r={isAnomaly ? 6 : 4}
        fill={isAnomaly ? '#ef4444' : '#3b82f6'}
        stroke={isAnomaly ? '#b91c1c' : '#1d4ed8'}
        strokeWidth={1}
      />
    );
  };

  // Format Y-axis ticks as minutes
  const formatYAxis = (value: number) => `${Math.round(value / 60)}m`;

  // Format X-axis ticks as short date
  const formatXAxis = (value: string) => {
    const date = new Date(value);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Custom tooltip content
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload || payload.length === 0) return null;

    const value = payload[0].value;
    if (typeof value !== 'number') return null;

    const minutes = Math.round(value / 60);
    let durationText: string;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMins = minutes % 60;
      durationText = `${hours}h ${remainingMins}m`;
    } else {
      durationText = `${minutes} minutes`;
    }

    const dateText = label ? new Date(String(label)).toLocaleString() : '';

    return (
      <div className="bg-white border border-gray-200 rounded-md p-2 shadow-sm text-xs">
        <p className="text-gray-500">{dateText}</p>
        <p className="font-medium">Duration: {durationText}</p>
      </div>
    );
  };

  if (data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-gray-500">
        No duration data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <XAxis
          dataKey="run_time"
          tickFormatter={formatXAxis}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 12 }}
          width={50}
        />
        <Tooltip content={<CustomTooltip />} />
        {/* Baseline reference line (dashed gray) */}
        {medianBaseline > 0 && (
          <ReferenceLine
            y={medianBaseline}
            stroke="#888888"
            strokeDasharray="5 5"
            label={{
              value: 'Baseline',
              position: 'right',
              fontSize: 10,
              fill: '#888888',
            }}
          />
        )}
        {/* Anomaly threshold line (dashed red) at 2x baseline */}
        {medianBaseline > 0 && (
          <ReferenceLine
            y={anomalyThreshold}
            stroke="#ef4444"
            strokeDasharray="3 3"
            label={{
              value: '2x Baseline',
              position: 'right',
              fontSize: 10,
              fill: '#ef4444',
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="duration_seconds"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={renderDot}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
