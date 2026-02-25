import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router'
import { AlertBadge } from './components/alert-badge'
import { FilterProvider } from '@/lib/filter-context'
import { GlobalFilterBar } from '@/components/global-filter-bar'

// Root layout
const rootRoute = createRootRoute({
  component: () => (
    <FilterProvider>
      <div className="flex min-h-screen">
        <aside className="w-64 bg-gray-900 text-white p-4">
          <h1 className="text-xl font-bold mb-6">Job Monitor</h1>
          <nav className="space-y-2">
            <a href="/dashboard" className="block px-3 py-2 rounded hover:bg-gray-700">Dashboard</a>
            <a href="/job-health" className="block px-3 py-2 rounded hover:bg-gray-700">Job Health</a>
            <a href="/alerts" className="block px-3 py-2 rounded hover:bg-gray-700">Alerts</a>
            <a href="/historical" className="block px-3 py-2 rounded hover:bg-gray-700">Historical</a>
          </nav>
        </aside>
        <main className="flex-1 flex flex-col">
          {/* Header with alerts */}
          <header className="flex justify-end items-center px-4 py-2 border-b bg-white">
            <AlertBadge />
          </header>
          {/* Global filter bar */}
          <GlobalFilterBar />
          {/* Main content */}
          <div className="flex-1">
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

// Dashboard route
import Dashboard from './routes/_sidebar/dashboard'
const dashboardRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/dashboard',
  component: Dashboard,
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
    dashboardRoute,
    jobHealthRoute,
    alertsRoute,
    historicalRoute,
  ]),
])
