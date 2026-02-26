import { useState } from 'react';
import { useFilters, FilterState } from '@/lib/filter-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bookmark, Plus, Trash2, Pencil } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface FilterPreset {
  id: string;
  name: string;
  team: string | null;
  job_id: string | null;
  job_name_patterns: string[];
  time_range: FilterState['timeRange'];
  start_date: string | null;
  end_date: string | null;
}

export function FilterPresets() {
  const { filters, setFilters } = useFilters();
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
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
          job_name_patterns: filters.jobNamePatterns,
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/filters/presets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          team: filters.team,
          job_id: filters.jobId,
          job_name_patterns: filters.jobNamePatterns,
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
      setEditingPresetId(null);
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
      jobNamePatterns: preset.job_name_patterns || [],
      timeRange: preset.time_range,
      startDate: preset.start_date,
      endDate: preset.end_date,
    });
  };

  const startEditing = (preset: FilterPreset) => {
    // Load preset values into current filters
    applyPreset(preset);
    setEditingPresetId(preset.id);
    setPresetName(preset.name);
    setSaveOpen(true);
  };

  const cancelEditing = () => {
    setEditingPresetId(null);
    setPresetName('');
    setSaveOpen(false);
  };

  const saveOrUpdate = () => {
    if (editingPresetId) {
      updateMutation.mutate({ id: editingPresetId, name: presetName });
    } else {
      createMutation.mutate(presetName);
    }
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
                    startEditing(preset);
                  }}
                  title="Edit preset"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(preset.id);
                  }}
                  title="Delete preset"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Save/Edit current filters as preset */}
      <Popover open={saveOpen} onOpenChange={(open) => {
        if (!open) cancelEditing();
        else setSaveOpen(open);
      }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-2">
            <Plus className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {editingPresetId ? 'Update preset' : 'Save current filters'}
            </p>
            <Input
              placeholder="Preset name (e.g., My Team Last 7d)"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              {editingPresetId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelEditing}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1"
                disabled={!presetName.trim()}
                onClick={saveOrUpdate}
              >
                {editingPresetId ? 'Update' : 'Save'} Preset
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
