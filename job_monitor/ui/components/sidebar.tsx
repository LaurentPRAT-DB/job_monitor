import { useState } from 'react'
import { Moon, Sun, Menu, LayoutDashboard, Activity, Bell, History, Play } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/lib/theme-context'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getCurrentUser } from '@/lib/api'

// Version from package.json - updated at build time
const APP_VERSION = '1.1.0'
// Build timestamp - set during build or use current date
const BUILD_DATE = __BUILD_DATE__ ?? new Date().toISOString().split('T')[0]

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/running-jobs', label: 'Running Jobs', icon: Play },
  { href: '/job-health', label: 'Job Health', icon: Activity },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/historical', label: 'Historical', icon: History },
]

// Shared navigation content component
function NavigationContent({ onNavigate }: { onNavigate?: () => void }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const location = useLocation()
  const currentPath = location.pathname

  return (
    <>
      {/* Navigation - uses TanStack Router Link for SPA navigation */}
      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPath === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-gray-700 text-white font-medium'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer section */}
      <div className="border-t border-gray-700 pt-4 mt-4 space-y-3">
        {/* Dark mode toggle */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            {isDark ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
            <span>Dark mode</span>
          </div>
          <Switch checked={isDark} onCheckedChange={toggleTheme} />
        </div>

        {/* Version info */}
        <div className="px-1 text-xs text-gray-500">
          <div>v{APP_VERSION}</div>
          <div>Build: {BUILD_DATE}</div>
        </div>
      </div>
    </>
  )
}

// Desktop Sidebar - hidden on mobile
export function Sidebar() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: getCurrentUser,
    staleTime: Infinity, // User info doesn't change during session
  })

  return (
    <aside className="hidden md:flex w-64 bg-gray-900 text-white p-4 flex-col shrink-0">
      {/* App title and workspace */}
      <div className="mb-6">
        <h1 className="text-xl font-bold">Job Monitor</h1>
        {user?.workspace_name && (
          <div className="text-xs text-gray-400 mt-1" title={user.workspace_host || ''}>
            {user.workspace_name}
          </div>
        )}
      </div>
      <NavigationContent />
    </aside>
  )
}

// Mobile Navigation - hamburger menu with sheet
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: getCurrentUser,
    staleTime: Infinity,
  })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-gray-900 text-white border-gray-700 p-0">
        <SheetHeader className="p-4 border-b border-gray-700">
          <SheetTitle className="text-white text-xl font-bold">Job Monitor</SheetTitle>
          {user?.workspace_name && (
            <div className="text-xs text-gray-400" title={user.workspace_host || ''}>
              {user.workspace_name}
            </div>
          )}
        </SheetHeader>
        <div className="p-4 flex flex-col h-[calc(100%-65px)]">
          <NavigationContent onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Declare the global variable for TypeScript
declare const __BUILD_DATE__: string | undefined
