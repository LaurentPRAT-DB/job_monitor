import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router'

// Root layout
const rootRoute = createRootRoute({
  component: () => (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-gray-900 text-white p-4">
        <h1 className="text-xl font-bold mb-6">Job Monitor</h1>
        <nav className="space-y-2">
          <a href="/dashboard" className="block px-3 py-2 rounded hover:bg-gray-700">Dashboard</a>
          <a href="/job-health" className="block px-3 py-2 rounded hover:bg-gray-700">Job Health</a>
        </nav>
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
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

// Job health route (lazy load)
const jobHealthRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: '/job-health',
  component: () => import('./routes/_sidebar/job-health').then(m => m.default),
})

// Export route tree
export const routeTree = rootRoute.addChildren([
  sidebarRoute.addChildren([
    dashboardRoute,
    jobHealthRoute,
  ]),
])
