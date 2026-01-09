"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  UserPlus,
  Shield,
  Eye,
  Pencil,
  Users2,
  Trash2,
  Mail,
  Key,
} from "lucide-react";
import { dummyTeamMembers, dummyAccounts, dummyActivityLogs } from "@/lib/dummy-data";

export default function TeamPage() {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const activeMember = dummyTeamMembers.find(m => m.id === selectedMember);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-purple-500"><Shield className="h-3 w-3 mr-1" />Admin</Badge>;
      case "operator":
        return <Badge variant="secondary"><Pencil className="h-3 w-3 mr-1" />Operator</Badge>;
      case "viewer":
        return <Badge variant="outline"><Eye className="h-3 w-3 mr-1" />Viewer</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Team Management</h1>
          <p className="text-muted-foreground">
            Manage team members and permissions
          </p>
        </div>
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your team.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" placeholder="teammate@example.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="John Doe" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin - Full access</SelectItem>
                    <SelectItem value="operator">Operator - Send messages, manage templates</SelectItem>
                    <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Account Access</Label>
                <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                  {dummyAccounts.slice(0, 3).map((account) => (
                    <div key={account.id} className="flex items-center space-x-2">
                      <Checkbox id={`account-${account.id}`} />
                      <Label htmlFor={`account-${account.id}`} className="text-sm font-normal">
                        @{account.username}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsInviteDialogOpen(false)}>
                <Mail className="h-4 w-4 mr-2" />
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Role Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Roles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-purple-500" />
                <span className="font-semibold">Admin</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Full access, manage team, view all accounts, configure settings
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted border">
              <div className="flex items-center gap-2 mb-2">
                <Pencil className="h-5 w-5" />
                <span className="font-semibold">Operator</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Send messages, manage templates, view analytics, access assigned accounts
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-5 w-5" />
                <span className="font-semibold">Viewer</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Read-only access to analytics and campaign history
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Team Members Table */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>{dummyTeamMembers.length} members</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dummyTeamMembers.map((member) => (
                    <TableRow
                      key={member.id}
                      className={`cursor-pointer ${selectedMember === member.id ? "bg-muted" : ""}`}
                      onClick={() => setSelectedMember(member.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
                            {member.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <span className="font-medium">
                            {member.name}
                            {member.id === "1" && (
                              <span className="text-xs text-muted-foreground ml-2">(You)</span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.email}
                      </TableCell>
                      <TableCell>{getRoleBadge(member.role)}</TableCell>
                      <TableCell className="text-right">
                        {member.id !== "1" && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Member Details */}
        <div>
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Member Details</CardTitle>
            </CardHeader>
            <CardContent>
              {activeMember ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary text-lg font-medium">
                      {activeMember.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <h3 className="font-semibold">{activeMember.name}</h3>
                      <p className="text-sm text-muted-foreground">{activeMember.email}</p>
                    </div>
                  </div>

                  {getRoleBadge(activeMember.role)}

                  <Separator />

                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Account Access</p>
                    <div className="space-y-2">
                      {dummyAccounts
                        .filter(a => activeMember.accountAccess.includes(a.id))
                        .map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center justify-between p-2 rounded bg-muted/50"
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox checked disabled />
                              <span className="text-sm">@{account.username}</span>
                            </div>
                          </div>
                        ))}
                      {dummyAccounts
                        .filter(a => !activeMember.accountAccess.includes(a.id))
                        .map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center justify-between p-2 rounded bg-muted/30 opacity-50"
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox disabled />
                              <span className="text-sm">@{account.username}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Last login:{" "}
                      {activeMember.lastLogin
                        ? new Date(activeMember.lastLogin).toLocaleString()
                        : "Never"}
                    </p>
                  </div>

                  {activeMember.id !== "1" && (
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1">
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button variant="outline" size="icon" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Select a team member to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>Recent team activity</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <div className="space-y-4">
              {dummyActivityLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-4 text-sm">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
                    {log.userName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p>
                      <span className="font-medium">{log.userName}</span>{" "}
                      {log.action}
                      {log.accountUsername && (
                        <span className="text-muted-foreground">
                          {" "}(@{log.accountUsername})
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
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
