"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  MoreVertical,
  RefreshCw,
  Pencil,
  Trash2,
  Shield,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dummyAccounts } from "@/lib/dummy-data";

export default function AccountsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Accounts</h1>
          <p className="text-muted-foreground">
            Manage your creator accounts and authentication
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Creator Account</DialogTitle>
              <DialogDescription>
                Enter the authentication details for the creator account.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Account Name</Label>
                <Input id="username" placeholder="@username" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="modelId">Model ID</Label>
                <Input id="modelId" placeholder="123456789" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cookie">Cookie (sess)</Label>
                <Input id="cookie" type="password" placeholder="Enter cookie value" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="xbc">X-BC Token</Label>
                <Input id="xbc" type="password" placeholder="Enter X-BC token" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="userAgent">User Agent</Label>
                <Input id="userAgent" placeholder="Mozilla/5.0..." />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gologin">GoLogin Profile (Optional)</Label>
                <Input id="gologin" placeholder="profile-id-here" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsAddDialogOpen(false)}>
                <Shield className="h-4 w-4 mr-2" />
                Test & Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Accounts Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {dummyAccounts.map((account) => (
          <Card key={account.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary text-lg font-semibold">
                    {account.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <CardTitle className="text-lg">@{account.username}</CardTitle>
                    <CardDescription>ID: {account.modelId}</CardDescription>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Test Connection
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
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

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Subscribers</p>
                  <p className="font-medium">{account.subscriberCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Chats</p>
                  <p className="font-medium">{account.chatCount.toLocaleString()}</p>
                </div>
              </div>

              {account.proxyProfile && (
                <div className="text-sm">
                  <p className="text-muted-foreground">Proxy</p>
                  <p className="font-medium text-xs font-mono bg-muted px-2 py-1 rounded">
                    {account.proxyProfile}
                  </p>
                </div>
              )}

              <div className="text-sm">
                <p className="text-muted-foreground">Last Auth</p>
                <p className="font-medium">
                  {new Date(account.lastAuth).toLocaleString()}
                </p>
              </div>

              {account.status !== "authenticated" && (
                <Button variant="outline" className="w-full" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-authenticate
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
