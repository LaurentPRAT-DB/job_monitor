import { useState } from 'react';
import { useFilters } from '@/lib/filter-context';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format, subDays } from 'date-fns';

type TimeRange = '7d' | '30d' | '90d' | 'custom';

const presets: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
];

export function TimeRangePicker() {
  const { filters, setFilters } = useFilters();
  const [customOpen, setCustomOpen] = useState(false);

  const handlePresetClick = (range: TimeRange) => {
    setFilters({ timeRange: range, startDate: null, endDate: null });
  };

  return (
    <div className="flex items-center gap-1">
      {/* Preset buttons */}
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant={filters.timeRange === preset.value ? 'default' : 'outline'}
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => handlePresetClick(preset.value)}
        >
          {preset.label}
        </Button>
      ))}

      {/* Custom date picker */}
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={filters.timeRange === 'custom' ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1 text-xs"
          >
            <CalendarIcon className="h-3 w-3" />
            {filters.timeRange === 'custom' && filters.startDate && filters.endDate
              ? `${format(new Date(filters.startDate), 'MMM d')} - ${format(new Date(filters.endDate), 'MMM d')}`
              : 'Custom'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={filters.startDate ? new Date(filters.startDate) : subDays(new Date(), 30)}
            selected={{
              from: filters.startDate ? new Date(filters.startDate) : undefined,
              to: filters.endDate ? new Date(filters.endDate) : undefined,
            }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                setFilters({
                  timeRange: 'custom',
                  startDate: format(range.from, 'yyyy-MM-dd'),
                  endDate: format(range.to, 'yyyy-MM-dd'),
                });
                setCustomOpen(false);
              }
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
