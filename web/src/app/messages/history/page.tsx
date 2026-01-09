"use client";

import { useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Image as ImageIcon,
  Users,
  AlertTriangle,
  TrendingUp,
  Eye,
  ShoppingCart,
  Video,
  FileImage,
} from "lucide-react";
import { dummyCampaigns, dummyAccounts } from "@/lib/dummy-data";
import { Campaign } from "@/types";

// Mock failed recipients
const mockFailedRecipients = [
  { username: "user123", error: "Rate limited" },
  { username: "user456", error: "User blocked" },
  { username: "user789", error: "API error" },
];

export default function CampaignHistoryPage() {
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date");

  const activeCampaign = dummyCampaigns.find(c => c.id === selectedCampaign);

  // Filter and sort campaigns
  let filteredCampaigns = accountFilter === "all"
    ? [...dummyCampaigns]
    : dummyCampaigns.filter(c => c.accountId === accountFilter);

  // Sort campaigns
  switch (sortBy) {
    case "date":
      filteredCampaigns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      break;
    case "revenue":
      filteredCampaigns.sort((a, b) => b.totalRevenue - a.totalRevenue);
      break;
    case "conversion":
      filteredCampaigns.sort((a, b) => (b.conversionRate || 0) - (a.conversionRate || 0));
      break;
    case "rpm":
      filteredCampaigns.sort((a, b) => (b.rpm || 0) - (a.rpm || 0));
      break;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case "running":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Running</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMediaTypeIcon = (type: string) => {
    switch (type) {
      case "video":
        return <Video className="h-3 w-3" />;
      case "gif":
        return <Video className="h-3 w-3" />;
      default:
        return <FileImage className="h-3 w-3" />;
    }
  };

  // Calculate totals for filtered campaigns
  const totals = filteredCampaigns.reduce((acc, c) => ({
    revenue: acc.revenue + c.totalRevenue,
    sent: acc.sent + c.recipientCount,
    purchased: acc.purchased + (c.purchasedCount || 0),
  }), { revenue: 0, sent: 0, purchased: 0 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Campaign History</h1>
          <p className="text-muted-foreground">
            Track performance of caption + media combinations per creator
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {dummyAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  @{account.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Latest</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="conversion">Conversion</SelectItem>
              <SelectItem value="rpm">RPM</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-green-500">${totals.revenue.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Messages Sent</p>
                <p className="text-2xl font-bold">{totals.sent.toLocaleString()}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Purchases</p>
                <p className="text-2xl font-bold">{totals.purchased.toLocaleString()}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-muted-foreground/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Campaigns Table */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>All Campaigns</CardTitle>
              <CardDescription>{filteredCampaigns.length} campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Media</TableHead>
                    <TableHead className="text-right">Conv %</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">RPM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.map((campaign) => (
                    <TableRow
                      key={campaign.id}
                      className={`cursor-pointer ${selectedCampaign === campaign.id ? "bg-muted" : ""}`}
                      onClick={() => setSelectedCampaign(campaign.id)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {new Date(campaign.startedAt).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(campaign.startedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
                            {campaign.accountUsername.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm">@{campaign.accountUsername}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {campaign.mediaIds && campaign.mediaIds.length > 0 ? (
                          <div className="flex items-center gap-1">
                            {campaign.mediaThumbnails?.slice(0, 2).map((thumb, i) => (
                              <div
                                key={i}
                                className="w-8 h-8 rounded bg-muted overflow-hidden relative"
                              >
                                <img
                                  src={thumb}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                                {campaign.mediaTypes?.[i] === 'video' && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <Video className="h-3 w-3 text-white" />
                                  </div>
                                )}
                              </div>
                            ))}
                            {campaign.mediaIds.length > 2 && (
                              <span className="text-xs text-muted-foreground">+{campaign.mediaIds.length - 2}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No media</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.conversionRate ? (
                          <span className={campaign.conversionRate >= 20 ? "text-green-500 font-medium" : campaign.conversionRate >= 15 ? "text-yellow-500" : "text-muted-foreground"}>
                            {campaign.conversionRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.totalRevenue > 0 ? (
                          <span className="text-green-500 font-medium">${campaign.totalRevenue}</span>
                        ) : (
                          <span className="text-muted-foreground">$0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.rpm ? (
                          <span className="font-medium">${campaign.rpm}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Campaign Details */}
        <div>
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Campaign Details</CardTitle>
            </CardHeader>
            <CardContent>
              {activeCampaign ? (
                <div className="space-y-4">
                  {/* Account & Date */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
                        {activeCampaign.accountUsername.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">@{activeCampaign.accountUsername}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activeCampaign.startedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(activeCampaign.status)}
                  </div>

                  <Separator />

                  {/* Media Preview */}
                  {activeCampaign.mediaThumbnails && activeCampaign.mediaThumbnails.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Media Attached</p>
                      <div className="flex gap-2">
                        {activeCampaign.mediaThumbnails.map((thumb, i) => (
                          <div
                            key={i}
                            className="w-16 h-16 rounded-lg bg-muted overflow-hidden relative"
                          >
                            <img
                              src={thumb}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            {activeCampaign.mediaTypes?.[i] === 'video' && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <Video className="h-5 w-5 text-white" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Caption Preview */}
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Caption</p>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">
                        &ldquo;{activeCampaign.messageContent}&rdquo;
                      </p>
                    </div>
                    {activeCampaign.price > 0 && (
                      <Badge className="mt-2 bg-green-500/20 text-green-500 border-green-500/30">
                        PPV ${activeCampaign.price}
                      </Badge>
                    )}
                  </div>

                  <Separator />

                  {/* Performance Metrics */}
                  <div>
                    <p className="text-sm text-muted-foreground mb-3">Performance</p>
                    <div className="space-y-3">
                      {/* Delivery */}
                      <div className="flex justify-between items-center">
                        <span className="text-sm flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-500" />
                          Delivery Rate
                        </span>
                        <span className="font-medium">
                          {activeCampaign.deliveryRate?.toFixed(1) || 0}%
                        </span>
                      </div>

                      {/* Opens */}
                      <div className="flex justify-between items-center">
                        <span className="text-sm flex items-center gap-2">
                          <Eye className="h-4 w-4 text-purple-500" />
                          Open Rate
                        </span>
                        <span className="font-medium">
                          {activeCampaign.openRate?.toFixed(1) || 0}%
                          <span className="text-xs text-muted-foreground ml-1">
                            ({activeCampaign.openedCount || 0}/{activeCampaign.successCount})
                          </span>
                        </span>
                      </div>

                      {/* Conversion (PPV only) */}
                      {activeCampaign.price > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm flex items-center gap-2">
                            <ShoppingCart className="h-4 w-4 text-green-500" />
                            Conversion Rate
                          </span>
                          <span className={`font-medium ${(activeCampaign.conversionRate || 0) >= 20 ? "text-green-500" : ""}`}>
                            {activeCampaign.conversionRate?.toFixed(1) || 0}%
                            <span className="text-xs text-muted-foreground ml-1">
                              ({activeCampaign.purchasedCount || 0}/{activeCampaign.openedCount || 0})
                            </span>
                          </span>
                        </div>
                      )}

                      {/* RPM */}
                      {activeCampaign.rpm && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-amber-500" />
                            RPM
                          </span>
                          <span className="font-medium">${activeCampaign.rpm}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Revenue Card */}
                  {activeCampaign.totalRevenue > 0 && (
                    <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-green-500">Total Revenue</span>
                          <p className="text-2xl font-bold text-green-500">
                            ${activeCampaign.totalRevenue.toLocaleString()}
                          </p>
                        </div>
                        <DollarSign className="h-8 w-8 text-green-500/30" />
                      </div>
                    </div>
                  )}

                  {/* Delivery Stats */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sent</span>
                      <span>{activeCampaign.successCount.toLocaleString()} / {activeCampaign.recipientCount.toLocaleString()}</span>
                    </div>
                    <Progress
                      value={(activeCampaign.successCount / activeCampaign.recipientCount) * 100}
                      className="h-2"
                    />
                    {activeCampaign.failedCount > 0 && (
                      <p className="text-xs text-red-500">
                        {activeCampaign.failedCount} failed
                      </p>
                    )}
                  </div>

                  {/* Failed Recipients */}
                  {activeCampaign.failedCount > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          Failed Recipients
                        </p>
                        <ScrollArea className="h-[100px]">
                          <div className="space-y-1">
                            {mockFailedRecipients.map((item, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded"
                              >
                                <span>@{item.username}</span>
                                <span className="text-red-500 text-xs">{item.error}</span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div className="flex gap-2">
                    {activeCampaign.failedCount > 0 && (
                      <Button variant="outline" className="flex-1">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                      </Button>
                    )}
                    <Button variant="outline" className="flex-1">
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Select a campaign to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
