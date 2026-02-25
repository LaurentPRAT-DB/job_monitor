import { createContext, useContext, ReactNode, useCallback, useMemo, useState, useEffect } from 'react';

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

function parseSearchParams(): FilterState {
  const searchParams = new URLSearchParams(window.location.search);
  return {
    team: searchParams.get('team'),
    jobId: searchParams.get('jobId'),
    timeRange: (searchParams.get('timeRange') as FilterState['timeRange']) ?? '7d',
    startDate: searchParams.get('startDate'),
    endDate: searchParams.get('endDate'),
  };
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<FilterState>(parseSearchParams);

  // Update filters when URL changes (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setFiltersState(parseSearchParams());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setFilters = useCallback((updates: Partial<FilterState>) => {
    const newParams = new URLSearchParams(window.location.search);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });
    const search = newParams.toString();
    const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
    setFiltersState(parseSearchParams());
  }, []);

  const clearFilters = useCallback(() => {
    window.history.replaceState(null, '', window.location.pathname);
    setFiltersState(parseSearchParams());
  }, []);

  const hasActiveFilters = useMemo(() => !!(
    filters.team ||
    filters.jobId ||
    filters.timeRange !== '7d' ||
    filters.startDate ||
    filters.endDate
  ), [filters]);

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
