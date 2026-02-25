/**
 * Dashboard page - displays system overview with summary metrics and recent activity.
 */
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Bell,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  RefreshCw
} from 'lucide-react'
import { getCurrentUser, type UserInfo } from '../../lib/api'
import { fetchAlerts, type Alert } from '@/lib/alert-utils'
import { Button } from '@/components/ui/button'

// Types for API responses
interface JobHealthResponse {
  jobs: Array<{
    job_id: string
    job_name: string
    success_rate: number
    priority: string | null
    last_run_time: string
    retry_count: number
  }>
  total_count: number
}

interface CostSummaryResponse {
  total_dbus_30d: number
  dbu_rate: number
  teams: Array<{ team: string; total_dbus: number }>
}

// Skeleton loader for metric cards
function MetricCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  )
}

// Metric card component
interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  href?: string
}

function MetricCard({ title, value, subtitle, icon: Icon, iconBg, iconColor, trend, trendValue, href }: MetricCardProps) {
  const content = (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-all ${href ? 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : trend === 'down' ? <TrendingDown className="h-3 w-3" /> : null}
            {trendValue}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{title}</div>
      {subtitle && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</div>}
    </div>
  )

  if (href) {
    return <a href={href}>{content}</a>
  }
  return content
}

// Recent activity item
interface ActivityItemProps {
  alert: Alert
}

function ActivityItem({ alert }: ActivityItemProps) {
  const severityStyles = {
    P1: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: AlertTriangle },
    P2: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', icon: AlertTriangle },
    P3: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', icon: Bell },
  }

  const style = severityStyles[alert.severity] || severityStyles.P3
  const Icon = style.icon

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className={`p-1.5 rounded ${style.bg}`}>
        <Icon className={`h-4 w-4 ${style.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {alert.title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {alert.job_name || alert.category}
        </p>
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
        {formatTimeAgo(alert.created_at)}
      </span>
    </div>
  )
}

// Format time ago
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export default function Dashboard() {
  // Fetch user info
  const { data: user, isLoading: userLoading } = useQuery<UserInfo>({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch job health metrics
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<JobHealthResponse>({
    queryKey: ['health-metrics', { days: 7 }],
    queryFn: async () => {
      const res = await fetch('/api/health-metrics?days=7')
      if (!res.ok) throw new Error('Failed to fetch health metrics')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Fetch alerts
  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => fetchAlerts(),
    staleTime: 60 * 1000,
  })

  // Fetch cost summary
  const { data: costData, isLoading: costLoading, refetch: refetchCosts } = useQuery<CostSummaryResponse>({
    queryKey: ['costs', 'summary'],
    queryFn: async () => {
      const res = await fetch('/api/costs/summary')
      if (!res.ok) throw new Error('Failed to fetch cost summary')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const isLoading = userLoading || healthLoading || alertsLoading || costLoading

  // Calculate metrics
  const totalJobs = healthData?.total_count ?? 0
  const criticalJobs = healthData?.jobs.filter(j => j.priority === 'P1').length ?? 0
  const avgSuccessRate = healthData?.jobs.length
    ? (healthData.jobs.reduce((sum, j) => sum + j.success_rate, 0) / healthData.jobs.length).toFixed(1)
    : '0'
  const totalAlerts = alertsData?.total ?? 0
  const criticalAlerts = alertsData?.by_severity?.P1 ?? 0
  const totalCost = costData?.total_dbus_30d ?? 0
  const recentAlerts = alertsData?.alerts?.slice(0, 5) ?? []

  const handleRefresh = () => {
    refetchHealth()
    refetchAlerts()
    refetchCosts()
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Welcome back{user?.display_name ? `, ${user.display_name.split(' ')[0]}` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard
              title="Total Jobs"
              value={totalJobs}
              subtitle={criticalJobs > 0 ? `${criticalJobs} critical` : 'All healthy'}
              icon={Activity}
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
              href="/job-health"
            />
            <MetricCard
              title="Active Alerts"
              value={totalAlerts}
              subtitle={criticalAlerts > 0 ? `${criticalAlerts} critical` : 'No critical alerts'}
              icon={Bell}
              iconBg={totalAlerts > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"}
              iconColor={totalAlerts > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}
              href="/alerts"
            />
            <MetricCard
              title="Success Rate"
              value={`${avgSuccessRate}%`}
              subtitle="7-day average"
              icon={CheckCircle2}
              iconBg="bg-green-100 dark:bg-green-900/30"
              iconColor="text-green-600 dark:text-green-400"
              trend={Number(avgSuccessRate) >= 95 ? 'up' : Number(avgSuccessRate) >= 80 ? 'neutral' : 'down'}
              trendValue={Number(avgSuccessRate) >= 95 ? 'Healthy' : Number(avgSuccessRate) >= 80 ? 'Warning' : 'Critical'}
            />
            <MetricCard
              title="DBU Cost (30d)"
              value={totalCost.toLocaleString()}
              subtitle={`${costData?.teams?.length ?? 0} teams`}
              icon={DollarSign}
              iconBg="bg-purple-100 dark:bg-purple-900/30"
              iconColor="text-purple-600 dark:text-purple-400"
              href="/historical"
            />
          </>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
            <a
              href="/alerts"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </a>
          </div>

          {alertsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 py-3 animate-pulse">
                  <div className="h-7 w-7 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="flex-1">
                    <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                    <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentAlerts.length > 0 ? (
            <div>
              {recentAlerts.map((alert) => (
                <ActivityItem key={alert.id} alert={alert} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">All systems healthy</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">No active alerts</p>
            </div>
          )}
        </div>

        {/* Quick Stats / System Status */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Status</h2>

          <div className="space-y-4">
            {/* Jobs by Priority */}
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-500 dark:text-gray-400">Jobs by Priority</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 bg-red-100 dark:bg-red-900/30 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-red-700 dark:text-red-400">
                    {healthData?.jobs.filter(j => j.priority === 'P1').length ?? 0}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-500">Critical</div>
                </div>
                <div className="flex-1 bg-orange-100 dark:bg-orange-900/30 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-orange-700 dark:text-orange-400">
                    {healthData?.jobs.filter(j => j.priority === 'P2').length ?? 0}
                  </div>
                  <div className="text-xs text-orange-600 dark:text-orange-500">Warning</div>
                </div>
                <div className="flex-1 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-400">
                    {healthData?.jobs.filter(j => j.priority === 'P3').length ?? 0}
                  </div>
                  <div className="text-xs text-yellow-600 dark:text-yellow-500">Info</div>
                </div>
                <div className="flex-1 bg-green-100 dark:bg-green-900/30 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-green-700 dark:text-green-400">
                    {healthData?.jobs.filter(j => !j.priority).length ?? 0}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-500">Healthy</div>
                </div>
              </div>
            </div>

            {/* Connection Status */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="flex items-center gap-3">
                <div className={`h-2.5 w-2.5 rounded-full ${user?.email === 'local-dev-user' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {user?.email === 'local-dev-user' ? 'Local Development' : 'Connected'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {user?.email === 'local-dev-user'
                      ? 'Running without Databricks OAuth'
                      : `Authenticated as ${user?.email}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Last Updated */}
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <Clock className="h-3 w-3" />
              Data refreshes every 5-15 minutes from system tables
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
