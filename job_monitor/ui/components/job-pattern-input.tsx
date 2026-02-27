import { useState, KeyboardEvent } from 'react';
import { useFilters } from '@/lib/filter-context';
import { validateWildcardPattern } from '@/lib/filter-utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';

export function JobPatternInput() {
  const { filters, setFilters } = useFilters();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addPattern = () => {
    let pattern = inputValue.trim();
    if (!pattern) return;

    // Auto-wrap with wildcards if no wildcards present (substring search UX)
    if (!pattern.includes('*') && !pattern.includes('?')) {
      pattern = `*${pattern}*`;
    }

    const validationError = validateWildcardPattern(pattern);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Check for duplicates (case-insensitive)
    if (filters.jobNamePatterns.some((p) => p.toLowerCase() === pattern.toLowerCase())) {
      setError('Pattern already exists');
      return;
    }

    setFilters({ jobNamePatterns: [...filters.jobNamePatterns, pattern] });
    setInputValue('');
    setError(null);
  };

  const removePattern = (pattern: string) => {
    setFilters({
      jobNamePatterns: filters.jobNamePatterns.filter((p) => p !== pattern),
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPattern();
    }
  };

  return (
    <div className="space-y-2">
      {/* Pattern chips */}
      {filters.jobNamePatterns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.jobNamePatterns.map((pattern) => (
            <Badge
              key={pattern}
              variant="secondary"
              className="h-6 pl-2 pr-1 gap-1 text-xs font-mono"
            >
              {pattern}
              <button
                onClick={() => removePattern(pattern)}
                className="ml-0.5 hover:bg-muted-foreground/20 rounded-sm p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input field */}
      <div className="flex items-center gap-1.5">
        <Input
          placeholder="Filter jobs..."
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          className="h-8 text-sm w-[140px] sm:w-[160px] font-mono"
          title="Type a job name to filter. Press Enter to apply. Wildcards: * matches any, ? matches one character."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={addPattern}
          disabled={!inputValue.trim()}
          className="h-8 px-2"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Error message */}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
