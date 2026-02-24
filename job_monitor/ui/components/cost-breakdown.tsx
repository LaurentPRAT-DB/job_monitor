/**
 * Per-job cost breakdown table with SKU visualization.
 * Displays job-level costs with SKU category breakdown as mini bar.
 */
import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCost, formatTrendPercent, getTrendColor, getTrendBgColor, SKU_COLORS } from '@/lib/cost-utils';

interface CostBySku {
  sku_category: string;
  total_dbus: number;
  percentage: number;
}

export interface JobCost {
  job_id: string;
  job_name: string;
  team: string | null;
  total_dbus_30d: number;
  cost_by_sku: CostBySku[];
  trend_7d_percent: number;
}

interface CostBreakdownProps {
  jobs: JobCost[];
  showDollars: boolean;
  dbuRate: number;
  onJobClick?: (jobId: string) => void;
  isLoading?: boolean;
}

type SortColumn = 'job_name' | 'team' | 'total_dbus_30d' | 'trend_7d_percent';
type SortDirection = 'asc' | 'desc';

/**
 * SKU breakdown mini bar component.
 * Shows proportional bars for each SKU category.
 */
function SkuBreakdownBar({ costBySku }: { costBySku: CostBySku[] }) {
  if (!costBySku || costBySku.length === 0) {
    return <span className="text-gray-400 text-sm">No data</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-4 w-32 rounded overflow-hidden bg-gray-100">
            {costBySku.map((sku, idx) => (
              <div
                key={idx}
                style={{
                  width: `${sku.percentage}%`,
                  backgroundColor: SKU_COLORS[sku.sku_category] || SKU_COLORS['Other'],
                }}
                className="h-full transition-all"
              />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            {costBySku.map((sku, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <div
                  className="w-2 h-2 rounded"
                  style={{ backgroundColor: SKU_COLORS[sku.sku_category] || SKU_COLORS['Other'] }}
                />
                <span>{sku.sku_category}</span>
                <span className="text-gray-400">{sku.percentage.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function CostBreakdown({
  jobs,
  showDollars,
  dbuRate,
  onJobClick,
  isLoading,
}: CostBreakdownProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_dbus_30d');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'job_name' || column === 'team' ? 'asc' : 'desc');
    }
  };

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'job_name':
          comparison = a.job_name.localeCompare(b.job_name);
          break;
        case 'team':
          comparison = (a.team || 'zzz').localeCompare(b.team || 'zzz');
          break;
        case 'total_dbus_30d':
          comparison = a.total_dbus_30d - b.total_dbus_30d;
          break;
        case 'trend_7d_percent':
          comparison = a.trend_7d_percent - b.trend_7d_percent;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [jobs, sortColumn, sortDirection]);

  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4 inline ml-1" />
    ) : (
      <ChevronDown className="h-4 w-4 inline ml-1" />
    );
  };

  const SortableHeader = ({
    column,
    children,
    className = '',
  }: {
    column: SortColumn;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead
      className={`cursor-pointer hover:bg-gray-50 select-none ${className}`}
      onClick={() => handleSort(column)}
    >
      {children}
      <SortIndicator column={column} />
    </TableHead>
  );

  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job Name</TableHead>
            <TableHead>Team</TableHead>
            <TableHead className="text-right">Total Cost</TableHead>
            <TableHead>SKU Breakdown</TableHead>
            <TableHead className="text-right">7d Trend</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((i) => (
            <TableRow key={i} className="animate-pulse">
              <TableCell><div className="h-4 bg-gray-200 rounded w-40"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-20"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-20 ml-auto"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-32"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium">No job cost data</p>
        <p className="text-sm mt-1">
          Cost data will appear here once jobs have usage in the billing system.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader column="job_name">Job Name</SortableHeader>
          <SortableHeader column="team">Team</SortableHeader>
          <SortableHeader column="total_dbus_30d" className="text-right">
            Total Cost (30d)
          </SortableHeader>
          <TableHead>SKU Breakdown</TableHead>
          <SortableHeader column="trend_7d_percent" className="text-right">
            7d Trend
          </SortableHeader>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedJobs.map((job) => {
          const isUntagged = !job.team;
          return (
            <TableRow
              key={job.job_id}
              className={`
                ${onJobClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                ${isUntagged ? 'bg-amber-50/50' : ''}
              `}
              onClick={() => onJobClick?.(job.job_id)}
            >
              <TableCell className="font-medium max-w-[200px] truncate" title={job.job_name}>
                {job.job_name}
              </TableCell>
              <TableCell>
                {job.team ? (
                  job.team
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    Untagged
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCost(job.total_dbus_30d, showDollars, dbuRate)}
              </TableCell>
              <TableCell>
                <SkuBreakdownBar costBySku={job.cost_by_sku} />
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-medium ${getTrendColor(job.trend_7d_percent)} ${getTrendBgColor(job.trend_7d_percent)}`}
                >
                  {formatTrendPercent(job.trend_7d_percent)}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
