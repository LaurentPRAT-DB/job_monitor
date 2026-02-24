/**
 * Schema drift alert component.
 * Shows detected column changes: added, removed, type changed.
 */
import { AlertTriangle, Plus, Minus, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getChangeTypeColor,
  type SchemaDrift,
  type ColumnChange,
} from '@/lib/pipeline-utils';
import { cn } from '@/lib/utils';

interface SchemaDriftAlertProps {
  data: SchemaDrift;
}

function ChangeIcon({ type }: { type: string }) {
  switch (type) {
    case 'added': return <Plus className="h-3 w-3" />;
    case 'removed': return <Minus className="h-3 w-3" />;
    case 'type_changed': return <RefreshCw className="h-3 w-3" />;
    default: return null;
  }
}

function ColumnChangeItem({ change }: { change: ColumnChange }) {
  const color = getChangeTypeColor(change.change_type);

  return (
    <div className={cn('flex items-center gap-2 text-xs', color)}>
      <ChangeIcon type={change.change_type} />
      <span className="font-mono">{change.column_name}</span>
      {change.change_type === 'type_changed' && (
        <span className="text-gray-400">
          {change.old_type} &rarr; {change.new_type}
        </span>
      )}
    </div>
  );
}

export function SchemaDriftAlert({ data }: SchemaDriftAlertProps) {
  const { table_name, has_drift, added_columns, removed_columns, type_changes, detected_at } = data;

  if (!has_drift) return null;

  const totalChanges = added_columns.length + removed_columns.length + type_changes.length;

  return (
    <TooltipProvider>
      <div className="bg-amber-50 border border-amber-200 rounded p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h6 className="text-sm font-medium text-amber-800">
                Schema Drift Detected
              </h6>
              <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300">
                {totalChanges} change{totalChanges !== 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="text-xs text-amber-600 mt-0.5">
              Table: {table_name}
            </div>

            {/* Column changes */}
            <div className="mt-2 space-y-1">
              {added_columns.map((col) => (
                <ColumnChangeItem
                  key={`added-${col}`}
                  change={{ column_name: col, change_type: 'added', old_type: null, new_type: null }}
                />
              ))}
              {removed_columns.map((col) => (
                <ColumnChangeItem
                  key={`removed-${col}`}
                  change={{ column_name: col, change_type: 'removed', old_type: null, new_type: null }}
                />
              ))}
              {type_changes.map((change) => (
                <ColumnChangeItem key={`changed-${change.column_name}`} change={change} />
              ))}
            </div>

            {detected_at && (
              <div className="text-xs text-amber-500 mt-2">
                Detected: {new Date(detected_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
