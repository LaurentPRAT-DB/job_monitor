import { createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router'
import { AlertBadge } from './components/alert-badge'
import { FilterProvider } from '@/lib/filter-context'
import { GlobalFilterBar } from '@/components/global-filter-bar'
import { Sidebar, MobileNav } from '@/components/sidebar'

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
})

// Running jobs route
import RunningJobsPage from './routes/_sidebar/running-jobs'
const runningJobsRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/running-jobs',
  component: RunningJobsPage,
})

// Job health route
import JobHealthPage from './routes/_sidebar/job-health'
const jobHealthRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/job-health',
  component: JobHealthPage,
})

// Alerts route
import AlertsPage from './routes/_sidebar/alerts'
const alertsRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/alerts',
  component: AlertsPage,
})

// Historical route
import HistoricalDashboard from './routes/_sidebar/historical'
const historicalRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/historical',
  component: HistoricalDashboard,
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
