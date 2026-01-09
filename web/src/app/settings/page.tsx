"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  Shield,
  Database,
  Key,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

export default function SettingsPage() {
  const [showGologinToken, setShowGologinToken] = useState(false);
  const [showVaultKey, setShowVaultKey] = useState(false);

  // Mock settings state
  const [settings, setSettings] = useState({
    defaultDelay: 3,
    largeBatchDelay: 10,
    largeBatchThreshold: 450,
    gologinToken: "gologin_abc123_token_here",
    keepAliveInterval: 300,
    vaultApiKey: "vault_api_key_12345",
    vaultApiUrl: "https://of-message-sender-3qumvbkjdq-uc.a.run.app",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">
            Configure application settings and integrations
          </p>
        </div>
        <Button>
          <Save className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rate Limiting */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Rate Limiting</CardTitle>
            </div>
            <CardDescription>
              Configure delays between messages to avoid rate limiting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="defaultDelay">Default Delay Between Messages</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="defaultDelay"
                  type="number"
                  value={settings.defaultDelay}
                  onChange={(e) => setSettings({ ...settings, defaultDelay: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="largeBatchDelay">Large Batch Delay</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="largeBatchDelay"
                  type="number"
                  value={settings.largeBatchDelay}
                  onChange={(e) => setSettings({ ...settings, largeBatchDelay: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Applied when recipients exceed threshold
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="largeBatchThreshold">Large Batch Threshold</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="largeBatchThreshold"
                  type="number"
                  value={settings.largeBatchThreshold}
                  onChange={(e) => setSettings({ ...settings, largeBatchThreshold: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">recipients</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GoLogin Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle>GoLogin Integration</CardTitle>
            </div>
            <CardDescription>
              Configure GoLogin proxy management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="gologinToken">API Token</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    id="gologinToken"
                    type={showGologinToken ? "text" : "password"}
                    value={settings.gologinToken}
                    onChange={(e) => setSettings({ ...settings, gologinToken: e.target.value })}
                    className="pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowGologinToken(!showGologinToken)}
                  >
                    {showGologinToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button variant="outline" size="sm">
                  Test
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="keepAlive">Keep-alive Interval</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="keepAlive"
                  type="number"
                  value={settings.keepAliveInterval}
                  onChange={(e) => setSettings({ ...settings, keepAliveInterval: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ping interval to keep browser profiles active
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Vault API */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Vault API</CardTitle>
            </div>
            <CardDescription>
              Configure the OF Message Sender vault API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="vaultKey">API Key</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    id="vaultKey"
                    type={showVaultKey ? "text" : "password"}
                    value={settings.vaultApiKey}
                    onChange={(e) => setSettings({ ...settings, vaultApiKey: e.target.value })}
                    className="pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowVaultKey(!showVaultKey)}
                  >
                    {showVaultKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button variant="outline" size="sm">
                  Test
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="vaultUrl">API URL</Label>
              <Input
                id="vaultUrl"
                value={settings.vaultApiUrl}
                onChange={(e) => setSettings({ ...settings, vaultApiUrl: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Database Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Database</CardTitle>
            </div>
            <CardDescription>
              Database connection and credential storage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <div>
                  <p className="font-medium">Connected</p>
                  <p className="text-xs text-muted-foreground">PostgreSQL</p>
                </div>
              </div>
              <Badge variant="outline">
                <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                Healthy
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-muted-foreground">Credentials Stored</p>
                <p className="text-2xl font-bold">5</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-muted-foreground">Templates</p>
                <p className="text-2xl font-bold">4</p>
              </div>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                <RefreshCw className="h-4 w-4 mr-2" />
                Test Connection
              </Button>
              <Button variant="outline" className="flex-1">
                <Database className="h-4 w-4 mr-2" />
                Backup
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Configure notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Campaign Completion</p>
                  <p className="text-sm text-muted-foreground">
                    Notify when a mass message campaign completes
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Authentication Expiry</p>
                  <p className="text-sm text-muted-foreground">
                    Warn when account authentication is about to expire
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Scheduled Message Reminders</p>
                  <p className="text-sm text-muted-foreground">
                    Remind before scheduled messages are sent
                  </p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Error Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Alert when errors occur during message sending
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
