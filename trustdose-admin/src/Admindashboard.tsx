// React-only version (no Next.js, no shadcn/ui)
// File: src/AdminDashboard.tsx

import React, { useState } from 'react'
import { Users, Activity, Settings, TrendingUp, Shield, FileText, AlertCircle } from 'lucide-react'

// ============== Minimal UI primitives (Tailwind-based) ==============
// These replace shadcn/ui so the component works in plain React projects.

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Card
export function Card({ className, children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cx('rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900', className)}>{children}</div>
}
export function CardHeader({ className, children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cx('p-5', className)}>{children}</div>
}
export function CardTitle({ className, children }: React.PropsWithChildren<{ className?: string }>) {
  return <h3 className={cx('text-base font-semibold text-zinc-900 dark:text-zinc-50', className)}>{children}</h3>
}
export function CardDescription({ className, children }: React.PropsWithChildren<{ className?: string }>) {
  return <p className={cx('mt-1 text-sm text-zinc-500 dark:text-zinc-400', className)}>{children}</p>
}
export function CardContent({ className, children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cx('p-5 pt-0', className)}>{children}</div>
}

// Badge
export function Badge({ variant = 'default', className, children }: React.PropsWithChildren<{ variant?: 'default'|'secondary'|'outline', className?: string }>) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
  const styles = {
    default: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
    secondary: 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
    outline: 'border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200',
  } as const
  return <span className={cx(base, styles[variant], className)}>{children}</span>
}

// Button
export function Button({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default'|'outline'|'ghost'; size?: 'sm'|'md'|'lg' }) {
  const base = 'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'
  const sizes = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-5 text-base',
  }
  const variants = {
    default: 'bg-zinc-900 text-white hover:bg-zinc-800 focus:ring-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200',
    outline: 'border border-zinc-300 hover:bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800',
    ghost: 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800',
  }
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} {...props}>
      {children}
    </button>
  )
}

// Table
export function Table({ className, children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cx('overflow-x-auto', className)}><table className="min-w-full border-separate border-spacing-y-2">{children}</table></div>
}
export function TableHeader({ children }: React.PropsWithChildren) { return <thead>{children}</thead> }
export function TableBody({ children }: React.PropsWithChildren) { return <tbody>{children}</tbody> }
export function TableRow({ className, children }: React.PropsWithChildren<{ className?: string }>) { return <tr className={cx('bg-white dark:bg-zinc-900', className)}>{children}</tr> }
export function TableHead({ children }: React.PropsWithChildren) { return <th className="px-4 py-2 text-left text-xs font-semibold text-zinc-500">{children}</th> }
export function TableCell({ className, children }: React.PropsWithChildren<{ className?: string }>) { return <td className={cx('px-4 py-3 align-middle text-sm text-zinc-700 dark:text-zinc-200', className)}>{children}</td> }

// ============== Admin Dashboard (React-only) ==============
export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'logs'>('overview')

  const stats = [
    { title: 'Total Users', value: '1,284', change: '+12.5%', icon: Users, trend: 'up' as const },
    { title: 'Active Sessions', value: '342', change: '+5.2%', icon: Activity, trend: 'up' as const },
    { title: 'System Health', value: '98.5%', change: '+0.3%', icon: TrendingUp, trend: 'up' as const },
    { title: 'Security Alerts', value: '3', change: '-2', icon: Shield, trend: 'down' as const },
  ]

  const recentUsers = [
    { id: 1, name: 'Sarah Johnson', email: 'sarah.j@example.com', role: 'Admin', status: 'Active', joined: '2024-03-15' },
    { id: 2, name: 'Mike Chen', email: 'mike.c@example.com', role: 'User', status: 'Active', joined: '2024-03-14' },
    { id: 3, name: 'Emma Wilson', email: 'emma.w@example.com', role: 'Moderator', status: 'Active', joined: '2024-03-13' },
    { id: 4, name: 'James Brown', email: 'james.b@example.com', role: 'User', status: 'Inactive', joined: '2024-03-12' },
    { id: 5, name: 'Lisa Anderson', email: 'lisa.a@example.com', role: 'User', status: 'Active', joined: '2024-03-11' },
  ]

  const systemLogs = [
    { id: 1, action: 'User login', user: 'sarah.j@example.com', time: '2 minutes ago', severity: 'info' as const },
    { id: 2, action: 'Database backup completed', user: 'System', time: '15 minutes ago', severity: 'success' as const },
    { id: 3, action: 'Failed login attempt', user: 'unknown@example.com', time: '1 hour ago', severity: 'warning' as const },
    { id: 4, action: 'Settings updated', user: 'admin@example.com', time: '2 hours ago', severity: 'info' as const },
  ]

  return (
    <div className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Admin Dashboard</h1>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">Manage users, monitor system health, and view analytics</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <FileText className="mr-2 h-4 w-4" />
              Export Report
            </Button>
            <Button size="sm">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Card key={index} className="border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-zinc-500">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{stat.value}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={stat.trend === 'up' ? 'outline' : 'outline'} className={stat.trend === 'up' ? 'border-green-200 text-green-700 dark:border-green-700 dark:text-green-300' : 'text-zinc-500'}>
                    {stat.change}
                  </Badge>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">from last month</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <Button variant={activeTab === 'overview' ? 'default' : 'ghost'} onClick={() => setActiveTab('overview')} className="rounded-b-none">
            Overview
          </Button>
          <Button variant={activeTab === 'users' ? 'default' : 'ghost'} onClick={() => setActiveTab('users')} className="rounded-b-none">
            Users
          </Button>
          <Button variant={activeTab === 'logs' ? 'default' : 'ghost'} onClick={() => setActiveTab('logs')} className="rounded-b-none">
            System Logs
          </Button>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest system events and user actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {systemLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 border-b border-zinc-200 pb-3 last:border-0 dark:border-zinc-800">
                      <AlertCircle className={cx('mt-0.5 h-4 w-4', log.severity === 'warning' ? 'text-red-500' : log.severity === 'success' ? 'text-green-500' : 'text-indigo-600')} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{log.action}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{log.user} • {log.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common administrative tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="flex h-auto flex-col py-4">
                    <Users className="mb-2 h-5 w-5" />
                    <span className="text-sm">Manage Users</span>
                  </Button>
                  <Button variant="outline" className="flex h-auto flex-col py-4">
                    <Shield className="mb-2 h-5 w-5" />
                    <span className="text-sm">Security</span>
                  </Button>
                  <Button variant="outline" className="flex h-auto flex-col py-4">
                    <FileText className="mb-2 h-5 w-5" />
                    <span className="text-sm">Reports</span>
                  </Button>
                  <Button variant="outline" className="flex h-auto flex-col py-4">
                    <Settings className="mb-2 h-5 w-5" />
                    <span className="text-sm">System Config</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'users' && (
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>View and manage all registered users</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUsers.map((user) => (
                    <TableRow key={user.id} className="rounded-xl">
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'Active' ? 'default' : 'outline'}>{user.status}</Badge>
                      </TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">{user.joined}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost">Edit</Button>
                          <Button size="sm" variant="ghost">Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === 'logs' && (
          <Card>
            <CardHeader>
              <CardTitle>System Activity Logs</CardTitle>
              <CardDescription>Monitor system events and security alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {systemLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
                    <div className="flex items-center gap-3">
                      <AlertCircle className={cx('h-5 w-5', log.severity === 'warning' ? 'text-red-500' : log.severity === 'success' ? 'text-green-500' : 'text-indigo-600')} />
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">{log.action}</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{log.user}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="text-xs capitalize">{log.severity}</Badge>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{log.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

