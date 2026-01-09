"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  MessageSquare,
  DollarSign,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { dummyAccounts, dummyCampaigns, dummyActivityLogs, getTotalStats } from "@/lib/dummy-data";

export default function Dashboard() {
  const stats = getTotalStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your messaging operations
          </p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Accounts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAccounts}</div>
            <p className="text-xs text-muted-foreground">
              of {dummyAccounts.length} total accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Subscribers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalSubscribers.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent Today</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.todayMessages.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500">+15%</span> from yesterday
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weekly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${stats.weeklyRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500">+8.2%</span> from last week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account Status */}
        <Card>
          <CardHeader>
            <CardTitle>Account Status</CardTitle>
            <CardDescription>Real-time status of your creator accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {dummyAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
                        {account.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">@{account.username}</p>
                        <p className="text-sm text-muted-foreground">
                          {account.subscriberCount.toLocaleString()} subscribers
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          account.status === "authenticated"
                            ? "default"
                            : account.status === "expired"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {account.status === "authenticated" && (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        )}
                        {account.status === "expired" && (
                          <Clock className="h-3 w-3 mr-1" />
                        )}
                        {account.status === "failed" && (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        {account.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Campaigns</CardTitle>
            <CardDescription>Latest mass messaging campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {dummyCampaigns.map((campaign) => {
                  const successRate = (
                    (campaign.successCount / campaign.recipientCount) *
                    100
                  ).toFixed(1);
                  return (
                    <div
                      key={campaign.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">
                            @{campaign.accountUsername}
                          </p>
                          {campaign.templateName && (
                            <Badge variant="outline" className="text-xs">
                              {campaign.templateName}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {campaign.recipientCount} recipients &bull;{" "}
                          {new Date(campaign.startedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <div className="text-right">
                          <p className="font-medium text-green-500">
                            {successRate}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ${campaign.totalRevenue}
                          </p>
                        </div>
                        <Badge
                          variant={
                            campaign.status === "completed"
                              ? "default"
                              : campaign.status === "running"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {campaign.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Team activity and system events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dummyActivityLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-4 text-sm"
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
                  {log.userName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p>
                    <span className="font-medium">{log.userName}</span>{" "}
                    {log.action}
                    {log.accountUsername && (
                      <span className="text-muted-foreground">
                        {" "}
                        (@{log.accountUsername})
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-muted-foreground">
                  {new Date(log.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
