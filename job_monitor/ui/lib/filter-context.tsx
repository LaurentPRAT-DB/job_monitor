import { createContext, useContext, ReactNode } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';

export interface FilterState {
  team: string | null;
  jobId: string | null;
  timeRange: '7d' | '30d' | '90d' | 'custom';
  startDate: string | null;  // ISO date string
  endDate: string | null;    // ISO date string
}

export interface FilterContextType {
  filters: FilterState;
  setFilters: (updates: Partial<FilterState>) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  // Read from URL search params using strict: false to work at any route
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();

  const filters: FilterState = {
    team: search.team ?? null,
    jobId: search.jobId ?? null,
    timeRange: (search.timeRange as FilterState['timeRange']) ?? '7d',
    startDate: search.startDate ?? null,
    endDate: search.endDate ?? null,
  };

  const setFilters = (updates: Partial<FilterState>) => {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        Object.entries(updates).forEach(([key, value]) => {
          if (value === null) {
            delete next[key];
          } else {
            next[key] = value;
          }
        });
        return next;
      },
      replace: true,
    });
  };

  const clearFilters = () => {
    navigate({ search: {}, replace: true });
  };

  const hasActiveFilters = !!(
    filters.team ||
    filters.jobId ||
    filters.timeRange !== '7d' ||
    filters.startDate ||
    filters.endDate
  );

  return (
    <FilterContext.Provider value={{ filters, setFilters, clearFilters, hasActiveFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
