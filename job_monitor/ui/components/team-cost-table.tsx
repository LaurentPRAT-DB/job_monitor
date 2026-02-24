/**
 * Team cost rollup table with sortable columns.
 * Displays team-level cost aggregations with trend indicators.
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
import { formatCost, formatTrendPercent, getTrendColor, getTrendBgColor } from '@/lib/cost-utils';

export interface TeamCost {
  team: string;
  total_dbus_30d: number;
  total_cost_dollars: number | null;
  job_count: number;
  trend_7d_percent: number;
}

interface TeamCostTableProps {
  teams: TeamCost[];
  showDollars: boolean;
  dbuRate: number;
  onTeamClick?: (team: string) => void;
  isLoading?: boolean;
}

type SortColumn = 'team' | 'total_dbus_30d' | 'job_count' | 'trend_7d_percent';
type SortDirection = 'asc' | 'desc';

export function TeamCostTable({
  teams,
  showDollars,
  dbuRate,
  onTeamClick,
  isLoading,
}: TeamCostTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_dbus_30d');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'team' ? 'asc' : 'desc');
    }
  };

  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'team':
          comparison = a.team.localeCompare(b.team);
          break;
        case 'total_dbus_30d':
          comparison = a.total_dbus_30d - b.total_dbus_30d;
          break;
        case 'job_count':
          comparison = a.job_count - b.job_count;
          break;
        case 'trend_7d_percent':
          comparison = a.trend_7d_percent - b.trend_7d_percent;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [teams, sortColumn, sortDirection]);

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
            <TableHead>Team</TableHead>
            <TableHead className="text-right">Total Cost</TableHead>
            <TableHead className="text-right">Jobs</TableHead>
            <TableHead className="text-right">7d Trend</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i} className="animate-pulse">
              <TableCell><div className="h-4 bg-gray-200 rounded w-24"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-20 ml-auto"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-12 ml-auto"></div></TableCell>
              <TableCell><div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium">No team cost data</p>
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
          <SortableHeader column="team">Team</SortableHeader>
          <SortableHeader column="total_dbus_30d" className="text-right">
            Total Cost (30d)
          </SortableHeader>
          <SortableHeader column="job_count" className="text-right">
            Jobs
          </SortableHeader>
          <SortableHeader column="trend_7d_percent" className="text-right">
            7d Trend
          </SortableHeader>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedTeams.map((team) => {
          const isUntagged = team.team === 'Untagged';
          return (
            <TableRow
              key={team.team}
              className={`
                ${onTeamClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                ${isUntagged ? 'bg-amber-50' : ''}
              `}
              onClick={() => onTeamClick?.(team.team)}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {isUntagged && (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className={isUntagged ? 'text-amber-700' : ''}>
                    {team.team}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCost(team.total_dbus_30d, showDollars, dbuRate)}
              </TableCell>
              <TableCell className="text-right">{team.job_count}</TableCell>
              <TableCell className="text-right">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-medium ${getTrendColor(team.trend_7d_percent)} ${getTrendBgColor(team.trend_7d_percent)}`}
                >
                  {formatTrendPercent(team.trend_7d_percent)}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
