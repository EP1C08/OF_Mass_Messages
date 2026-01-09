"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Send,
  Image as ImageIcon,
  Video,
  X,
  Plus,
  Eye,
  PlayCircle,
  DollarSign,
} from "lucide-react";
import { dummyAccounts, dummyCollections, dummyVaultMedia } from "@/lib/dummy-data";

export default function ComposeMessagePage() {
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [recipientType, setRecipientType] = useState<string>("all_subscribers");
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [message, setMessage] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [isPPV, setIsPPV] = useState(false);
  const [ppvPrice, setPpvPrice] = useState("15");
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);

  const activeAccounts = dummyAccounts.filter(a => a.status === "authenticated");
  const currentAccount = activeAccounts.find(a => a.id === selectedAccount);

  const getRecipientCount = () => {
    if (!currentAccount) return 0;
    if (recipientType === "all_subscribers") return currentAccount.subscriberCount;
    if (recipientType === "all_chats") return currentAccount.chatCount;
    if (recipientType === "collection") {
      const collection = dummyCollections.find(c => c.id === selectedCollection);
      return collection?.userCount || 0;
    }
    return 0;
  };

  const handleAddPlaceholder = (placeholder: string) => {
    setMessage(prev => prev + placeholder);
  };

  const handleMediaSelect = (mediaId: string) => {
    if (selectedMedia.includes(mediaId)) {
      setSelectedMedia(prev => prev.filter(id => id !== mediaId));
    } else {
      setSelectedMedia(prev => [...prev, mediaId]);
    }
  };

  const simulateSend = () => {
    setIsSending(true);
    setSendProgress(0);
    const interval = setInterval(() => {
      setSendProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsSending(false);
          return 100;
        }
        return prev + 2;
      });
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Compose Message</h1>
        <p className="text-muted-foreground">
          Create and send mass messages to your subscribers
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Composer */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Select Account */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 1: Select Account</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      @{account.username} ({account.subscriberCount.toLocaleString()} subscribers)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Step 2: Select Recipients */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 2: Select Recipients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="all_subscribers"
                    name="recipientType"
                    value="all_subscribers"
                    checked={recipientType === "all_subscribers"}
                    onChange={(e) => setRecipientType(e.target.value)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="all_subscribers">
                    All Subscribers ({currentAccount?.subscriberCount.toLocaleString() || 0})
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="all_chats"
                    name="recipientType"
                    value="all_chats"
                    checked={recipientType === "all_chats"}
                    onChange={(e) => setRecipientType(e.target.value)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="all_chats">
                    All Chats ({currentAccount?.chatCount.toLocaleString() || 0})
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="collection"
                    name="recipientType"
                    value="collection"
                    checked={recipientType === "collection"}
                    onChange={(e) => setRecipientType(e.target.value)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="collection">Select Collection</Label>
                </div>
              </div>

              {recipientType === "collection" && (
                <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {dummyCollections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.name} ({collection.userCount} users)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Compose Message */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 3: Compose Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Textarea
                  placeholder="Write your message here..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[150px]"
                />
                <div className="flex items-center justify-between mt-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddPlaceholder("{name}")}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {"{name}"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddPlaceholder("{username}")}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {"{username}"}
                    </Button>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {message.length}/1000
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 4: Attach Media */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 4: Attach Media (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedMedia.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {selectedMedia.map((mediaId) => {
                    const media = dummyVaultMedia.find(m => m.id === mediaId);
                    return (
                      <div key={mediaId} className="relative group">
                        <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                          {media?.type === "video" ? (
                            <Video className="h-8 w-8 text-muted-foreground" />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleMediaSelect(mediaId)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-6 gap-2">
                {dummyVaultMedia.slice(0, 12).map((media) => (
                  <button
                    key={media.id}
                    onClick={() => handleMediaSelect(media.id)}
                    className={`relative aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden border-2 transition-colors ${
                      selectedMedia.includes(media.id)
                        ? "border-primary"
                        : "border-transparent hover:border-muted-foreground/50"
                    }`}
                  >
                    {media.type === "video" ? (
                      <Video className="h-6 w-6 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                    {selectedMedia.includes(media.id) && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                          {selectedMedia.indexOf(media.id) + 1}
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <Button variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Browse Vault
              </Button>
            </CardContent>
          </Card>

          {/* Step 5: PPV Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 5: PPV Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ppv"
                  checked={isPPV}
                  onCheckedChange={(checked) => setIsPPV(checked as boolean)}
                />
                <Label htmlFor="ppv">Enable Pay-Per-View</Label>
              </div>
              {isPPV && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={ppvPrice}
                      onChange={(e) => setPpvPrice(e.target.value)}
                      className="w-24"
                      min="3"
                      max="200"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Min $3, Max $200
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview & Actions */}
        <div className="space-y-6">
          {/* Preview Card */}
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Message Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="text-sm text-muted-foreground">
                  To: @fan_username (John)
                </div>
                <Separator />
                <p className="text-sm whitespace-pre-wrap">
                  {message
                    .replace("{name}", "John")
                    .replace("{username}", "fan_username") || (
                    <span className="text-muted-foreground italic">
                      Your message will appear here...
                    </span>
                  )}
                </p>
                {selectedMedia.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex gap-2">
                      {selectedMedia.slice(0, 3).map((mediaId) => {
                        const media = dummyVaultMedia.find(m => m.id === mediaId);
                        return (
                          <div
                            key={mediaId}
                            className="w-12 h-12 rounded bg-muted-foreground/20 flex items-center justify-center"
                          >
                            {media?.type === "video" ? (
                              <Video className="h-5 w-5" />
                            ) : (
                              <ImageIcon className="h-5 w-5" />
                            )}
                          </div>
                        );
                      })}
                      {selectedMedia.length > 3 && (
                        <div className="w-12 h-12 rounded bg-muted-foreground/20 flex items-center justify-center text-xs">
                          +{selectedMedia.length - 3}
                        </div>
                      )}
                    </div>
                  </>
                )}
                {isPPV && (
                  <Badge variant="secondary" className="mt-2">
                    <DollarSign className="h-3 w-3 mr-1" />
                    PPV: ${ppvPrice}
                  </Badge>
                )}
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recipients</span>
                  <span className="font-medium">{getRecipientCount().toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Media</span>
                  <span className="font-medium">{selectedMedia.length} items</span>
                </div>
                {isPPV && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PPV Price</span>
                    <span className="font-medium">${ppvPrice}</span>
                  </div>
                )}
              </div>

              <Separator />

              {isSending ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Sending...</span>
                    <span>{sendProgress}%</span>
                  </div>
                  <Progress value={sendProgress} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Button variant="outline" className="w-full">
                    <Eye className="h-4 w-4 mr-2" />
                    Dry Run
                  </Button>
                  <Button
                    className="w-full"
                    disabled={!selectedAccount || !message}
                    onClick={simulateSend}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send to {getRecipientCount().toLocaleString()} Users
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
