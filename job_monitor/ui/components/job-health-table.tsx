/**
 * Job health table with expandable rows.
 * Displays all jobs with their health status, supporting expand/collapse for details.
 */
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { JobHealthRow } from '@/components/job-health-row';
import type { JobWithSla } from '@/lib/health-utils';
import { fetchAlerts, type Alert } from '@/lib/alert-utils';

interface JobHealthTableProps {
  jobs: JobWithSla[];
  isLoading: boolean;
  onRefetch?: () => void;
}

export function JobHealthTable({ jobs, isLoading, onRefetch }: JobHealthTableProps) {
  // Fetch all alerts once at table level to avoid N+1 queries
  const { data: alertsData } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => fetchAlerts(),
    refetchInterval: 60000, // 60 seconds
  });

  const allAlerts: Alert[] = alertsData?.alerts ?? [];

  if (isLoading) {
    return (
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
          {/* Skeleton rows */}
          {[1, 2, 3].map((i) => (
            <TableRow key={i} className="animate-pulse">
              <td className="p-4 w-12">
                <div className="h-8 w-8 bg-gray-200 rounded"></div>
              </td>
              <td className="p-4">
                <div className="h-4 bg-gray-200 rounded w-48"></div>
              </td>
              <td className="p-4">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </td>
              <td className="p-4">
                <div className="h-5 bg-gray-200 rounded w-10"></div>
              </td>
              <td className="p-4">
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </td>
              <td className="p-4 hidden md:table-cell">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </td>
              <td className="p-4">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </td>
              <td className="p-4">
                <div className="h-5 bg-gray-200 rounded w-16"></div>
              </td>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium">No jobs found</p>
        <p className="text-sm mt-1">
          Jobs will appear here once they have run data in the selected time window.
        </p>
      </div>
    );
  }

  return (
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
        {jobs.map((job) => (
          <JobHealthRow key={job.job_id} job={job} onRefetch={onRefetch} allAlerts={allAlerts} />
        ))}
      </TableBody>
    </Table>
  );
}
