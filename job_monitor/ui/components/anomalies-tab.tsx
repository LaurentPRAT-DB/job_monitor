/**
 * Cost anomalies and zombie jobs display.
 * Shows cost spikes and zombie jobs with quick links to Databricks job settings.
 */
import { ExternalLink, AlertTriangle, Ghost, TrendingUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCost } from '@/lib/cost-utils';

export interface CostAnomaly {
  job_id: string;
  job_name: string;
  team: string | null;
  anomaly_type: 'cost_spike' | 'zombie';
  reason: string;
  current_dbus: number;
  baseline_p90_dbus: number | null;
  multiplier: number | null;
  job_settings_url: string;
}

interface AnomaliesTabProps {
  anomalies: CostAnomaly[];
  showDollars: boolean;
  dbuRate: number;
  isLoading?: boolean;
}

function AnomalyTypeBadge({ type }: { type: 'cost_spike' | 'zombie' }) {
  if (type === 'cost_spike') {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
        <TrendingUp className="h-3 w-3 mr-1" />
        Cost Spike
      </Badge>
    );
  }
  return (
    <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
      <Ghost className="h-3 w-3 mr-1" />
      Zombie
    </Badge>
  );
}

export function AnomaliesTab({
  anomalies,
  showDollars,
  dbuRate,
  isLoading,
}: AnomaliesTabProps) {
  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job Name</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Multiplier</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i} className="animate-pulse">
              <TableCell><div className="h-4 bg-gray-200 rounded w-40"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-20"></div></TableCell>
              <TableCell><div className="h-5 bg-gray-200 rounded w-20"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-48"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div></TableCell>
              <TableCell><div className="h-8 bg-gray-200 rounded w-24"></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (anomalies.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="flex justify-center mb-4">
          <div className="bg-green-100 rounded-full p-3">
            <AlertTriangle className="h-6 w-6 text-green-600" />
          </div>
        </div>
        <p className="text-lg font-medium text-gray-700">No cost anomalies detected</p>
        <p className="text-sm text-gray-500 mt-1">
          All jobs are running within expected cost parameters.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job Name</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead className="text-right">Cost (30d)</TableHead>
          <TableHead className="text-right">Multiplier</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {anomalies.map((anomaly) => (
          <TableRow
            key={`${anomaly.job_id}-${anomaly.anomaly_type}`}
            className={anomaly.anomaly_type === 'cost_spike' ? 'bg-red-50/50' : 'bg-orange-50/50'}
          >
            <TableCell className="font-medium max-w-[200px] truncate" title={anomaly.job_name}>
              {anomaly.job_name}
            </TableCell>
            <TableCell>
              {anomaly.team || (
                <span className="text-amber-700 text-sm">Untagged</span>
              )}
            </TableCell>
            <TableCell>
              <AnomalyTypeBadge type={anomaly.anomaly_type} />
            </TableCell>
            <TableCell className="text-sm text-gray-600 max-w-[250px]" title={anomaly.reason}>
              {anomaly.reason}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCost(anomaly.current_dbus, showDollars, dbuRate)}
            </TableCell>
            <TableCell className="text-right">
              {anomaly.multiplier !== null ? (
                <span className="text-red-600 font-semibold">
                  {anomaly.multiplier.toFixed(1)}x
                </span>
              ) : (
                <span className="text-gray-400">--</span>
              )}
            </TableCell>
            <TableCell>
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a
                  href={anomaly.job_settings_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center"
                >
                  View Settings
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
