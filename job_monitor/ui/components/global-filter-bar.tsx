import { useState } from 'react';
import { useFilters } from '@/lib/filter-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimeRangePicker } from './time-range-picker';
import { FilterPresets } from './filter-presets';
import { JobPatternInput } from './job-pattern-input';
import { Button } from '@/components/ui/button';
import { X, Filter, ChevronDown, Globe } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { queryKeys, queryPresets } from '@/lib/query-config';
import { getCurrentUser, type UserInfo } from '@/lib/api';

interface Team {
  team: string;
  job_count: number;
}

interface Job {
  job_id: string;
  job_name: string;
}

export function GlobalFilterBar() {
  const [isOpen, setIsOpen] = useState(false);
  const { filters, setFilters, clearFilters, hasActiveFilters } = useFilters();

  // Get current user info for workspace name
  // Use standardized queryKey to enable cache sharing across components
  const { data: userInfo } = useQuery<UserInfo>({
    queryKey: queryKeys.user.current(),
    queryFn: getCurrentUser,
    ...queryPresets.session,
  });

  // Count active filters for badge
  const activeFilterCount = [
    filters.team,
    filters.jobId,
    filters.jobNamePatterns.length > 0 ? 'patterns' : null,
    filters.timeRange !== '7d' ? filters.timeRange : null,
    filters.workspaceId === 'all' ? 'all-workspaces' : null,
  ].filter(Boolean).length;

  // Fetch teams for dropdown - uses shared query key with costs page
  // Only fetch when filter panel is open to avoid unnecessary requests
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: queryKeys.costs.summary(),
    queryFn: async () => {
      const res = await fetch('/api/costs/summary');
      if (!res.ok) return [];
      const data = await res.json();
      return data.teams?.map((t: { team: string; total_dbus: number }) => ({
        team: t.team,
        job_count: 0,
      })) ?? [];
    },
    ...queryPresets.semiLive,
    enabled: isOpen, // Only fetch when panel is open
    select: (data: unknown) => {
      // Transform costs summary to teams list
      const summary = data as { teams?: Array<{ team: string; total_dbus: number }> };
      return summary.teams?.map((t) => ({
        team: t.team,
        job_count: 0,
      })) ?? [];
    },
  });

  // Fetch jobs for dropdown - uses shared query key with health page
  // Only fetch when filter panel is open
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: queryKeys.healthMetrics.list(30),
    queryFn: async () => {
      const res = await fetch('/api/health-metrics?days=30');
      if (!res.ok) return [];
      return res.json();
    },
    ...queryPresets.semiLive,
    enabled: isOpen, // Only fetch when panel is open
    select: (data: unknown) => {
      // Transform health metrics to jobs list
      const metrics = data as { jobs?: Array<{ job_id: string; job_name: string }> };
      return metrics.jobs?.map((j) => ({
        job_id: j.job_id,
        job_name: j.job_name,
      })) ?? [];
    },
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b bg-muted/50">
      {/* Collapsed header - always visible */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-2 text-muted-foreground hover:text-foreground"
          >
            <Filter className="h-4 w-4" />
            <span className="font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {activeFilterCount}
              </Badge>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>

        {/* Quick actions visible when collapsed */}
        {!isOpen && hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      {/* Expandable filter content */}
      <CollapsibleContent>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 pb-3 pt-1">
          {/* Workspace filter - highest level filter */}
          <Select
            value={filters.workspaceId ?? 'current'}
            onValueChange={(v) => setFilters({ workspaceId: v === 'current' ? null : v })}
          >
            <SelectTrigger className="w-[140px] sm:w-[180px] h-8 text-sm">
              <Globe className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Current Workspace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">
                {userInfo?.workspace_name || 'Current Workspace'}
              </SelectItem>
              <SelectItem value="all">All Workspaces</SelectItem>
            </SelectContent>
          </Select>

          {/* Presets dropdown */}
          <FilterPresets />

          {/* Team filter */}
          <Select
            value={filters.team ?? 'all'}
            onValueChange={(v) => setFilters({ team: v === 'all' ? null : v })}
          >
            <SelectTrigger className="w-[130px] sm:w-[160px] h-8 text-sm">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.team} value={team.team}>
                  {team.team || 'Untagged'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Job filter */}
          <Select
            value={filters.jobId ?? 'all'}
            onValueChange={(v) => setFilters({ jobId: v === 'all' ? null : v })}
          >
            <SelectTrigger className="w-[130px] sm:w-[180px] h-8 text-sm">
              <SelectValue placeholder="All Jobs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {jobs.map((job) => (
                <SelectItem key={job.job_id} value={job.job_id}>
                  {job.job_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Job name pattern input */}
          <JobPatternInput />

          {/* Time range picker */}
          <TimeRangePicker />

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8 px-2 text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
