/**
 * Banner displayed when the app is running with mock data
 * due to missing OBO (On-Behalf-Of) authentication.
 */
import { AlertTriangle, Info, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUser, type UserInfo } from '@/lib/api';
import { queryKeys, queryPresets } from '@/lib/query-config';
import { Button } from '@/components/ui/button';

export function MockDataBanner() {
  const [dismissed, setDismissed] = useState(false);

  const { data: user } = useQuery<UserInfo>({
    queryKey: queryKeys.user.current(),
    queryFn: getCurrentUser,
    ...queryPresets.session,
  });

  // Determine if mock data mode based on multiple signals
  const isLocalDev = user?.auth_mode === 'local';
  const isSPOnly = user?.auth_mode === 'service_principal';
  const isMockData = user?.is_mock_data || isLocalDev || isSPOnly;

  // Don't show if dismissed, loading, or using real data (OBO mode)
  if (dismissed || !user || !isMockData) {
    return null;
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800">
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {isLocalDev ? 'Local Development Mode' : 'Limited Data Access'}
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              {isLocalDev ? (
                <>
                  Running locally without Databricks authentication.
                  All data shown is <strong>mock data</strong> for testing purposes.
                </>
              ) : isSPOnly ? (
                <>
                  This workspace doesn't support OBO (On-Behalf-Of) authentication.
                  Without OBO, the app cannot access system tables with your permissions,
                  so it falls back to <strong>mock data</strong>.
                </>
              ) : (
                <>
                  Unable to authenticate with your user credentials.
                  Data shown may be <strong>mock data</strong>.
                </>
              )}
            </p>
            {isSPOnly && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  To see real data, deploy this app to a workspace that supports OBO
                  (requires <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">user_api_scopes: ["sql"]</code> in app.yaml
                  and a non-Free Edition workspace).
                </span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-8 w-8 p-0 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:text-amber-200 dark:hover:bg-amber-900"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
