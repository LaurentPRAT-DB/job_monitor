/**
 * Job health table row with expand/collapse functionality.
 * Shows job summary in collapsed state, detailed view when expanded.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from '@/components/status-indicator';
import { PriorityBadge } from '@/components/priority-badge';
import { OverProvisionedBadge } from '@/components/over-provisioned-badge';
import { JobExpandedDetails } from '@/components/job-expanded-details';
import { InlineSlaEdit } from '@/components/inline-sla-edit';
import { SlaSparkline } from '@/components/sla-sparkline';
import { AlertIndicator } from '@/components/alert-indicator';
import { AlertDrawer } from '@/components/alert-drawer';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/health-utils';
import type { JobWithSla } from '@/lib/health-utils';
import { type Alert, getAlertsForJob, getHighestSeverity } from '@/lib/alert-utils';

interface JobHealthRowProps {
  job: JobWithSla;
  onRefetch?: () => void;
  /** All alerts from parent table (to avoid N+1 queries) */
  allAlerts?: Alert[];
}

export function JobHealthRow({ job, onRefetch, allAlerts = [] }: JobHealthRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [alertDrawerOpen, setAlertDrawerOpen] = useState(false);

  // Check if last run breached SLA
  const lastRunBreachedSla =
    job.sla_minutes != null &&
    job.last_duration_seconds != null &&
    job.last_duration_seconds > job.sla_minutes * 60;

  // Get alerts for this job
  const jobAlerts = getAlertsForJob(allAlerts, job.job_id);
  const highestSeverity = getHighestSeverity(jobAlerts);
  const jobFilter = { jobId: job.job_id, jobName: job.job_name };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <>
        {/* Collapsed row - summary view */}
        <TableRow className={cn(
          'cursor-pointer hover:bg-gray-50',
          isOpen && 'bg-gray-50'
        )}>
          {/* Expand button */}
          <TableCell className="w-12">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    isOpen && 'rotate-180'
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </TableCell>

          {/* Job name with alert indicator */}
          <TableCell className="font-medium" onClick={() => setIsOpen(!isOpen)}>
            <div className="flex items-center gap-2">
              {job.job_name}
              <AlertIndicator
                alertCount={jobAlerts.length}
                highestSeverity={highestSeverity}
                onClick={() => setAlertDrawerOpen(true)}
              />
            </div>
          </TableCell>

          {/* Status (traffic light + percentage) */}
          <TableCell onClick={() => setIsOpen(!isOpen)}>
            <StatusIndicator successRate={job.success_rate} />
          </TableCell>

          {/* Priority badge */}
          <TableCell onClick={() => setIsOpen(!isOpen)}>
            <PriorityBadge priority={job.priority} />
          </TableCell>

          {/* SLA Target (inline edit) */}
          <TableCell>
            <div className="flex items-center gap-2">
              <InlineSlaEdit
                jobId={job.job_id}
                currentSlaMinutes={job.sla_minutes}
                suggestedP90Minutes={job.suggested_p90_minutes}
                onUpdate={onRefetch}
              />
              {lastRunBreachedSla && (
                <span className="inline-flex h-2 w-2 rounded-full bg-red-500" title="Last run breached SLA" />
              )}
            </div>
          </TableCell>

          {/* Breach history sparkline (hidden on mobile) */}
          <TableCell className="w-[140px] hidden md:table-cell">
            {job.breach_history && job.breach_history.length > 0 ? (
              <SlaSparkline data={job.breach_history} />
            ) : (
              <span className="text-gray-400">--</span>
            )}
          </TableCell>

          {/* Last run time */}
          <TableCell
            className="text-gray-500 text-sm"
            onClick={() => setIsOpen(!isOpen)}
          >
            Last run: {formatTimeAgo(job.last_run_time)}
          </TableCell>

          {/* Retry badge (if > 2) */}
          <TableCell onClick={() => setIsOpen(!isOpen)}>
            {job.retry_count > 2 && (
              <Badge
                variant="secondary"
                className="bg-orange-100 text-orange-700 text-xs"
              >
                {job.retry_count} retries
              </Badge>
            )}
          </TableCell>

          {/* Over-provisioned badge */}
          <TableCell onClick={() => setIsOpen(!isOpen)}>
            <OverProvisionedBadge show={job.is_over_provisioned ?? false} />
          </TableCell>
        </TableRow>

        {/* Expanded row - detailed view */}
        <CollapsibleContent asChild>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={9} className="p-0">
              <JobExpandedDetails jobId={job.job_id} jobName={job.job_name} />
            </TableCell>
          </TableRow>
        </CollapsibleContent>

        {/* Alert drawer for this job */}
        <AlertDrawer
          open={alertDrawerOpen}
          onOpenChange={setAlertDrawerOpen}
          jobFilter={jobFilter}
          onClearFilter={() => {}}
        />
      </>
    </Collapsible>
  );
}
