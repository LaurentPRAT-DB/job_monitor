/**
 * Cluster utilization gauges component.
 * Shows 4 mini circular gauges for Driver/Worker CPU/Memory.
 * Uses inverted traffic light: Green=high(good), Red=low(wasteful).
 */
import { useQuery } from '@tanstack/react-query';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { AlertTriangle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  getUtilizationColor,
  formatPercentage,
  type ClusterUtilization,
} from '@/lib/cluster-utils';

interface UtilizationGaugeProps {
  label: string;
  percentage: number | null;
  size?: number;
}

function UtilizationGauge({ label, percentage, size = 60 }: UtilizationGaugeProps) {
  const color = getUtilizationColor(percentage);
  const displayValue = percentage !== null ? Math.round(percentage) : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: size, height: size }}>
        <CircularProgressbar
          value={displayValue}
          text={formatPercentage(percentage)}
          styles={buildStyles({
            textSize: '22px',
            pathColor: color,
            textColor: color,
            trailColor: 'rgb(var(--muted))',
            pathTransitionDuration: 0.5,
          })}
        />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

async function fetchClusterUtilization(jobId: string): Promise<ClusterUtilization> {
  const response = await fetch(`/api/cluster-metrics/${jobId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch cluster metrics: ${response.statusText}`);
  }
  return response.json();
}

interface ClusterUtilizationSectionProps {
  jobId: string;
}

export function ClusterUtilizationSection({ jobId }: ClusterUtilizationSectionProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cluster-utilization', jobId],
    queryFn: () => fetchClusterUtilization(jobId),
    staleTime: 5 * 60 * 1000, // 5 minutes (matches system table latency)
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded border p-3 mt-3 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-3"></div>
        <div className="flex justify-around">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-[60px] h-[60px] bg-muted rounded-full"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded border p-3 mt-3 text-amber-600 dark:text-amber-400 text-sm flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        Unable to load cluster metrics
      </div>
    );
  }

  if (!data) return null;

  const gauges = [
    { label: 'Driver CPU', value: data.driver_cpu_percent },
    { label: 'Driver Mem', value: data.driver_memory_percent },
    { label: 'Worker CPU', value: data.worker_cpu_percent },
    { label: 'Worker Mem', value: data.worker_memory_percent },
  ];

  // Check if all metrics are null (no billing data available)
  const hasNoMetrics = gauges.every((g) => g.value === null);

  // No runs with valid duration found
  if (data.runs_analyzed === 0) {
    return (
      <div className="bg-card rounded border p-3 mt-3">
        <h5 className="text-sm font-semibold text-foreground mb-2">
          Cluster Utilization
        </h5>
        <div className="flex items-start gap-2 text-muted-foreground text-sm">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p>No runs with measurable duration found in the last 30 days.</p>
            <p className="text-xs mt-1">
              Utilization analysis requires runs with duration &gt; 0. This can happen when:
            </p>
            <ul className="text-xs mt-1 list-disc list-inside space-y-0.5">
              <li>Job uses serverless compute with instant task completion</li>
              <li>All recent runs failed before recording duration</li>
              <li>Job hasn't run successfully in the last 30 days</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Runs found but no billing data
  if (hasNoMetrics) {
    return (
      <div className="bg-card rounded border p-3 mt-3">
        <h5 className="text-sm font-semibold text-foreground mb-2">
          Cluster Utilization
          <span className="text-xs font-normal text-muted-foreground ml-2">
            ({data.runs_analyzed} runs found)
          </span>
        </h5>
        <div className="flex items-start gap-2 text-muted-foreground text-sm">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p>No billing data available for utilization estimation.</p>
            <p className="text-xs mt-1">
              This can happen when:
            </p>
            <ul className="text-xs mt-1 list-disc list-inside space-y-0.5">
              <li>Job uses serverless compute (billed differently)</li>
              <li>Billing data has 24-48 hour lag</li>
              <li>Job runs are very short or use external compute</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="bg-card rounded border p-3 mt-3">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-sm font-semibold text-foreground">
            Cluster Utilization
            <span className="text-xs font-normal text-muted-foreground ml-2">
              (Avg. last {data.runs_analyzed} runs, estimated)
            </span>
          </h5>
          <Tooltip>
            <TooltipTrigger>
              <span className="text-xs text-muted-foreground cursor-help">?</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>Green = efficient (60%+), Yellow = fair (40-60%), Red = low (&lt;40%, over-provisioned).</p>
              <p className="mt-1">Metrics are estimated from DBU consumption patterns.</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex justify-around">
          {gauges.map((gauge) => (
            <UtilizationGauge
              key={gauge.label}
              label={gauge.label}
              percentage={gauge.value}
            />
          ))}
        </div>

        {/* Over-provisioned warning with recommendation */}
        {data.is_over_provisioned && data.recommendation && (
          <div className="mt-3 p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm">
            <span className="text-red-700 dark:text-red-400 font-medium">Over-provisioned: </span>
            <span className="text-red-600 dark:text-red-300">{data.recommendation}</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
