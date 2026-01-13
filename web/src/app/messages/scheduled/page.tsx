"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  SkipForward,
  DollarSign,
  Image as ImageIcon,
  RefreshCw,
  Bell,
  CircleDot,
  Search,
  MessageSquare,
  Video,
  FileText,
  Send,
  Undo2,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { useCaptions } from "@/hooks/useCaptions";
import { useScheduledMessages } from "@/hooks/useScheduledMessages";
import { useAccounts } from "@/hooks/useAccounts";
import { useCollections } from "@/hooks/useCollections";
import { useVaultMedia } from "@/hooks/useVaultMedia";
import { CaptionTemplate, ActiveMessage, CollectionsApiCollection, VaultApiMedia, VaultApiFolder } from "@/types";
import { ScheduledMessage } from "@/types";

export default function ScheduledMessagesPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("messages");
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ScheduledMessage | null>(null);
  const [isMessageDetailDialogOpen, setIsMessageDetailDialogOpen] = useState(false);
  const [isCaptionDialogOpen, setIsCaptionDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ScheduledMessage | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [activeMessage, setActiveMessage] = useState<ActiveMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | number | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([]);
  const [selectedMediaPreviews, setSelectedMediaPreviews] = useState<VaultApiMedia[]>([]);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    messageId?: string;
    unsentPrevious: boolean;
    previousMessageIds?: string[];
    logFile?: string;
    error?: string;
    autoUnsendAt?: string;
  } | null>(null);
  const [isTestResultDialogOpen, setIsTestResultDialogOpen] = useState(false);

  // Load accounts from API (no fallback - wait for real data)
  const { accounts, loading: accountsLoading } = useAccounts();

  // Load scheduled messages from API
  const {
    messages: scheduledMessages,
    loading: messagesLoading,
    error: messagesError,
    createMessage,
    updateMessage,
    deleteMessage,
    approveMessage,
    cancelMessage,
    getActiveMessage,
    unsendActiveMessage,
    testExecute,
    refetch: refetchMessages,
  } = useScheduledMessages();

  // Load captions from API
  const { captions, loading: captionsLoading, incrementUse } = useCaptions();

  // Load collections from API
  const { collections, loading: collectionsLoading, fetchCollections } = useCollections();

  // Load vault media from API
  const {
    folders: vaultFolders,
    media: vaultMedia,
    loading: foldersLoading,
    loadingMedia,
    hasMore: hasMoreMedia,
    fetchFolders,
    fetchMedia,
    loadMoreMedia,
    clearMedia,
  } = useVaultMedia();

  // Form state - accountId defaults to empty, will be set when accounts load
  const [formData, setFormData] = useState({
    accountId: "",
    date: new Date().toISOString().split('T')[0],
    time: "14:00",
    messageType: "ppv" as "free" | "ppv",
    caption: "",
    price: "15",
    recipientType: "test_user" as "all_subscribers" | "all_chats" | "collection" | "test_user",
    collectionId: "" as string,
    collectionName: "" as string,
    testUserId: "u528621767" as string,  // Default test user
    autoUnsendPrevious: true,
    autoUnsendAfterMinutes: 1,  // Default 1 minute for testing
    // Rotation mode settings
    enableRotation: false,
    rotationCaptions: ["HI {name}", "I miss you {name}", "do you miss me {name}"] as string[],
    rotationEndAt: "" as string,  // ISO timestamp
    rotationDurationHours: 24,  // Default 24 hours
  });

  // Set default accountId when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !formData.accountId) {
      setFormData(prev => ({ ...prev, accountId: accounts[0].id }));
    }
  }, [accounts, formData.accountId]);

  // Fetch collections and vault folders when account changes in form
  useEffect(() => {
    if (formData.accountId && isScheduleDialogOpen) {
      fetchCollections(formData.accountId);
      fetchFolders(formData.accountId);
    }
  }, [formData.accountId, isScheduleDialogOpen, fetchCollections, fetchFolders]);

  // Reset form
  const resetForm = () => {
    setFormData({
      accountId: accounts.length > 0 ? accounts[0].id : "",
      date: selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      time: "14:00",
      messageType: "ppv",
      caption: "",
      price: "15",
      recipientType: "test_user",
      collectionId: "",
      collectionName: "",
      testUserId: "u528621767",
      autoUnsendPrevious: true,
      autoUnsendAfterMinutes: 1,
      enableRotation: false,
      rotationCaptions: ["HI {name}", "I miss you {name}", "do you miss me {name}"],
      rotationEndAt: "",
      rotationDurationHours: 24,
    });
    setIsEditMode(false);
    setEditingMessage(null);
    setSelectedMediaIds([]);
    setSelectedMediaPreviews([]);
    setSelectedFolderId(null);
    clearMedia();
  };

  // Handle caption selection
  const handleSelectCaption = async (caption: CaptionTemplate) => {
    setFormData(prev => ({
      ...prev,
      caption: caption.content,
      price: caption.suggestedPrice?.toString() || prev.price,
      messageType: caption.type,
    }));
    await incrementUse(caption.id);
    setIsCaptionDialogOpen(false);
  };

  // Handle collection selection
  const handleCollectionChange = (collectionId: string) => {
    const collection = collections.find(c => String(c.id) === collectionId);
    setFormData(prev => ({
      ...prev,
      collectionId,
      collectionName: collection?.name || "",
    }));
  };

  // Handle folder selection in media dialog
  const handleFolderSelect = (folderId: string | number) => {
    setSelectedFolderId(folderId);
    fetchMedia(formData.accountId, folderId);
  };

  // Filter folders to only show GIF folders
  const gifFolders = vaultFolders.filter(folder => {
    const name = folder.name.toLowerCase();
    // Include folders with "gif" in the name or folders that have gifs
    const hasGifs = (folder.gifsCount ?? folder.gifs_count ?? 0) > 0;
    const isGifFolder = name.includes('gif');
    return hasGifs || isGifFolder;
  });

  // Handle media selection toggle
  const handleMediaToggle = (mediaItem: VaultApiMedia) => {
    const isSelected = selectedMediaIds.includes(mediaItem.id);
    if (isSelected) {
      setSelectedMediaIds(prev => prev.filter(id => id !== mediaItem.id));
      setSelectedMediaPreviews(prev => prev.filter(m => m.id !== mediaItem.id));
    } else {
      setSelectedMediaIds(prev => [...prev, mediaItem.id]);
      setSelectedMediaPreviews(prev => [...prev, mediaItem]);
    }
  };

  // Open media dialog
  const openMediaDialog = () => {
    if (formData.accountId) {
      fetchFolders(formData.accountId);
    }
    setIsMediaDialogOpen(true);
  };

  // Helper to get full image URL from API response
  // The API proxy endpoint accepts path parameter for proxying images
  const getImageUrl = (path: string | null | undefined): string | null => {
    if (!path) return null;
    // If it's already a full URL (http/https), we can't proxy it directly
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return null;
    }
    // Use our local proxy endpoint which will add the API key
    return `/api/vault/proxy?path=${encodeURIComponent(path)}`;
  };

  // Get media thumbnail URL - tries multiple fields and uses proxy
  const getMediaThumbnail = (media: VaultApiMedia): string | null => {
    return getImageUrl(media.thumb) || getImageUrl(media.preview) || getImageUrl(media.squarePreview) || getImageUrl(media.square_preview) || getImageUrl(media.src) || getImageUrl(media.url);
  };

  // Helper to get total media count from folder
  const getFolderMediaCount = (folder: VaultApiFolder): number => {
    // If mediaCount or media_count is available, use it
    if (folder.mediaCount !== undefined) return folder.mediaCount;
    if (folder.media_count !== undefined) return folder.media_count;

    // Otherwise, calculate from individual counts
    const photos = folder.photosCount ?? folder.photos_count ?? 0;
    const videos = folder.videosCount ?? folder.videos_count ?? 0;
    const gifs = folder.gifsCount ?? folder.gifs_count ?? 0;
    const audios = folder.audiosCount ?? folder.audios_count ?? 0;

    return photos + videos + gifs + audios;
  };

  // Fetch active message when account changes
  useEffect(() => {
    const fetchActiveMessage = async () => {
      if (selectedAccount && selectedAccount !== "all") {
        const active = await getActiveMessage(selectedAccount);
        setActiveMessage(active);
      } else {
        setActiveMessage(null);
      }
    };
    fetchActiveMessage();
  }, [selectedAccount, getActiveMessage]);

  // Get account info
  const getAccountInfo = (accountId: string) => {
    return accounts.find(a => a.id === accountId || a.modelId === accountId);
  };

  // Handle schedule new message or test execution
  const handleScheduleMessage = async () => {
    const account = getAccountInfo(formData.accountId);
    if (!account) return;

    setIsSubmitting(true);

    try {
      // If test_user recipient type, execute immediately instead of scheduling
      if (formData.recipientType === "test_user") {
        // Check if rotation mode is enabled
        if (formData.enableRotation && formData.rotationCaptions.length > 0) {
          // Build scheduled start time from date/time pickers
          const scheduledStartAt = formData.date && formData.time
            ? new Date(`${formData.date}T${formData.time}:00`).toISOString()
            : null;

          // Use the rotation API with optional scheduled start time
          // total_cycles: 0 = unlimited (rotation continues until duration ends)
          const rotationResponse = await fetch('/api/rotation/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account_id: formData.accountId,
              test_user_id: formData.testUserId || "u528621767",
              captions: formData.rotationCaptions.filter(c => c.trim() !== ''),
              auto_unsend_after_minutes: formData.autoUnsendAfterMinutes || 1,
              total_cycles: 0,  // Always unlimited - rotation runs until duration ends
              run_duration_hours: formData.rotationDurationHours || 24,
              start_at: scheduledStartAt,  // Pass scheduled start time
            }),
          });

          const rotationResult = await rotationResponse.json();

          if (rotationResult.success) {
            // Rotation is now always pending approval
            const startInfo = rotationResult.start_at
              ? `Scheduled to start at ${new Date(rotationResult.start_at).toLocaleString()}`
              : `Ready to start immediately`;
            setTestResult({
              success: true,
              message: `Rotation created: ${rotationResult.total_messages || 'unlimited'} messages over ${formData.rotationDurationHours || 24} hours. ${startInfo}. PENDING APPROVAL - approve in the calendar view.`,
              messageId: rotationResult.scheduled_message_id,
              unsentPrevious: false,
              autoUnsendAt: rotationResult.end_at,
            });
            setIsTestResultDialogOpen(true);
            // Refetch messages to show the new rotation in the calendar
            await refetchMessages();
          } else {
            setTestResult({
              success: false,
              message: 'Failed to create rotation',
              error: rotationResult.error || rotationResult.detail,
              unsentPrevious: false,
            });
            setIsTestResultDialogOpen(true);
          }
        } else {
          // Simple test execute (no rotation)
          const result = await testExecute({
            accountId: formData.accountId,
            messageContent: formData.caption,
            mediaIds: selectedMediaIds.length > 0 ? selectedMediaIds.map(String) : undefined,
            price: formData.messageType === "ppv" ? parseFloat(formData.price) : 0,
            testUserId: formData.testUserId || "u528621767",
            autoUnsendPrevious: formData.autoUnsendPrevious,
            autoUnsendAfterMinutes: formData.autoUnsendAfterMinutes || undefined,
            dryRun: false,
          });

          if (result) {
            setTestResult(result);
            setIsTestResultDialogOpen(true);
          }
        }

        setIsScheduleDialogOpen(false);
        resetForm();
        return;
      }

      const scheduledAt = new Date(`${formData.date}T${formData.time}:00`).toISOString();

      if (isEditMode && editingMessage) {
        // Update existing message via API
        await updateMessage(editingMessage.id, {
          messageContent: formData.caption,
          price: formData.messageType === "ppv" ? parseFloat(formData.price) : 0,
          recipientType: formData.recipientType,
          collectionId: formData.recipientType === "collection" ? formData.collectionId : undefined,
          collectionName: formData.recipientType === "collection" ? formData.collectionName : undefined,
          mediaIds: selectedMediaIds.length > 0 ? selectedMediaIds.map(String) : undefined,
          scheduledAt,
          autoUnsendPrevious: formData.autoUnsendPrevious,
        });
      } else {
        // Create new message via API
        await createMessage({
          accountId: formData.accountId,
          messageContent: formData.caption,
          price: formData.messageType === "ppv" ? parseFloat(formData.price) : 0,
          recipientType: formData.recipientType,
          collectionId: formData.recipientType === "collection" ? formData.collectionId : undefined,
          collectionName: formData.recipientType === "collection" ? formData.collectionName : undefined,
          mediaIds: selectedMediaIds.length > 0 ? selectedMediaIds.map(String) : undefined,
          scheduledAt,
          autoUnsendPrevious: formData.autoUnsendPrevious,
        });
      }

      setIsScheduleDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Failed to schedule/execute message:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle approve message
  const handleApproveMessage = async (messageId: string) => {
    // Check if this is a rotation message
    const message = scheduledMessages.find(m => m.id === messageId);
    const isRotation = message?.isRotation ?? messageId.startsWith('rotation_');
    await approveMessage(messageId, isRotation);
  };

  // Handle skip message
  const handleSkipMessage = async (messageId: string) => {
    await cancelMessage(messageId);
  };

  // Handle delete message
  const handleDeleteMessage = (messageId: string) => {
    setMessageToDelete(messageId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (messageToDelete) {
      await deleteMessage(messageToDelete);
      if (selectedMessage?.id === messageToDelete) {
        setSelectedMessage(null);
      }
    }
    setDeleteConfirmOpen(false);
    setMessageToDelete(null);
  };

  // Handle edit message
  const handleEditMessage = (message: ScheduledMessage) => {
    const msgDate = new Date(message.scheduledAt);
    setFormData({
      accountId: message.accountId,
      date: msgDate.toISOString().split('T')[0],
      time: msgDate.toTimeString().slice(0, 5),
      messageType: message.price > 0 ? "ppv" : "free",
      caption: message.messageContent,
      price: message.price.toString(),
      recipientType: message.recipientType,
      collectionId: message.collectionId || "",
      collectionName: message.collectionName || "",
      autoUnsendPrevious: message.autoUnsendPrevious || false,
    });
    // Restore selected media IDs if any
    if (message.mediaIds && message.mediaIds.length > 0) {
      setSelectedMediaIds(message.mediaIds.map(id => parseInt(id)));
    } else {
      setSelectedMediaIds([]);
    }
    setSelectedMediaPreviews([]);
    setIsEditMode(true);
    setEditingMessage(message);
    setIsScheduleDialogOpen(true);
  };

  // Handle unsend active message
  const handleUnsendActiveMessage = async () => {
    if (activeMessage) {
      const success = await unsendActiveMessage(activeMessage.accountId);
      if (success) {
        setActiveMessage(null);
      }
    }
  };

  // Get days in current month
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days: (number | null)[] = [];

    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  };

  const days = getDaysInMonth(currentDate);
  const monthNames = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"];

  // Filter messages by selected account (exclude cancelled)
  const filteredMessages = useMemo(() => {
    const activeMessages = scheduledMessages.filter(m => m.status !== "cancelled");
    if (selectedAccount === "all") return activeMessages;
    return activeMessages.filter(m => m.accountId === selectedAccount);
  }, [selectedAccount, scheduledMessages]);

  // Get messages for a specific date
  const getMessagesForDate = (day: number | null) => {
    if (!day) return [];
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return filteredMessages.filter(m => {
      const msgDate = new Date(m.scheduledAt);
      return msgDate.getDate() === day &&
             msgDate.getMonth() === currentDate.getMonth() &&
             msgDate.getFullYear() === currentDate.getFullYear();
    });
  };

  // Get messages for selected date
  const selectedDateMessages = useMemo(() => {
    if (!selectedDate) return [];
    return filteredMessages.filter(m => {
      const msgDate = new Date(m.scheduledAt);
      return msgDate.getDate() === selectedDate.getDate() &&
             msgDate.getMonth() === selectedDate.getMonth() &&
             msgDate.getFullYear() === selectedDate.getFullYear();
    }).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [selectedDate, filteredMessages]);

  // Count pending/scheduled for each account
  const getAccountNotifications = (accountId: string) => {
    const accountMessages = scheduledMessages.filter(m => (m.accountId === accountId || m.accountId === accountId) && m.status !== "cancelled");
    const pending = accountMessages.filter(m => m.approvalStatus === 'pending').length;
    const scheduled = accountMessages.length;
    return { pending, scheduled };
  };

  // Get authenticated accounts
  const authenticatedAccounts = accounts.filter(a => a.status === 'authenticated');

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const isToday = (day: number | null) => {
    if (!day) return false;
    const today = new Date();
    return day === today.getDate() &&
           currentDate.getMonth() === today.getMonth() &&
           currentDate.getFullYear() === today.getFullYear();
  };

  const isSelected = (day: number | null) => {
    if (!day || !selectedDate) return false;
    return day === selectedDate.getDate() &&
           currentDate.getMonth() === selectedDate.getMonth() &&
           currentDate.getFullYear() === selectedDate.getFullYear();
  };

  // Open dialog for new message
  const openNewMessageDialog = () => {
    resetForm();
    if (selectedDate) {
      setFormData(prev => ({
        ...prev,
        date: selectedDate.toISOString().split('T')[0],
      }));
    }
    setIsScheduleDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Queue</h1>
          <p className="text-muted-foreground">
            Schedule and manage your mass messages
          </p>
        </div>
        <div className="flex items-center gap-2">
          {messagesLoading ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <CircleDot className="h-3 w-3 text-green-500" />
              Operational
            </Badge>
          )}
          <Badge variant="outline">UTC-08:00</Badge>
          <Button onClick={refetchMessages} variant="ghost" size="icon">
            <RefreshCw className={`h-4 w-4 ${messagesLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={openNewMessageDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Schedule New
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {messagesError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
          {messagesError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr_350px]">
        {/* Left Sidebar - Creator List */}
        <Card>
          <CardHeader className="pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search" className="pl-10" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-2">
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="All creators" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All creators</SelectItem>
                  {authenticatedAccounts.map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      @{account.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="h-[500px]">
              <div className="space-y-1 p-2">
                {authenticatedAccounts.map(account => {
                  const { pending, scheduled } = getAccountNotifications(account.id);
                  return (
                    <button
                      key={account.id}
                      onClick={() => setSelectedAccount(account.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                        selectedAccount === account.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <CircleDot className={`h-3 w-3 ${
                          selectedAccount === account.id ? "text-green-300" : "text-green-500"
                        }`} />
                        <span className="font-medium">{account.username}</span>
                        {pending > 0 && (
                          <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                            {pending}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <Bell className="h-3 w-3" />
                        <span>{scheduled}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Center - Calendar View */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">QUEUE</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <FileText className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openNewMessageDialog}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => navigateMonth('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Calendar className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="posts">Posts</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="streams">Streams</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <div key={i} className="text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                const dayMessages = getMessagesForDate(day);
                const hasMessages = dayMessages.length > 0;
                const hasPending = dayMessages.some(m => m.approvalStatus === 'pending');

                return (
                  <button
                    key={index}
                    onClick={() => day && setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                    disabled={!day}
                    className={`
                      aspect-square p-1 rounded-lg flex flex-col items-center justify-center relative
                      ${!day ? 'invisible' : 'hover:bg-muted cursor-pointer'}
                      ${isToday(day) ? 'ring-2 ring-primary' : ''}
                      ${isSelected(day) ? 'bg-primary text-primary-foreground' : ''}
                    `}
                  >
                    <span className={`text-sm ${isToday(day) ? 'font-bold' : ''}`}>
                      {day}
                    </span>
                    {hasMessages && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayMessages.slice(0, 3).map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected(day)
                                ? 'bg-primary-foreground'
                                : hasPending ? 'bg-yellow-500' : 'bg-primary'
                            }`}
                          />
                        ))}
                        {dayMessages.length > 3 && (
                          <span className={`text-[8px] ${isSelected(day) ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                            +{dayMessages.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span>Approved</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span>Pending</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Panel - Day Details */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                if (selectedDate) {
                  const newDate = new Date(selectedDate);
                  newDate.setDate(newDate.getDate() - 1);
                  setSelectedDate(newDate);
                }
              }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base">
                {selectedDate ? `${monthNames[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}` : 'Select a date'}
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                if (selectedDate) {
                  const newDate = new Date(selectedDate);
                  newDate.setDate(newDate.getDate() + 1);
                  setSelectedDate(newDate);
                }
              }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Currently Active Message */}
            {isToday(selectedDate?.getDate() || 0) && activeMessage && (
              <>
                <div className="mb-4 p-3 rounded-lg border border-green-500/30 bg-green-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/30">
                      <Send className="h-3 w-3 mr-1" />
                      Currently Active
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleUnsendActiveMessage}
                    >
                      <Undo2 className="h-3 w-3 mr-1" />
                      Unsend
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Sent: {new Date(activeMessage.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-sm">&ldquo;{activeMessage.messageContent}&rdquo;</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Will auto-unsend when next message sends
                  </p>
                </div>
                <Separator className="my-4" />
              </>
            )}

            {/* Scheduled Messages for Selected Day */}
            <ScrollArea className="h-[400px] pr-4">
              {selectedDateMessages.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground uppercase font-medium">
                    Scheduled for this day ({selectedDateMessages.length})
                  </p>
                  {selectedDateMessages.map((message) => (
                    <div
                      key={message.id}
                      onClick={() => {
                        setSelectedMessage(message);
                        setIsMessageDetailDialogOpen(true);
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedMessage?.id === message.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          {new Date(message.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="flex items-center gap-1">
                          <Badge
                            variant={message.approvalStatus === 'approved' ? 'default' : 'secondary'}
                            className={message.approvalStatus === 'approved' ? 'bg-green-500' : 'bg-yellow-500/20 text-yellow-600'}
                          >
                            {message.approvalStatus === 'approved' ? (
                              <>
                                <Check className="h-3 w-3 mr-1" />
                                Approved
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </>
                            )}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMessage(message.id);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        @{message.accountUsername}
                      </p>
                      <p className="text-sm font-medium mb-1">
                        {message.isRotation ? (
                          <span className="flex items-center gap-1">
                            <RefreshCw className="h-3 w-3" />
                            Caption Rotation ({message.rotationDurationHours}h)
                          </span>
                        ) : (
                          message.price > 0 ? `PPV MM ($${message.price})` : 'Free MM'
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        &ldquo;{message.messageContent}&rdquo;
                      </p>
                      {message.isRotation && message.rotationCaptions && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          {message.rotationCaptions.length} captions rotating
                        </div>
                      )}
                      {message.mediaIds && message.mediaIds.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <ImageIcon className="h-3 w-3" />
                          {message.mediaIds.length} media
                        </div>
                      )}
                      <div className="flex gap-2 mt-3">
                        {/* Edit button - only for queued messages */}
                        {message.status === 'queued' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditMessage(message);
                            }}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        )}
                        {/* Action button based on status */}
                        {message.approvalStatus === 'pending' ? (
                          <Button
                            size="sm"
                            className="flex-1 h-7 text-xs bg-green-500 hover:bg-green-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApproveMessage(message.id);
                            }}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                        ) : message.status === 'completed' || message.status === 'cancelled' ? (
                          // Completed/cancelled - show status badge, no skip button
                          <span className={`flex-1 text-center text-xs py-1 rounded ${
                            message.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {message.status === 'completed' ? 'Completed' : 'Cancelled'}
                          </span>
                        ) : (
                          // Queued or processing - show skip button
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSkipMessage(message.id);
                            }}
                          >
                            <SkipForward className="h-3 w-3 mr-1" />
                            Skip
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    No scheduled mass messages yet
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    Click &quot;Add Message&quot; below to schedule one
                  </p>
                </div>
              )}
            </ScrollArea>

            {/* Add Message Button */}
            <div className="mt-4 pt-4 border-t">
              <Button
                className="w-full"
                variant="outline"
                onClick={openNewMessageDialog}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Message
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedule/Edit Message Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={(open) => {
        setIsScheduleDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {formData.recipientType === "test_user"
                ? "Test Message Execution"
                : (isEditMode ? "Edit Scheduled Message" : "Schedule New Message")}
            </DialogTitle>
            <DialogDescription>
              {formData.recipientType === "test_user"
                ? "Send a test message to a single user immediately (includes auto-unsend of previous test messages)"
                : (isEditMode ? "Update your scheduled mass message" : "Create a new scheduled mass message")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Model</Label>
              <Select
                value={formData.accountId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, accountId: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {authenticatedAccounts.map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      @{account.username} ({account.modelId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Show date/time for scheduling - also shown in rotation mode */}
            {(formData.recipientType !== "test_user" || formData.enableRotation) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>
                    {formData.enableRotation ? "Start Date" : "Date"}
                  </Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>
                    {formData.enableRotation ? "Start Time" : "Time"}
                  </Label>
                  <Input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Recipients</Label>
              <Select
                value={formData.recipientType}
                onValueChange={(value: "all_subscribers" | "all_chats" | "collection" | "test_user") =>
                  setFormData(prev => ({ ...prev, recipientType: value, collectionId: "", collectionName: "", testUserId: "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test_user">Test User (Single)</SelectItem>
                  <SelectItem value="all_subscribers">All Subscribers</SelectItem>
                  <SelectItem value="all_chats">All Chats</SelectItem>
                  <SelectItem value="collection">Select Collection</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Test User ID Input - shown when "test_user" recipient type is selected */}
            {formData.recipientType === "test_user" && (
              <>
                <div className="grid gap-2">
                  <Label>Test User ID</Label>
                  <Input
                    placeholder="e.g. u528621767 or 528621767"
                    value={formData.testUserId || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, testUserId: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the user ID to test with (can include &apos;u&apos; prefix or just the number)
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Auto-unsend after (minutes)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      className="w-24"
                      value={formData.autoUnsendAfterMinutes || ""}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        autoUnsendAfterMinutes: e.target.value ? parseInt(e.target.value) : undefined
                      }))}
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Message will be automatically unsent after this time (1 min for testing, 60 for production)
                  </p>
                </div>

                {/* Rotation Mode Toggle */}
                <div className="p-4 rounded-lg border border-dashed space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">Caption Rotation Mode</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Automatically rotate through different captions with random GIFs
                      </p>
                    </div>
                    <Button
                      variant={formData.enableRotation ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, enableRotation: !prev.enableRotation }))}
                    >
                      {formData.enableRotation ? "Enabled" : "Disabled"}
                    </Button>
                  </div>

                  {formData.enableRotation && (
                    <div className="space-y-4 pt-2 border-t">
                      {/* Rotation Captions */}
                      <div className="grid gap-2">
                        <Label>Captions to Rotate</Label>
                        <div className="space-y-2">
                          {formData.rotationCaptions.map((caption, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
                              <Input
                                value={caption}
                                onChange={(e) => {
                                  const newCaptions = [...formData.rotationCaptions];
                                  newCaptions[index] = e.target.value;
                                  setFormData(prev => ({ ...prev, rotationCaptions: newCaptions }));
                                }}
                                placeholder={`Caption ${index + 1}`}
                              />
                              {formData.rotationCaptions.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const newCaptions = formData.rotationCaptions.filter((_, i) => i !== index);
                                    setFormData(prev => ({ ...prev, rotationCaptions: newCaptions }));
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              rotationCaptions: [...prev.rotationCaptions, ""]
                            }))}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Caption
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Use &#123;name&#125; for personalization. Each caption will be sent with a random GIF.
                        </p>
                      </div>

                      {/* Duration Setting */}
                      <div className="grid gap-2">
                        <Label>Run Duration (hours)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="168"
                          className="w-32"
                          value={formData.rotationDurationHours || ""}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            rotationDurationHours: e.target.value ? parseInt(e.target.value) : 24
                          }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          How long to run the rotation (1-168 hours / up to 7 days)
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                        <p className="text-xs text-blue-600">
                          <strong>How it works:</strong> Rotation starts at the scheduled date/time. Every {formData.autoUnsendAfterMinutes || 1} minute(s), the current message is unsent and replaced with the next caption + a random GIF. Captions cycle automatically until the {formData.rotationDurationHours || 24}-hour duration ends.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Collection Selector - shown when "collection" recipient type is selected */}
            {formData.recipientType === "collection" && (
              <div className="grid gap-2">
                <Label>Select Collection</Label>
                {collectionsLoading ? (
                  <div className="flex items-center gap-2 p-3 border rounded-lg text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading collections...
                  </div>
                ) : collections.length === 0 ? (
                  <div className="p-3 border rounded-lg text-muted-foreground text-sm">
                    No collections found for this account
                  </div>
                ) : (
                  <Select
                    value={formData.collectionId}
                    onValueChange={handleCollectionChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a collection..." />
                    </SelectTrigger>
                    <SelectContent>
                      {collections.map(collection => (
                        <SelectItem key={String(collection.id)} value={String(collection.id)}>
                          {collection.name} ({collection.usersCount} users)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label>Message Type</Label>
              <div className="flex gap-4">
                <Button
                  variant={formData.messageType === "free" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setFormData(prev => ({ ...prev, messageType: "free", price: "0" }))}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Free Mass Message
                </Button>
                <Button
                  variant={formData.messageType === "ppv" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setFormData(prev => ({ ...prev, messageType: "ppv", price: "15" }))}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  PPV Mass Message
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Caption</Label>
                <Button variant="ghost" size="sm" onClick={() => setIsCaptionDialogOpen(true)}>
                  Load from Caption Vault
                </Button>
              </div>
              <Textarea
                placeholder="THE BEST $15 YOU'LL EVER SPEND, TRUST ME"
                className="min-h-[100px]"
                value={formData.caption}
                onChange={(e) => setFormData(prev => ({ ...prev, caption: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Placeholders: {"{name}"} = fan name, ${"{price}"} = PPV price
              </p>
            </div>

            {formData.messageType === "ppv" && (
              <div className="grid gap-2">
                <Label>PPV Price</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    className="w-24"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>GIFs</Label>
                <Button variant="ghost" size="sm" onClick={openMediaDialog}>
                  Browse GIF Vault
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 p-4 bg-muted/50 rounded-lg min-h-[80px]">
                {selectedMediaIds.length === 0 ? (
                  <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
                    <ImageIcon className="h-5 w-5 mr-2" />
                    No GIFs selected - click &quot;Browse GIF Vault&quot; to add
                  </div>
                ) : (
                  <>
                    {selectedMediaPreviews.map((media) => {
                      const thumbUrl = getMediaThumbnail(media);
                      return (
                      <div key={media.id} className="relative group">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt="Selected media"
                            className="w-16 h-16 rounded object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded bg-muted flex items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <button
                          onClick={() => handleMediaToggle(media)}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {media.type === 'video' && (
                          <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1">
                            <Video className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                    );})}
                    {selectedMediaIds.length > selectedMediaPreviews.length && (
                      <div className="w-16 h-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        +{selectedMediaIds.length - selectedMediaPreviews.length} more
                      </div>
                    )}
                    <span className="text-sm text-muted-foreground self-center ml-2">
                      {selectedMediaIds.length} item{selectedMediaIds.length !== 1 ? 's' : ''} selected
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="auto-unsend"
                checked={formData.autoUnsendPrevious}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, autoUnsendPrevious: checked as boolean }))
                }
              />
              <Label htmlFor="auto-unsend" className="font-normal">
                Unsend previous MM when this one sends
              </Label>
            </div>
          </div>
          </div>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => {
              setIsScheduleDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleScheduleMessage}
              disabled={
                (!formData.enableRotation && !formData.caption.trim()) ||
                isSubmitting ||
                (formData.recipientType === "test_user" && !(formData.testUserId || '').trim()) ||
                (formData.enableRotation && formData.rotationCaptions.filter(c => c.trim()).length === 0)
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {formData.enableRotation ? "Scheduling Rotation..." : (formData.recipientType === "test_user" ? "Sending Test..." : (isEditMode ? "Updating..." : "Scheduling..."))}
                </>
              ) : (
                <>
                  {formData.enableRotation ? (
                    <>
                      <Calendar className="h-4 w-4 mr-2" />
                      Schedule Rotation
                    </>
                  ) : formData.recipientType === "test_user" ? (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Test Now
                    </>
                  ) : (
                    isEditMode ? "Update" : "Schedule"
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Caption Vault Dialog */}
      <Dialog open={isCaptionDialogOpen} onOpenChange={setIsCaptionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Caption Vault</DialogTitle>
            <DialogDescription>
              Select a caption template to use in your message
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {captionsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading captions...
              </div>
            ) : captions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No captions found</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {/* PPV Captions */}
                  {captions.filter(c => c.type === 'ppv').length > 0 && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">PPV Captions</p>
                      {captions.filter(c => c.type === 'ppv').map((caption) => (
                        <button
                          key={caption.id}
                          onClick={() => handleSelectCaption(caption)}
                          className="w-full p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="text-xs">
                              ${caption.suggestedPrice} suggested
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Used {caption.useCount}x
                            </span>
                          </div>
                          <p className="text-sm">{caption.content}</p>
                          {caption.priceTier && (
                            <Badge
                              variant="secondary"
                              className={`mt-2 text-xs ${
                                caption.priceTier === 'low'
                                  ? 'bg-green-500/20 text-green-600'
                                  : caption.priceTier === 'medium'
                                  ? 'bg-yellow-500/20 text-yellow-600'
                                  : 'bg-red-500/20 text-red-600'
                              }`}
                            >
                              {caption.priceTier} tier
                            </Badge>
                          )}
                        </button>
                      ))}
                    </>
                  )}

                  {/* Free Captions */}
                  {captions.filter(c => c.type === 'free').length > 0 && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground uppercase mt-4 mb-2">Free Captions</p>
                      {captions.filter(c => c.type === 'free').map((caption) => (
                        <button
                          key={caption.id}
                          onClick={() => handleSelectCaption(caption)}
                          className="w-full p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="text-xs bg-muted">
                              Free
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Used {caption.useCount}x
                            </span>
                          </div>
                          <p className="text-sm">{caption.content}</p>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCaptionDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scheduled Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scheduled message? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* GIF Vault Dialog */}
      <Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>GIF Vault</DialogTitle>
            <DialogDescription>
              Select GIFs to attach to your message
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[200px_1fr] gap-4 h-[500px]">
            {/* Folder List - GIFs only */}
            <div className="border-r pr-4">
              <p className="text-sm font-medium mb-2">GIF Folders</p>
              {foldersLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : gifFolders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No GIF folders found</p>
              ) : (
                <ScrollArea className="h-[450px]">
                  <div className="space-y-1">
                    {gifFolders.map(folder => (
                      <button
                        key={folder.id}
                        onClick={() => handleFolderSelect(folder.id)}
                        className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                          selectedFolderId === folder.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="font-medium truncate">{folder.name}</div>
                        <div className={`text-xs ${selectedFolderId === folder.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {folder.gifsCount ?? folder.gifs_count ?? getFolderMediaCount(folder)} GIFs
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Media Grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">
                  Media {selectedMediaIds.length > 0 && `(${selectedMediaIds.length} selected)`}
                </p>
                {selectedMediaIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedMediaIds([]);
                      setSelectedMediaPreviews([]);
                    }}
                  >
                    Clear selection
                  </Button>
                )}
              </div>
              {!selectedFolderId ? (
                <div className="flex flex-col items-center justify-center h-[420px] text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
                  <p>Select a folder to view media</p>
                </div>
              ) : loadingMedia ? (
                <div className="flex items-center justify-center h-[420px]">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : vaultMedia.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[420px] text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
                  <p>No media in this folder</p>
                </div>
              ) : (
                <ScrollArea className="h-[420px]">
                  <div className="grid grid-cols-4 gap-2 pr-4">
                    {vaultMedia.map(media => {
                      const isSelected = selectedMediaIds.includes(media.id);
                      const thumbnailUrl = getMediaThumbnail(media);
                      return (
                        <button
                          key={media.id}
                          onClick={() => handleMediaToggle(media)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                            isSelected ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                          }`}
                        >
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt="Media"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                          {media.type === 'video' && (
                            <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1">
                              <Video className="h-3 w-3 text-white" />
                              {media.duration && (
                                <span className="text-[10px] text-white">
                                  {Math.floor(media.duration / 60)}:{String(Math.floor(media.duration % 60)).padStart(2, '0')}
                                </span>
                              )}
                            </div>
                          )}
                          {media.type === 'gif' && (
                            <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5">
                              <span className="text-[10px] text-white font-medium">GIF</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {hasMoreMedia && (
                    <div className="flex justify-center mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadMoreMedia(formData.accountId, selectedFolderId!)}
                        disabled={loadingMedia}
                      >
                        {loadingMedia ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          "Load more"
                        )}
                      </Button>
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMediaDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsMediaDialogOpen(false)}>
              Done ({selectedMediaIds.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Result Dialog */}
      <Dialog open={isTestResultDialogOpen} onOpenChange={setIsTestResultDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {testResult?.success ? (
                <>
                  <Check className="h-5 w-5 text-green-500" />
                  Test Executed Successfully
                </>
              ) : (
                <>
                  <X className="h-5 w-5 text-destructive" />
                  Test Execution Failed
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {testResult && (
            <div className="space-y-4 py-4">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm font-medium mb-1">Result Message</p>
                <p className="text-sm text-muted-foreground">{testResult.message}</p>
              </div>

              {testResult.messageId && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Message ID:</span>
                  <code className="bg-muted px-2 py-1 rounded text-xs">{testResult.messageId}</code>
                </div>
              )}

              {testResult.unsentPrevious && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <div className="flex items-center gap-2 text-yellow-600 mb-1">
                    <Undo2 className="h-4 w-4" />
                    <span className="text-sm font-medium">Previous Messages Unsent</span>
                  </div>
                  {testResult.previousMessageIds && testResult.previousMessageIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Unsent {testResult.previousMessageIds.length} previous message(s)
                    </p>
                  )}
                </div>
              )}

              {testResult.autoUnsendAt && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">Auto-Unsend Scheduled</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This message will be automatically unsent at {new Date(testResult.autoUnsendAt).toLocaleTimeString()}
                  </p>
                </div>
              )}

              {testResult.error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                  <p className="text-sm font-medium text-destructive mb-1">Error Details</p>
                  <p className="text-sm text-destructive/80">{testResult.error}</p>
                </div>
              )}

              {testResult.logFile && (
                <div className="text-xs text-muted-foreground">
                  <span>Log file: </span>
                  <code className="bg-muted px-1.5 py-0.5 rounded">{testResult.logFile}</code>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsTestResultDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Detail Dialog */}
      <Dialog open={isMessageDetailDialogOpen} onOpenChange={setIsMessageDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Scheduled Message Details
            </DialogTitle>
            <DialogDescription>
              {selectedMessage && (
                <>
                  Scheduled for {new Date(selectedMessage.scheduledAt).toLocaleDateString()} at {new Date(selectedMessage.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4 py-4">
              {/* Status Badges */}
              <div className="flex items-center gap-2">
                <Badge
                  variant={selectedMessage.approvalStatus === 'approved' ? 'default' : 'secondary'}
                  className={selectedMessage.approvalStatus === 'approved' ? 'bg-green-500' : 'bg-yellow-500/20 text-yellow-600'}
                >
                  {selectedMessage.approvalStatus === 'approved' ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Approved
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3 mr-1" />
                      Pending Approval
                    </>
                  )}
                </Badge>
                <Badge variant="outline">
                  {selectedMessage.status}
                </Badge>
              </div>

              {/* Account Info */}
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground mb-1">Account</p>
                <p className="text-sm font-medium">@{selectedMessage.accountUsername}</p>
              </div>

              {/* Message Content */}
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground mb-1">Message Content</p>
                <p className="text-sm">{selectedMessage.messageContent}</p>
              </div>

              {/* Price */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Type:</span>
                <Badge variant={selectedMessage.price > 0 ? 'default' : 'secondary'}>
                  {selectedMessage.price > 0 ? (
                    <>
                      <DollarSign className="h-3 w-3 mr-1" />
                      PPV ${selectedMessage.price}
                    </>
                  ) : (
                    'Free Message'
                  )}
                </Badge>
              </div>

              {/* Recipients */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Recipients:</span>
                <span className="font-medium">
                  {selectedMessage.recipientType === 'all_subscribers' && 'All Subscribers'}
                  {selectedMessage.recipientType === 'all_chats' && 'All Chats'}
                  {selectedMessage.recipientType === 'collection' && `Collection: ${selectedMessage.collectionName || selectedMessage.collectionId}`}
                  {selectedMessage.recipientType === 'test_user' && 'Test User'}
                  {' '}({selectedMessage.recipientCount})
                </span>
              </div>

              {/* Media */}
              {selectedMessage.mediaIds && selectedMessage.mediaIds.length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Media Attached:</span>
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-4 w-4" />
                    {selectedMessage.mediaIds.length} item(s)
                  </span>
                </div>
              )}

              {/* Auto-unsend Settings */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <p className="text-xs text-muted-foreground mb-2">Auto-Unsend Settings</p>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Unsend previous message:</span>
                    <Badge variant={selectedMessage.autoUnsendPrevious ? 'default' : 'secondary'}>
                      {selectedMessage.autoUnsendPrevious ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  {selectedMessage.autoUnsendAfterMinutes && (
                    <div className="flex items-center justify-between">
                      <span>Auto-unsend after:</span>
                      <span className="font-medium">{selectedMessage.autoUnsendAfterMinutes} minutes</span>
                    </div>
                  )}
                  {selectedMessage.autoUnsendAt && (
                    <div className="flex items-center justify-between">
                      <span>Will unsend at:</span>
                      <span className="font-medium">{new Date(selectedMessage.autoUnsendAt).toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="text-xs text-muted-foreground space-y-1">
                {selectedMessage.createdAt && (
                  <p>Created: {new Date(selectedMessage.createdAt).toLocaleString()}</p>
                )}
                {selectedMessage.updatedAt && (
                  <p>Updated: {new Date(selectedMessage.updatedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsMessageDetailDialogOpen(false);
                if (selectedMessage) {
                  handleEditMessage(selectedMessage);
                }
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {selectedMessage?.approvalStatus === 'pending' && (
              <Button
                className="bg-green-500 hover:bg-green-600"
                onClick={() => {
                  if (selectedMessage) {
                    handleApproveMessage(selectedMessage.id);
                    setIsMessageDetailDialogOpen(false);
                  }
                }}
              >
                <Check className="h-4 w-4 mr-2" />
                Approve
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedMessage) {
                  handleDeleteMessage(selectedMessage.id);
                  setIsMessageDetailDialogOpen(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
