import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
