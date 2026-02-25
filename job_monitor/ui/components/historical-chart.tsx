/**
 * Historical trend chart component with previous period comparison.
 * Displays line chart with current period (solid) and previous period (dashed) overlay.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface DataPoint {
  date: string;
  current: number;
  previous: number;
}

type Granularity = 'hourly' | 'daily' | 'weekly';

interface HistoricalChartProps {
  data: DataPoint[];
  granularity: Granularity;
  yAxisLabel?: string;
  formatValue?: (value: number) => string;
  currentLabel?: string;
  previousLabel?: string;
  color?: string;
}

const defaultFormat = (value: number) => value.toLocaleString();

function formatXAxisTick(value: string, granularity: Granularity): string {
  try {
    const date = parseISO(value);
    switch (granularity) {
      case 'hourly':
        return format(date, 'MMM d HH:mm');
      case 'daily':
        return format(date, 'MMM d');
      case 'weekly':
        return format(date, 'MMM d');
      default:
        return format(date, 'MMM d');
    }
  } catch {
    return value;
  }
}

export function HistoricalChart({
  data,
  granularity,
  yAxisLabel,
  formatValue = defaultFormat,
  currentLabel = 'Current Period',
  previousLabel = 'Previous Period',
  color = '#3b82f6',
}: HistoricalChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No data available for selected period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatXAxisTick(v, granularity)}
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatValue}
          tick={{ fontSize: 11 }}
          label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined}
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatValue(value),
            name === 'current' ? currentLabel : previousLabel,
          ]}
          labelFormatter={(label) => {
            try {
              return format(parseISO(label), 'PPP');
            } catch {
              return label;
            }
          }}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend
          formatter={(value) => (value === 'current' ? currentLabel : previousLabel)}
        />
        {/* Current period - solid colored line */}
        <Line
          type="monotone"
          dataKey="current"
          name="current"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
        />
        {/* Previous period - dashed gray line */}
        <Line
          type="monotone"
          dataKey="previous"
          name="previous"
          stroke="#9ca3af"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
