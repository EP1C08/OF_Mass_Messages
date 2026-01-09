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
} from "lucide-react";
import { dummyCampaigns, dummyAccounts } from "@/lib/dummy-data";

// Mock failed recipients
const mockFailedRecipients = [
  { username: "user123", error: "Rate limited" },
  { username: "user456", error: "User blocked" },
  { username: "user789", error: "API error" },
];

export default function CampaignHistoryPage() {
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const activeCampaign = dummyCampaigns.find(c => c.id === selectedCampaign);
  const filteredCampaigns = accountFilter === "all"
    ? dummyCampaigns
    : dummyCampaigns.filter(c => c.accountId === accountFilter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case "running":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Running</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Campaign History</h1>
          <p className="text-muted-foreground">
            View past campaigns and their results
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
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export All
          </Button>
        </div>
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
                    <TableHead>Account</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Success</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.map((campaign) => {
                    const successRate = (campaign.successCount / campaign.recipientCount * 100).toFixed(1);
                    return (
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
                            @{campaign.accountUsername}
                          </div>
                        </TableCell>
                        <TableCell>{campaign.recipientCount.toLocaleString()}</TableCell>
                        <TableCell>
                          <span className={Number(successRate) >= 95 ? "text-green-500" : Number(successRate) >= 90 ? "text-yellow-500" : "text-red-500"}>
                            {successRate}%
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                      </TableRow>
                    );
                  })}
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

                  {activeCampaign.templateName && (
                    <Badge variant="outline">{activeCampaign.templateName}</Badge>
                  )}

                  <Separator />

                  {/* Results */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Recipients</span>
                      <span className="font-medium">{activeCampaign.recipientCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Successful
                      </span>
                      <span className="font-medium text-green-500">{activeCampaign.successCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-red-500" />
                        Failed
                      </span>
                      <span className="font-medium text-red-500">{activeCampaign.failedCount}</span>
                    </div>
                    <Progress
                      value={(activeCampaign.successCount / activeCampaign.recipientCount) * 100}
                      className="h-2"
                    />
                  </div>

                  <Separator />

                  {/* Message Preview */}
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Message</p>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">
                        {activeCampaign.messageContent.slice(0, 100)}...
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm">
                    {activeCampaign.mediaIds && activeCampaign.mediaIds.length > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <ImageIcon className="h-4 w-4" />
                        <span>{activeCampaign.mediaIds.length} media</span>
                      </div>
                    )}
                    {activeCampaign.price > 0 && (
                      <div className="flex items-center gap-1 text-green-500">
                        <DollarSign className="h-4 w-4" />
                        <span>${activeCampaign.price} PPV</span>
                      </div>
                    )}
                  </div>

                  {activeCampaign.totalRevenue > 0 && (
                    <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-500">Total Revenue</span>
                        <span className="text-lg font-bold text-green-500">
                          ${activeCampaign.totalRevenue.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Failed Recipients */}
                  {activeCampaign.failedCount > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          Failed Recipients
                        </p>
                        <ScrollArea className="h-[120px]">
                          <div className="space-y-2">
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
                        Retry Failed
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
