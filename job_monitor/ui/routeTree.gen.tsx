import { createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { AlertBadge } from './components/alert-badge'
import { FilterProvider } from '@/lib/filter-context'
import { GlobalFilterBar } from '@/components/global-filter-bar'
import { Sidebar, MobileNav } from '@/components/sidebar'
import { queryPresets } from '@/lib/query-config'

// Create a query client reference for prefetching
// This will be set when the router is created in main.tsx
let queryClientRef: QueryClient | null = null
export const setQueryClient = (qc: QueryClient) => { queryClientRef = qc }

/**
 * Prefetch adjacent page data in the background.
 * This improves perceived performance when users navigate between pages.
 */
const prefetchAdjacentPages = async (currentPath: string) => {
  if (!queryClientRef) return

  const adjacentPaths: Record<string, string[]> = {
    '/dashboard': ['/job-health', '/running-jobs'],
    '/job-health': ['/dashboard', '/alerts'],
    '/running-jobs': ['/dashboard', '/job-health'],
    '/alerts': ['/job-health', '/historical'],
    '/historical': ['/alerts', '/dashboard'],
  }

  const adjacent = adjacentPaths[currentPath] || []

  // Prefetch health metrics summary for dashboard/job-health
  if (adjacent.includes('/dashboard') || adjacent.includes('/job-health')) {
    queryClientRef.prefetchQuery({
      queryKey: ['health-metrics-summary'],
      queryFn: async () => {
        const res = await fetch('/api/health-metrics/summary?days=7')
        if (!res.ok) throw new Error('Failed to prefetch')
        return res.json()
      },
      ...queryPresets.semiLive,
    })
  }

  // Prefetch running jobs data when navigating towards running-jobs page
  if (adjacent.includes('/running-jobs')) {
    queryClientRef.prefetchQuery({
      queryKey: ['active-jobs'],
      queryFn: async () => {
        const res = await fetch('/api/jobs/active')
        if (!res.ok) throw new Error('Failed to prefetch')
        return res.json()
      },
      ...queryPresets.live,
    })
  }

  // Prefetch alerts data when navigating towards alerts page
  if (adjacent.includes('/alerts')) {
    queryClientRef.prefetchQuery({
      queryKey: ['alerts', {}],
      queryFn: async () => {
        const res = await fetch('/api/alerts?days=7')
        if (!res.ok) throw new Error('Failed to prefetch')
        return res.json()
      },
      ...queryPresets.slow,
    })
  }
}

// Root layout
const rootRoute = createRootRoute({
  component: () => (
    <FilterProvider>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          {/* Header with mobile nav and alerts */}
          <header className="flex justify-between items-center px-4 py-2 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
            <MobileNav />
            {/* Spacer for desktop (when MobileNav is hidden) */}
            <div className="hidden md:block" />
            <AlertBadge />
          </header>
          {/* Global filter bar */}
          <GlobalFilterBar />
          {/* Main content */}
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </FilterProvider>
  ),
})

// Sidebar layout (wrapper for pages in _sidebar folder)
const sidebarRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_sidebar',
  component: () => <Outlet />,
})

// Index route - redirect to dashboard
const indexRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' })
  },
})

// Dashboard route
import Dashboard from './routes/_sidebar/dashboard'
const dashboardRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/dashboard',
  component: Dashboard,
  loader: () => prefetchAdjacentPages('/dashboard'),
})

// Running jobs route
import RunningJobsPage from './routes/_sidebar/running-jobs'
const runningJobsRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/running-jobs',
  component: RunningJobsPage,
  loader: () => prefetchAdjacentPages('/running-jobs'),
})

// Job health route
import JobHealthPage from './routes/_sidebar/job-health'
const jobHealthRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/job-health',
  component: JobHealthPage,
  loader: () => prefetchAdjacentPages('/job-health'),
})

// Alerts route
import AlertsPage from './routes/_sidebar/alerts'
const alertsRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/alerts',
  component: AlertsPage,
  loader: () => prefetchAdjacentPages('/alerts'),
})

// Historical route
import HistoricalDashboard from './routes/_sidebar/historical'
const historicalRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/historical',
  component: HistoricalDashboard,
  loader: () => prefetchAdjacentPages('/historical'),
})

// Export route tree
export const routeTree = rootRoute.addChildren([
  sidebarRoute.addChildren([
    indexRoute,
    dashboardRoute,
    runningJobsRoute,
    jobHealthRoute,
    alertsRoute,
    historicalRoute,
  ]),
])
