import { useFilters } from '@/lib/filter-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimeRangePicker } from './time-range-picker';
import { FilterPresets } from './filter-presets';
import { Button } from '@/components/ui/button';
import { X, Filter } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface Team {
  team: string;
  job_count: number;
}

interface Job {
  job_id: string;
  job_name: string;
}

export function GlobalFilterBar() {
  const { filters, setFilters, clearFilters, hasActiveFilters } = useFilters();

  // Fetch teams for dropdown
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await fetch('/api/costs/summary');
      if (!res.ok) return [];
      const data = await res.json();
      return data.teams?.map((t: { team: string; total_dbus: number }) => ({
        team: t.team,
        job_count: 0,
      })) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch jobs for dropdown
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ['jobs-list'],
    queryFn: async () => {
      const res = await fetch('/api/health-metrics?days=30');
      if (!res.ok) return [];
      const data = await res.json();
      return data.jobs?.map((j: { job_id: string; job_name: string }) => ({
        job_id: j.job_id,
        job_name: j.job_name,
      })) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b">
      <Filter className="h-4 w-4 text-muted-foreground" />

      {/* Presets dropdown */}
      <FilterPresets />

      {/* Team filter */}
      <Select
        value={filters.team ?? 'all'}
        onValueChange={(v) => setFilters({ team: v === 'all' ? null : v })}
      >
        <SelectTrigger className="w-[160px] h-8 text-sm">
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
        <SelectTrigger className="w-[180px] h-8 text-sm">
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

      {/* Time range picker */}
      <TimeRangePicker />

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
