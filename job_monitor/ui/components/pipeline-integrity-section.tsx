/**
 * Pipeline integrity section.
 * Shows row count deltas and schema drift for job output tables.
 */
import { useQuery } from '@tanstack/react-query';
import { Database, AlertTriangle } from 'lucide-react';
import { RowCountDeltaCard } from '@/components/row-count-delta';
import { SchemaDriftAlert } from '@/components/schema-drift-alert';
import type { RowCountDelta, SchemaDrift } from '@/lib/pipeline-utils';

interface PipelineIntegritySectionProps {
  jobId: string;
}

async function fetchRowCounts(jobId: string): Promise<RowCountDelta[]> {
  const response = await fetch(`/api/pipeline/${jobId}/row-counts`);
  if (!response.ok) {
    throw new Error(`Failed to fetch row counts: ${response.statusText}`);
  }
  return response.json();
}

async function fetchSchemaDrift(jobId: string): Promise<SchemaDrift[]> {
  const response = await fetch(`/api/pipeline/${jobId}/schema-drift`);
  if (!response.ok) {
    throw new Error(`Failed to fetch schema drift: ${response.statusText}`);
  }
  return response.json();
}

export function PipelineIntegritySection({ jobId }: PipelineIntegritySectionProps) {
  const rowCountsQuery = useQuery({
    queryKey: ['row-counts', jobId],
    queryFn: () => fetchRowCounts(jobId),
    staleTime: 5 * 60 * 1000,
  });

  const schemaDriftQuery = useQuery({
    queryKey: ['schema-drift', jobId],
    queryFn: () => fetchSchemaDrift(jobId),
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = rowCountsQuery.isLoading || schemaDriftQuery.isLoading;
  const hasError = rowCountsQuery.error || schemaDriftQuery.error;

  const rowCounts = rowCountsQuery.data || [];
  const schemaDrifts = (schemaDriftQuery.data || []).filter((d) => d.has_drift);

  const hasData = rowCounts.length > 0 || schemaDrifts.length > 0;
  const hasNoTables = !isLoading && !hasError && !hasData;

  if (isLoading) {
    return (
      <div className="bg-white rounded border p-3 mt-3 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
        <div className="space-y-2">
          <div className="h-16 bg-gray-100 rounded"></div>
          <div className="h-16 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="bg-white rounded border p-3 mt-3 text-amber-600 text-sm flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        Unable to load pipeline data
      </div>
    );
  }

  if (hasNoTables) {
    return (
      <div className="bg-white rounded border p-3 mt-3">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Database className="h-4 w-4" />
          <span>No output tables configured for this job</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Add <code className="bg-gray-100 px-1 rounded">output_tables</code> tag to job settings to enable tracking.
        </p>
      </div>
    );
  }

  const anomalyCount = rowCounts.filter((r) => r.is_anomaly).length;

  return (
    <div className="bg-white rounded border p-3 mt-3">
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-sm font-semibold text-gray-700">
          Pipeline Integrity
        </h5>
        {(anomalyCount > 0 || schemaDrifts.length > 0) && (
          <span className="text-xs text-amber-600">
            {anomalyCount > 0 && `${anomalyCount} row count anomal${anomalyCount === 1 ? 'y' : 'ies'}`}
            {anomalyCount > 0 && schemaDrifts.length > 0 && ', '}
            {schemaDrifts.length > 0 && `${schemaDrifts.length} schema drift${schemaDrifts.length === 1 ? '' : 's'}`}
          </span>
        )}
      </div>

      {/* Schema Drift Alerts (show first, more urgent) */}
      {schemaDrifts.length > 0 && (
        <div className="space-y-2 mb-3">
          {schemaDrifts.map((drift) => (
            <SchemaDriftAlert key={drift.table_name} data={drift} />
          ))}
        </div>
      )}

      {/* Row Count Deltas */}
      {rowCounts.length > 0 && (
        <div className="space-y-2">
          {rowCounts.map((delta) => (
            <RowCountDeltaCard key={delta.table_name} data={delta} />
          ))}
        </div>
      )}
    </div>
  );
}
