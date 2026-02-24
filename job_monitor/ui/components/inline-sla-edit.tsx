/**
 * Inline SLA target editor component.
 * Click-to-edit pattern with auto-suggest from p90 duration.
 */
import { useState } from 'react';
import { Check, Pencil, X, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { updateJobTags } from '@/lib/api';

interface InlineSlaEditProps {
  jobId: string;
  currentSlaMinutes: number | null;
  suggestedP90Minutes: number | null;
  onUpdate?: () => void;
}

/**
 * Format minutes to display string (e.g., "30m").
 */
function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Inline editable SLA target with auto-suggest.
 * Shows current SLA or "--" if none defined.
 * Pencil icon appears on hover for editing.
 */
export function InlineSlaEdit({
  jobId,
  currentSlaMinutes,
  suggestedP90Minutes,
  onUpdate,
}: InlineSlaEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState<string>(
    currentSlaMinutes?.toString() ?? ''
  );

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (slaMinutes: number) =>
      updateJobTags(jobId, { sla_minutes: slaMinutes }),
    onSuccess: () => {
      // Invalidate health metrics queries to refetch with new SLA
      queryClient.invalidateQueries({ queryKey: ['health-metrics'] });
      setIsEditing(false);
      onUpdate?.();
    },
  });

  const handleSave = () => {
    const value = parseInt(inputValue, 10);
    if (!isNaN(value) && value > 0) {
      mutation.mutate(value);
    }
  };

  const handleCancel = () => {
    setInputValue(currentSlaMinutes?.toString() ?? '');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Edit mode
  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <div className="relative">
          <input
            type="number"
            min="1"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={suggestedP90Minutes?.toString() ?? ''}
            className="w-16 h-7 px-2 pr-6 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            disabled={mutation.isPending}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
            m
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
          onClick={handleSave}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          onClick={handleCancel}
          disabled={mutation.isPending}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // Display mode
  return (
    <div
      className="group flex items-center gap-1 cursor-pointer"
      onClick={() => {
        setInputValue(currentSlaMinutes?.toString() ?? '');
        setIsEditing(true);
      }}
    >
      <span className={currentSlaMinutes ? 'text-gray-900' : 'text-gray-400'}>
        {currentSlaMinutes ? formatMinutes(currentSlaMinutes) : '--'}
      </span>
      <Pencil className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      {!currentSlaMinutes && suggestedP90Minutes && (
        <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
          (p90: {formatMinutes(suggestedP90Minutes)})
        </span>
      )}
    </div>
  );
}
