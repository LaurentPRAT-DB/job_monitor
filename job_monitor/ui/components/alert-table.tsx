/**
 * Alert table with sortable columns, expandable rows, search, and pagination.
 * Provides a compact list view with details on expand.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  ExternalLink,
  AlertTriangle,
  Clock,
  Zap,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type Alert,
  type AlertSeverity,
  SEVERITY_CONFIG,
  CATEGORY_LABELS,
  formatTimeAgo,
} from '@/lib/alert-utils';

type SortColumn = 'severity' | 'job_name' | 'category' | 'created_at' | 'title';
type SortDirection = 'asc' | 'desc';

interface AlertTableProps {
  alerts: Alert[];
  isLoading: boolean;
  onAcknowledge?: (alertId: string) => void;
  isAcknowledging?: boolean;
  severityFilter?: AlertSeverity | 'all';
}

// Severity sort order (P1 highest)
const severityOrder: Record<AlertSeverity, number> = { P1: 3, P2: 2, P3: 1 };

function compareAlerts(
  a: Alert,
  b: Alert,
  column: SortColumn,
  direction: SortDirection
): number {
  let result = 0;

  switch (column) {
    case 'severity':
      result = severityOrder[a.severity] - severityOrder[b.severity];
      break;
    case 'job_name':
      result = a.job_name.localeCompare(b.job_name);
      break;
    case 'category':
      result = a.category.localeCompare(b.category);
      break;
    case 'created_at':
      result =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      break;
    case 'title':
      result = a.title.localeCompare(b.title);
      break;
  }

  return direction === 'asc' ? result : -result;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Severity badge with distinct styling
function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <Badge className={cn('font-semibold', config.className)}>
      {severity} - {config.label}
    </Badge>
  );
}

// Category icon
function CategoryIcon({ category }: { category: string }) {
  switch (category) {
    case 'failure':
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case 'sla':
      return <Clock className="h-4 w-4 text-orange-500" />;
    case 'cost':
      return <Zap className="h-4 w-4 text-yellow-500" />;
    case 'cluster':
      return <Zap className="h-4 w-4 text-blue-500" />;
    default:
      return null;
  }
}

// Expandable alert row
function AlertRow({
  alert,
  onAcknowledge,
  isAcknowledging,
}: {
  alert: Alert;
  onAcknowledge?: (alertId: string) => void;
  isAcknowledging?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Row background based on severity
  const rowBgClass = {
    P1: 'bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50',
    P2: 'bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-950/50',
    P3: 'bg-yellow-50 dark:bg-yellow-950/20 hover:bg-yellow-100 dark:hover:bg-yellow-950/40',
  }[alert.severity];

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer transition-colors',
          rowBgClass,
          alert.acknowledged && 'opacity-60'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand toggle */}
        <TableCell className="w-10">
          <Button variant="ghost" size="icon" className="h-6 w-6">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </TableCell>

        {/* Severity */}
        <TableCell>
          <SeverityBadge severity={alert.severity} />
        </TableCell>

        {/* Job Name */}
        <TableCell className="font-medium max-w-[200px] truncate">
          {alert.job_name}
        </TableCell>

        {/* Category */}
        <TableCell>
          <div className="flex items-center gap-2">
            <CategoryIcon category={alert.category} />
            <span>{CATEGORY_LABELS[alert.category]}</span>
          </div>
        </TableCell>

        {/* Title */}
        <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
          {alert.title}
        </TableCell>

        {/* Time */}
        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
          {formatTimeAgo(alert.created_at)}
        </TableCell>

        {/* Status */}
        <TableCell>
          {alert.acknowledged ? (
            <Badge variant="outline" className="text-green-600 border-green-300">
              Acknowledged
            </Badge>
          ) : (
            <Badge variant="outline" className="text-gray-600 border-gray-300">
              Active
            </Badge>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded details row */}
      {isExpanded && (
        <TableRow className={cn('border-b-2', rowBgClass)}>
          <TableCell colSpan={7} className="p-0">
            <div className="p-4 space-y-4 bg-white/80 dark:bg-gray-900/80">
              {/* Description */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {alert.description}
                </p>
              </div>

              {/* Recommended Action */}
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">
                  Recommended Action
                </h4>
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  {alert.remediation}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                {!alert.acknowledged && onAcknowledge && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcknowledge(alert.id);
                    }}
                    disabled={isAcknowledging}
                    className="gap-1"
                  >
                    <Check className="h-3 w-3" />
                    Acknowledge
                  </Button>
                )}
                {alert.acknowledged && alert.acknowledged_at && (
                  <span className="text-xs text-muted-foreground">
                    Acknowledged {formatTimeAgo(alert.acknowledged_at)}
                  </span>
                )}
                <a
                  href={`/job-health?job=${alert.job_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  View Job Details <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function AlertTable({
  alerts,
  isLoading,
  onAcknowledge,
  isAcknowledging,
  severityFilter = 'all',
}: AlertTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('severity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Reset to page 1 when severity filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [severityFilter]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'job_name' || column === 'title' ? 'asc' : 'desc');
    }
  };

  // Filter alerts by search query and severity
  const filteredAlerts = useMemo(() => {
    let result = alerts;

    // Apply severity filter
    if (severityFilter !== 'all') {
      result = result.filter((alert) => alert.severity === severityFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (alert) =>
          alert.job_name.toLowerCase().includes(query) ||
          alert.title.toLowerCase().includes(query) ||
          alert.description.toLowerCase().includes(query) ||
          alert.category.toLowerCase().includes(query)
      );
    }

    return result;
  }, [alerts, searchQuery, severityFilter]);

  // Sort filtered alerts
  const sortedAlerts = useMemo(() => {
    return [...filteredAlerts].sort((a, b) =>
      compareAlerts(a, b, sortColumn, sortDirection)
    );
  }, [filteredAlerts, sortColumn, sortDirection]);

  // Paginate sorted alerts
  const totalPages = Math.ceil(sortedAlerts.length / pageSize);
  const paginatedAlerts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedAlerts.slice(start, start + pageSize);
  }, [sortedAlerts, currentPage, pageSize]);

  // Reset to page 1 when search or page size changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-30" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  const SortableHeader = ({
    column,
    children,
    className,
  }: {
    column: SortColumn;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead
      className={cn(
        'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none',
        className
      )}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center">
        {children}
        <SortIcon column={column} />
      </div>
    </TableHead>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">No active alerts</p>
        <p className="text-sm mt-1">All systems are running smoothly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and controls bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search alerts by job, title, or category..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Results count */}
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {searchQuery ? (
            <>
              Showing {filteredAlerts.length} of {alerts.length} alerts
            </>
          ) : (
            <>{alerts.length} alerts</>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800">
              <TableHead className="w-10"></TableHead>
              <SortableHeader column="severity" className="w-[120px]">
                Severity
              </SortableHeader>
              <SortableHeader column="job_name">Job Name</SortableHeader>
              <SortableHeader column="category" className="w-[100px]">
                Category
              </SortableHeader>
              <SortableHeader column="title">Title</SortableHeader>
              <SortableHeader column="created_at" className="w-[100px]">
                Time
              </SortableHeader>
              <TableHead className="w-[110px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedAlerts.length > 0 ? (
              paginatedAlerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={onAcknowledge}
                  isAcknowledging={isAcknowledging}
                />
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-gray-500 dark:text-gray-400"
                >
                  No alerts match your search
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      {sortedAlerts.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Page size selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Rows per page:
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={handlePageSizeChange}
            >
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Page info and navigation */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, sortedAlerts.length)} of{' '}
              {sortedAlerts.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                title="First page"
              >
                <ChevronLeft className="h-4 w-4" />
                <ChevronLeft className="h-4 w-4 -ml-2" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-700 dark:text-gray-300 min-w-[80px] text-center">
                Page {currentPage} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                title="Last page"
              >
                <ChevronRight className="h-4 w-4" />
                <ChevronRight className="h-4 w-4 -ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
