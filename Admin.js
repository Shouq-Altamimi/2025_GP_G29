import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Activity, Settings, TrendingUp, Shield, FileText, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const stats = [
    {
      title: "Total Users",
      value: "1,284",
      change: "+12.5%",
      icon: Users,
      trend: "up"
    },
    {
      title: "Active Sessions",
      value: "342",
      change: "+5.2%",
      icon: Activity,
      trend: "up"
    },
    {
      title: "System Health",
      value: "98.5%",
      change: "+0.3%",
      icon: TrendingUp,
      trend: "up"
    },
    {
      title: "Security Alerts",
      value: "3",
      change: "-2",
      icon: Shield,
      trend: "down"
    }
  ];

  const recentUsers = [
    { id: 1, name: "Sarah Johnson", email: "sarah.j@example.com", role: "Admin", status: "Active", joined: "2024-03-15" },
    { id: 2, name: "Mike Chen", email: "mike.c@example.com", role: "User", status: "Active", joined: "2024-03-14" },
    { id: 3, name: "Emma Wilson", email: "emma.w@example.com", role: "Moderator", status: "Active", joined: "2024-03-13" },
    { id: 4, name: "James Brown", email: "james.b@example.com", role: "User", status: "Inactive", joined: "2024-03-12" },
    { id: 5, name: "Lisa Anderson", email: "lisa.a@example.com", role: "User", status: "Active", joined: "2024-03-11" }
  ];

  const systemLogs = [
    { id: 1, action: "User login", user: "sarah.j@example.com", time: "2 minutes ago", severity: "info" },
    { id: 2, action: "Database backup completed", user: "System", time: "15 minutes ago", severity: "success" },
    { id: 3, action: "Failed login attempt", user: "unknown@example.com", time: "1 hour ago", severity: "warning" },
    { id: 4, action: "Settings updated", user: "admin@example.com", time: "2 hours ago", severity: "info" }
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage users, monitor system health, and view analytics</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Export Report
            </Button>
            <Button size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <Card key={index} className="border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      stat.trend === "up" ? "text-success border-success/20" : "text-muted-foreground"
                    }`}
                  >
                    {stat.change}
                  </Badge>
                  <p className="text-xs text-muted-foreground">from last month</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <Button
            variant={activeTab === "overview" ? "default" : "ghost"}
            onClick={() => setActiveTab("overview")}
            className="rounded-b-none"
          >
            Overview
          </Button>
          <Button
            variant={activeTab === "users" ? "default" : "ghost"}
            onClick={() => setActiveTab("users")}
            className="rounded-b-none"
          >
            Users
          </Button>
          <Button
            variant={activeTab === "logs" ? "default" : "ghost"}
            onClick={() => setActiveTab("logs")}
            className="rounded-b-none"
          >
            System Logs
          </Button>
        </div>

        {/* Content based on active tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest system events and user actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {systemLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                      <AlertCircle className={`w-4 h-4 mt-0.5 ${
                        log.severity === "warning" ? "text-destructive" : 
                        log.severity === "success" ? "text-success" : "text-primary"
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{log.action}</p>
                        <p className="text-xs text-muted-foreground">{log.user} • {log.time}</p>
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
                  <Button variant="outline" className="h-auto py-4 flex-col">
                    <Users className="w-5 h-5 mb-2" />
                    <span className="text-sm">Manage Users</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex-col">
                    <Shield className="w-5 h-5 mb-2" />
                    <span className="text-sm">Security</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex-col">
                    <FileText className="w-5 h-5 mb-2" />
                    <span className="text-sm">Reports</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex-col">
                    <Settings className="w-5 h-5 mb-2" />
                    <span className="text-sm">System Config</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "users" && (
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
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === "Active" ? "default" : "outline"}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.joined}</TableCell>
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

        {activeTab === "logs" && (
          <Card>
            <CardHeader>
              <CardTitle>System Activity Logs</CardTitle>
              <CardDescription>Monitor system events and security alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {systemLogs.map((log) => (
                  <div 
                    key={log.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <AlertCircle className={`w-5 h-5 ${
                        log.severity === "warning" ? "text-destructive" : 
                        log.severity === "success" ? "text-success" : "text-primary"
                      }`} />
                      <div>
                        <p className="font-medium text-foreground">{log.action}</p>
                        <p className="text-sm text-muted-foreground">{log.user}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="text-xs">{log.severity}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">{log.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}