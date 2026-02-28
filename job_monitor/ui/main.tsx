import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { get, set, del } from 'idb-keyval'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/lib/theme-context'
import { defaultQueryClientOptions } from '@/lib/query-config'
import { routeTree, setQueryClient } from './routeTree.gen.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: defaultQueryClientOptions,
})

// Set queryClient for route prefetching
setQueryClient(queryClient)

/**
 * IndexedDB persister for TanStack Query cache.
 * Provides instant loading on return visits by restoring cached data.
 *
 * Only persists queries with gcTime >= 5 minutes (excludes live data).
 * Cache is automatically invalidated after 24 hours.
 */
const IDB_KEY = 'job-monitor-query-cache'
const MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours

const idbPersister = {
  persistClient: async (client: unknown) => {
    try {
      await set(IDB_KEY, client)
    } catch (e) {
      console.warn('Failed to persist query cache:', e)
    }
  },
  restoreClient: async () => {
    try {
      return await get(IDB_KEY)
    } catch (e) {
      console.warn('Failed to restore query cache:', e)
      return undefined
    }
  },
  removeClient: async () => {
    try {
      await del(IDB_KEY)
    } catch (e) {
      console.warn('Failed to remove query cache:', e)
    }
  },
}

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: idbPersister,
          maxAge: MAX_AGE,
          // Only persist queries with gcTime >= 5 minutes (skip live data)
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => {
              const gcTime = query.gcTime ?? 0
              return gcTime >= 5 * 60 * 1000
            },
          },
        }}
      >
        <RouterProvider router={router} />
        <Toaster />
      </PersistQueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
