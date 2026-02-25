import { useState } from 'react';
import { useFilters, FilterState } from '@/lib/filter-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface FilterPreset {
  id: string;
  name: string;
  team: string | null;
  job_id: string | null;
  time_range: FilterState['timeRange'];
  start_date: string | null;
  end_date: string | null;
}

export function FilterPresets() {
  const { filters, setFilters } = useFilters();
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const queryClient = useQueryClient();

  const { data: presets = [] } = useQuery<FilterPreset[]>({
    queryKey: ['filter-presets'],
    queryFn: async () => {
      const res = await fetch('/api/filters/presets');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/filters/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          team: filters.team,
          job_id: filters.jobId,
          time_range: filters.timeRange,
          start_date: filters.startDate,
          end_date: filters.endDate,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filter-presets'] });
      setSaveOpen(false);
      setPresetName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/filters/presets/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filter-presets'] });
    },
  });

  const applyPreset = (preset: FilterPreset) => {
    setFilters({
      team: preset.team,
      jobId: preset.job_id,
      timeRange: preset.time_range,
      startDate: preset.start_date,
      endDate: preset.end_date,
    });
  };

  return (
    <div className="flex items-center gap-1">
      {/* Presets dropdown */}
      <Select onValueChange={(id) => {
        const preset = presets.find(p => p.id === id);
        if (preset) applyPreset(preset);
      }}>
        <SelectTrigger className="w-[140px] h-8 text-sm">
          <Bookmark className="h-3 w-3 mr-1" />
          <SelectValue placeholder="Presets" />
        </SelectTrigger>
        <SelectContent>
          {presets.length === 0 ? (
            <div className="px-2 py-1 text-sm text-muted-foreground">No saved presets</div>
          ) : (
            presets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-1">
                <SelectItem value={preset.id} className="flex-1">
                  {preset.name}
                </SelectItem>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(preset.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Save current filters as preset */}
      <Popover open={saveOpen} onOpenChange={setSaveOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-2">
            <Plus className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="space-y-2">
            <p className="text-sm font-medium">Save current filters</p>
            <Input
              placeholder="Preset name (e.g., My Team Last 7d)"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              className="w-full"
              disabled={!presetName.trim()}
              onClick={() => createMutation.mutate(presetName)}
            >
              Save Preset
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
