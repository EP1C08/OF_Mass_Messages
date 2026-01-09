"use client";

import { useState, useMemo } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Eye,
  Download,
  ShoppingCart,
  Trophy,
  Sparkles,
  Video,
  FileImage,
  Filter,
} from "lucide-react";
import { dummyDailyAnalytics, dummyAccounts, dummyCampaigns } from "@/lib/dummy-data";
import { Campaign } from "@/types";

// Calculate winning caption + media combos
interface WinningCombo {
  captionId: string;
  captionPreview: string;
  mediaCount: number;
  mediaTypes: string[];
  thumbnails: string[];
  accountUsername: string;
  campaignCount: number;
  totalRevenue: number;
  avgConversionRate: number;
  avgRpm: number;
  price: number;
}

export default function AnalyticsPage() {
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("revenue");

  // Calculate totals
  const totalSent = dummyDailyAnalytics.reduce((sum, d) => sum + d.messagesSent, 0);
  const totalDelivered = dummyDailyAnalytics.reduce((sum, d) => sum + d.messagesDelivered, 0);
  const totalOpened = dummyDailyAnalytics.reduce((sum, d) => sum + d.messagesOpened, 0);
  const totalRevenue = dummyDailyAnalytics.reduce((sum, d) => sum + d.ppvRevenue, 0);
  const avgDeliveryRate = (totalDelivered / totalSent * 100).toFixed(1);
  const avgOpenRate = (totalOpened / totalDelivered * 100).toFixed(1);

  // Calculate winning combos from campaign data
  const winningCombos = useMemo(() => {
    // Group campaigns by caption + media combo + account
    const comboMap = new Map<string, WinningCombo>();

    const filteredCampaigns = accountFilter === "all"
      ? dummyCampaigns
      : dummyCampaigns.filter(c => c.accountId === accountFilter);

    filteredCampaigns.forEach(campaign => {
      if (!campaign.captionId || campaign.price === 0) return; // Only PPV campaigns with captions

      const comboKey = `${campaign.accountId}-${campaign.captionId}-${campaign.mediaIds?.length || 0}`;

      if (comboMap.has(comboKey)) {
        const existing = comboMap.get(comboKey)!;
        existing.campaignCount += 1;
        existing.totalRevenue += campaign.totalRevenue;
        existing.avgConversionRate = (existing.avgConversionRate * (existing.campaignCount - 1) + (campaign.conversionRate || 0)) / existing.campaignCount;
        existing.avgRpm = (existing.avgRpm * (existing.campaignCount - 1) + (campaign.rpm || 0)) / existing.campaignCount;
      } else {
        comboMap.set(comboKey, {
          captionId: campaign.captionId,
          captionPreview: campaign.messageContent.slice(0, 50) + (campaign.messageContent.length > 50 ? "..." : ""),
          mediaCount: campaign.mediaIds?.length || 0,
          mediaTypes: campaign.mediaTypes || [],
          thumbnails: campaign.mediaThumbnails || [],
          accountUsername: campaign.accountUsername,
          campaignCount: 1,
          totalRevenue: campaign.totalRevenue,
          avgConversionRate: campaign.conversionRate || 0,
          avgRpm: campaign.rpm || 0,
          price: campaign.price,
        });
      }
    });

    // Convert to array and sort
    let combos = Array.from(comboMap.values());

    switch (sortBy) {
      case "revenue":
        combos.sort((a, b) => b.totalRevenue - a.totalRevenue);
        break;
      case "conversion":
        combos.sort((a, b) => b.avgConversionRate - a.avgConversionRate);
        break;
      case "rpm":
        combos.sort((a, b) => b.avgRpm - a.avgRpm);
        break;
    }

    return combos;
  }, [accountFilter, sortBy]);

  // Revenue by account (calculated from campaigns)
  const accountRevenue = useMemo(() => {
    const revenueMap = new Map<string, { account: string; revenue: number }>();

    dummyCampaigns.forEach(campaign => {
      if (revenueMap.has(campaign.accountUsername)) {
        revenueMap.get(campaign.accountUsername)!.revenue += campaign.totalRevenue;
      } else {
        revenueMap.set(campaign.accountUsername, {
          account: campaign.accountUsername,
          revenue: campaign.totalRevenue,
        });
      }
    });

    const total = Array.from(revenueMap.values()).reduce((sum, item) => sum + item.revenue, 0);
    return Array.from(revenueMap.values())
      .map(item => ({
        ...item,
        percentage: Math.round((item.revenue / total) * 100),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, []);

  // Top captions by conversion (from campaigns)
  const topCaptions = useMemo(() => {
    const captionMap = new Map<string, { content: string; uses: number; revenue: number; avgConversion: number }>();

    dummyCampaigns.forEach(campaign => {
      if (!campaign.captionId) return;

      if (captionMap.has(campaign.captionId)) {
        const existing = captionMap.get(campaign.captionId)!;
        existing.uses += 1;
        existing.revenue += campaign.totalRevenue;
        existing.avgConversion = (existing.avgConversion * (existing.uses - 1) + (campaign.conversionRate || 0)) / existing.uses;
      } else {
        captionMap.set(campaign.captionId, {
          content: campaign.messageContent.slice(0, 40) + "...",
          uses: 1,
          revenue: campaign.totalRevenue,
          avgConversion: campaign.conversionRate || 0,
        });
      }
    });

    return Array.from(captionMap.values())
      .sort((a, b) => b.avgConversion - a.avgConversion)
      .slice(0, 5);
  }, []);

  const getMediaTypeIcon = (type: string) => {
    return type === "video" ? <Video className="h-3 w-3" /> : <FileImage className="h-3 w-3" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">
            Find winning caption + media combos per creator
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

      {/* Winning Combos Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <div>
                <CardTitle>Winning Caption + Media Combos</CardTitle>
                <CardDescription>Best performing combinations per creator</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Creators</SelectItem>
                  {dummyAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      @{account.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="conversion">Conversion</SelectItem>
                  <SelectItem value="rpm">RPM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {winningCombos.length > 0 ? (
            <div className="space-y-4">
              {winningCombos.map((combo, index) => (
                <div
                  key={`${combo.accountUsername}-${combo.captionId}`}
                  className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 border border-border"
                >
                  {/* Rank */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                    index === 0 ? "bg-amber-500/20 text-amber-500" :
                    index === 1 ? "bg-slate-400/20 text-slate-400" :
                    index === 2 ? "bg-amber-700/20 text-amber-700" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {index + 1}
                  </div>

                  {/* Media Preview */}
                  <div className="flex gap-1">
                    {combo.thumbnails.slice(0, 2).map((thumb, i) => (
                      <div
                        key={i}
                        className="w-12 h-12 rounded bg-muted overflow-hidden relative"
                      >
                        <img
                          src={thumb}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {combo.mediaTypes[i] === 'video' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Video className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                    ))}
                    {combo.mediaCount > 2 && (
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        +{combo.mediaCount - 2}
                      </div>
                    )}
                  </div>

                  {/* Caption & Creator */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
                        {combo.accountUsername.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm text-muted-foreground">@{combo.accountUsername}</span>
                      <Badge variant="outline" className="text-xs">
                        ${combo.price} PPV
                      </Badge>
                    </div>
                    <p className="text-sm font-medium truncate">&ldquo;{combo.captionPreview}&rdquo;</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {combo.mediaCount} media • Used {combo.campaignCount}x
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-lg font-bold text-green-500">${combo.totalRevenue.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${combo.avgConversionRate >= 20 ? "text-green-500" : ""}`}>
                        {combo.avgConversionRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Conversion</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">${Math.round(combo.avgRpm)}</p>
                      <p className="text-xs text-muted-foreground">RPM</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No PPV campaigns found for this creator</p>
            </div>
          )}
        </CardContent>
      </Card>

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
            <CardTitle>Revenue by Creator</CardTitle>
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

        {/* Top Performing Captions */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Captions</CardTitle>
            <CardDescription>Captions ranked by conversion rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topCaptions.map((caption, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      index === 0 ? "bg-amber-500/20 text-amber-500" :
                      index === 1 ? "bg-slate-400/20 text-slate-400" :
                      index === 2 ? "bg-amber-700/20 text-amber-700" :
                      "bg-primary/20 text-primary"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm">&ldquo;{caption.content}&rdquo;</p>
                      <p className="text-xs text-muted-foreground">
                        Used {caption.uses}x
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${caption.avgConversion >= 20 ? "text-green-500" : ""}`}>
                      {caption.avgConversion.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">conversion</p>
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
