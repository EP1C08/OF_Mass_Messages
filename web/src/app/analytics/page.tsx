"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquare,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Eye,
  Download,
  BarChart3,
} from "lucide-react";
import { dummyDailyAnalytics, dummyAccounts, dummyTemplates } from "@/lib/dummy-data";

export default function AnalyticsPage() {
  // Calculate totals
  const totalSent = dummyDailyAnalytics.reduce((sum, d) => sum + d.messagesSent, 0);
  const totalDelivered = dummyDailyAnalytics.reduce((sum, d) => sum + d.messagesDelivered, 0);
  const totalOpened = dummyDailyAnalytics.reduce((sum, d) => sum + d.messagesOpened, 0);
  const totalRevenue = dummyDailyAnalytics.reduce((sum, d) => sum + d.ppvRevenue, 0);
  const avgDeliveryRate = (totalDelivered / totalSent * 100).toFixed(1);
  const avgOpenRate = (totalOpened / totalDelivered * 100).toFixed(1);

  // Revenue by account (mock data)
  const accountRevenue = [
    { account: "sweetangel", revenue: 1240, percentage: 53 },
    { account: "queenbee", revenue: 780, percentage: 33 },
    { account: "starlight", revenue: 320, percentage: 14 },
  ];

  // Top templates (mock data)
  const topTemplates = [
    { name: "Weekend Special", openRate: 34, revenue: 890 },
    { name: "PPV Promo", openRate: 28, revenue: 650 },
    { name: "Welcome Message", openRate: 45, revenue: 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">
            Track your messaging performance and revenue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select defaultValue="7d">
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSent.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span className="text-green-500">+15%</span> from last period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDeliveryRate}%</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span className="text-green-500">+0.5%</span> from last period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PPV Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span className="text-green-500">+$340</span> from last period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgOpenRate}%</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-red-500" />
              <span className="text-red-500">-2.1%</span> from last period
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Messages Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Messages Over Time</CardTitle>
            <CardDescription>Daily message volume for the past week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-end justify-between gap-2">
              {dummyDailyAnalytics.map((day, index) => {
                const maxMessages = Math.max(...dummyDailyAnalytics.map(d => d.messagesSent));
                const height = (day.messagesSent / maxMessages) * 100;
                const dayName = new Date(day.date).toLocaleDateString("en-US", { weekday: "short" });
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex flex-col items-center">
                      <span className="text-xs text-muted-foreground mb-1">
                        {day.messagesSent.toLocaleString()}
                      </span>
                      <div
                        className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
                        style={{ height: `${height * 2}px` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{dayName}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Revenue Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Over Time</CardTitle>
            <CardDescription>Daily PPV revenue for the past week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-end justify-between gap-2">
              {dummyDailyAnalytics.map((day, index) => {
                const maxRevenue = Math.max(...dummyDailyAnalytics.map(d => d.ppvRevenue));
                const height = (day.ppvRevenue / maxRevenue) * 100;
                const dayName = new Date(day.date).toLocaleDateString("en-US", { weekday: "short" });
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex flex-col items-center">
                      <span className="text-xs text-muted-foreground mb-1">
                        ${day.ppvRevenue}
                      </span>
                      <div
                        className="w-full bg-green-500 rounded-t transition-all hover:bg-green-400"
                        style={{ height: `${height * 2}px` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{dayName}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue by Account */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Account</CardTitle>
            <CardDescription>Breakdown of PPV revenue per creator account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {accountRevenue.map((item) => (
              <div key={item.account} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
                      {item.account.slice(0, 2).toUpperCase()}
                    </div>
                    <span>@{item.account}</span>
                  </div>
                  <span className="font-medium">
                    ${item.revenue.toLocaleString()} ({item.percentage}%)
                  </span>
                </div>
                <Progress value={item.percentage} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Performing Templates */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Templates</CardTitle>
            <CardDescription>Templates ranked by engagement and revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topTemplates.map((template, index) => (
                <div
                  key={template.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{template.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {template.openRate}% open rate
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-green-500">
                      {template.revenue > 0 ? `$${template.revenue}` : "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">revenue</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
