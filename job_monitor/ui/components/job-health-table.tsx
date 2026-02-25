/**
 * Job health table with expandable rows, sortable columns, search, and pagination.
 * Displays all jobs with their health status, supporting expand/collapse for details.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, ArrowUpDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { JobHealthRow } from '@/components/job-health-row';
import type { JobWithSla } from '@/lib/health-utils';
import { fetchAlerts, type Alert } from '@/lib/alert-utils';

type SortColumn = 'job_name' | 'success_rate' | 'priority' | 'sla_minutes' | 'last_run_time' | 'retry_count';
type SortDirection = 'asc' | 'desc';

interface JobHealthTableProps {
  jobs: JobWithSla[];
  isLoading: boolean;
  onRefetch?: () => void;
}

// Priority sort order (P1 highest, null lowest)
const priorityOrder: Record<string, number> = { P1: 3, P2: 2, P3: 1 };

function compareJobs(a: JobWithSla, b: JobWithSla, column: SortColumn, direction: SortDirection): number {
  let result = 0;

  switch (column) {
    case 'job_name':
      result = a.job_name.localeCompare(b.job_name);
      break;
    case 'success_rate':
      result = a.success_rate - b.success_rate;
      break;
    case 'priority':
      result = (priorityOrder[a.priority ?? ''] ?? 0) - (priorityOrder[b.priority ?? ''] ?? 0);
      break;
    case 'sla_minutes':
      result = (a.sla_minutes ?? 0) - (b.sla_minutes ?? 0);
      break;
    case 'last_run_time':
      result = new Date(a.last_run_time).getTime() - new Date(b.last_run_time).getTime();
      break;
    case 'retry_count':
      result = a.retry_count - b.retry_count;
      break;
  }

  return direction === 'asc' ? result : -result;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function JobHealthTable({ jobs, isLoading, onRefetch }: JobHealthTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('retry_count');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'job_name' ? 'asc' : 'desc');
    }
  };

  // Filter jobs by search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const query = searchQuery.toLowerCase();
    return jobs.filter((job) =>
      job.job_name.toLowerCase().includes(query) ||
      job.job_id.toLowerCase().includes(query)
    );
  }, [jobs, searchQuery]);

  // Sort filtered jobs
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => compareJobs(a, b, sortColumn, sortDirection));
  }, [filteredJobs, sortColumn, sortDirection]);

  // Paginate sorted jobs
  const totalPages = Math.ceil(sortedJobs.length / pageSize);
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedJobs.slice(start, start + pageSize);
  }, [sortedJobs, currentPage, pageSize]);

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
    return sortDirection === 'asc'
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const SortableHeader = ({ column, children, className }: { column: SortColumn; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none ${className ?? ''}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center">
        {children}
        <SortIcon column={column} />
      </div>
    </TableHead>
  );

  // Fetch all alerts once at table level to avoid N+1 queries
  const { data: alertsData } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => fetchAlerts(),
    refetchInterval: 60000,
  });

  const allAlerts: Alert[] = alertsData?.alerts ?? [];

  if (isLoading) {
    return (
      <div>
        {/* Search bar skeleton */}
        <div className="p-4 border-b">
          <div className="h-9 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Job Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>SLA Target</TableHead>
              <TableHead className="w-[140px] hidden md:table-cell">Breach History</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Retries</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i} className="animate-pulse">
                <td className="p-4 w-12">
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </td>
                <td className="p-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
                </td>
                <td className="p-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </td>
                <td className="p-4">
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-10"></div>
                </td>
                <td className="p-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                </td>
                <td className="p-4 hidden md:table-cell">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </td>
                <td className="p-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </td>
                <td className="p-4">
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                </td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium">No jobs found</p>
        <p className="text-sm mt-1">
          Jobs will appear here once they have run data in the selected time window.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Search and controls bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b dark:border-gray-700">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Results count */}
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {searchQuery ? (
            <>Showing {filteredJobs.length} of {jobs.length} jobs</>
          ) : (
            <>{jobs.length} jobs</>
          )}
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <SortableHeader column="job_name">Job Name</SortableHeader>
            <SortableHeader column="success_rate">Status</SortableHeader>
            <SortableHeader column="priority">Priority</SortableHeader>
            <SortableHeader column="sla_minutes">SLA Target</SortableHeader>
            <TableHead className="w-[140px] hidden md:table-cell">Breach History</TableHead>
            <SortableHeader column="last_run_time">Last Run</SortableHeader>
            <SortableHeader column="retry_count">Retries</SortableHeader>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedJobs.length > 0 ? (
            paginatedJobs.map((job) => (
              <JobHealthRow key={job.job_id} job={job} onRefetch={onRefetch} allAlerts={allAlerts} />
            ))
          ) : (
            <TableRow>
              <td colSpan={8} className="text-center py-8 text-gray-500 dark:text-gray-400">
                No jobs match your search
              </td>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination controls */}
      {sortedJobs.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t dark:border-gray-700">
          {/* Page size selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
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
              {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, sortedJobs.length)} of {sortedJobs.length}
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
