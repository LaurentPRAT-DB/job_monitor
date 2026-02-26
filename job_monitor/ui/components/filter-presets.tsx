import { useState } from 'react';
import { useFilters, FilterState } from '@/lib/filter-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bookmark, Plus, Trash2, Pencil, X, Check } from 'lucide-react';
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
  const [editingPresetName, setEditingPresetName] = useState<string | null>(null);
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
      setEditingPresetName(null);
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
    // Set editing mode WITHOUT opening dialog - let user modify filters first
    setEditingPresetId(preset.id);
    setEditingPresetName(preset.name);
    setPresetName(preset.name);
    // Don't open dialog yet - user can modify filters, then click save
  };

  const cancelEditing = () => {
    setEditingPresetId(null);
    setEditingPresetName(null);
    setPresetName('');
    setSaveOpen(false);
  };

  const openSaveDialog = () => {
    // Pre-fill name if editing
    if (editingPresetId && editingPresetName) {
      setPresetName(editingPresetName);
    }
    setSaveOpen(true);
  };

  const saveOrUpdate = () => {
    if (editingPresetId) {
      updateMutation.mutate({ id: editingPresetId, name: presetName });
    } else {
      createMutation.mutate(presetName);
    }
  };

  // Check if we're in editing mode
  const isEditing = editingPresetId !== null;

  return (
    <div className="flex items-center gap-1">
      {/* Editing mode indicator */}
      {isEditing && (
        <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-xs text-blue-700 dark:text-blue-300">
          <Pencil className="h-3 w-3" />
          <span className="max-w-[100px] truncate">Editing: {editingPresetName}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-blue-200 dark:hover:bg-blue-800"
            onClick={cancelEditing}
            title="Cancel editing"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Presets dropdown */}
      <Select onValueChange={(id) => {
        const preset = presets.find(p => p.id === id);
        if (preset) {
          // Clear editing mode when selecting a different preset
          if (editingPresetId) cancelEditing();
          applyPreset(preset);
        }
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

      {/* Save/Update button with popover */}
      <Popover open={saveOpen} onOpenChange={(open) => {
        if (!open) {
          setSaveOpen(false);
          // Don't cancel editing mode when closing popover - user might want to modify more
        } else {
          openSaveDialog();
        }
      }}>
        <PopoverTrigger asChild>
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            className={`h-8 px-2 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
            title={isEditing ? `Update "${editingPresetName}"` : 'Save current filters as preset'}
          >
            {isEditing ? (
              <Check className="h-3 w-3" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {isEditing ? 'Update preset' : 'Save current filters'}
            </p>
            {isEditing && (
              <p className="text-xs text-muted-foreground">
                Modify filters above, then save changes here.
              </p>
            )}
            <Input
              placeholder="Preset name (e.g., My Team Last 7d)"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              {isEditing && (
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
                {isEditing ? 'Update' : 'Save'} Preset
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
