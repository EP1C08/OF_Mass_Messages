"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { dummyScheduledMessages, dummyAccounts, dummyActiveMessage } from "@/lib/dummy-data";
import { useCaptions } from "@/hooks/useCaptions";
import { CaptionTemplate } from "@/types";
import { ScheduledMessage } from "@/types";

export default function ScheduledMessagesPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("messages");
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ScheduledMessage | null>(null);
  const [isCaptionDialogOpen, setIsCaptionDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ScheduledMessage | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);

  // Local state for scheduled messages (demo)
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>(dummyScheduledMessages);
  const [activeMessage, setActiveMessage] = useState(dummyActiveMessage);

  // Form state
  const [formData, setFormData] = useState({
    accountId: "1",
    date: new Date().toISOString().split('T')[0],
    time: "14:00",
    messageType: "ppv" as "free" | "ppv",
    caption: "",
    price: "15",
    recipientType: "all_subscribers" as "all_subscribers" | "all_chats" | "collection",
    autoUnsendPrevious: true,
  });

  // Load captions from API
  const { captions, loading: captionsLoading, incrementUse } = useCaptions();

  // Reset form
  const resetForm = () => {
    setFormData({
      accountId: "1",
      date: selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      time: "14:00",
      messageType: "ppv",
      caption: "",
      price: "15",
      recipientType: "all_subscribers",
      autoUnsendPrevious: true,
    });
    setIsEditMode(false);
    setEditingMessage(null);
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

  // Get account info
  const getAccountInfo = (accountId: string) => {
    return dummyAccounts.find(a => a.id === accountId);
  };

  // Handle schedule new message
  const handleScheduleMessage = () => {
    const account = getAccountInfo(formData.accountId);
    if (!account) return;

    const scheduledAt = new Date(`${formData.date}T${formData.time}:00`).toISOString();

    if (isEditMode && editingMessage) {
      // Update existing message
      setScheduledMessages(prev => prev.map(msg =>
        msg.id === editingMessage.id
          ? {
              ...msg,
              accountId: formData.accountId,
              accountUsername: account.username,
              messageContent: formData.caption,
              price: formData.messageType === "ppv" ? parseFloat(formData.price) : 0,
              recipientType: formData.recipientType,
              recipientCount: formData.recipientType === "all_subscribers" ? account.subscriberCount : account.chatCount,
              scheduledAt,
              autoUnsendPrevious: formData.autoUnsendPrevious,
            }
          : msg
      ));
    } else {
      // Create new message
      const newMessage: ScheduledMessage = {
        id: `new-${Date.now()}`,
        accountId: formData.accountId,
        accountUsername: account.username,
        messageContent: formData.caption,
        price: formData.messageType === "ppv" ? parseFloat(formData.price) : 0,
        recipientType: formData.recipientType,
        recipientCount: formData.recipientType === "all_subscribers" ? account.subscriberCount : account.chatCount,
        scheduledAt,
        status: "queued",
        approvalStatus: "pending",
        autoUnsendPrevious: formData.autoUnsendPrevious,
      };
      setScheduledMessages(prev => [...prev, newMessage]);
    }

    setIsScheduleDialogOpen(false);
    resetForm();
  };

  // Handle approve message
  const handleApproveMessage = (messageId: string) => {
    setScheduledMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, approvalStatus: "approved" as const } : msg
    ));
  };

  // Handle skip message
  const handleSkipMessage = (messageId: string) => {
    setScheduledMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, status: "cancelled" as const } : msg
    ));
  };

  // Handle delete message
  const handleDeleteMessage = (messageId: string) => {
    setMessageToDelete(messageId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (messageToDelete) {
      setScheduledMessages(prev => prev.filter(msg => msg.id !== messageToDelete));
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
      autoUnsendPrevious: message.autoUnsendPrevious || false,
    });
    setIsEditMode(true);
    setEditingMessage(message);
    setIsScheduleDialogOpen(true);
  };

  // Handle unsend active message
  const handleUnsendActiveMessage = () => {
    setActiveMessage(null);
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
    const accountMessages = scheduledMessages.filter(m => m.accountId === accountId && m.status !== "cancelled");
    const pending = accountMessages.filter(m => m.approvalStatus === 'pending').length;
    const scheduled = accountMessages.length;
    return { pending, scheduled };
  };

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
          <Badge variant="outline" className="gap-1">
            <CircleDot className="h-3 w-3 text-green-500" />
            Operational
          </Badge>
          <Badge variant="outline">UTC-08:00</Badge>
          <Button onClick={openNewMessageDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Schedule New
          </Button>
        </div>
      </div>

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
                  {dummyAccounts.filter(a => a.status === 'authenticated').map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      @{account.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="h-[500px]">
              <div className="space-y-1 p-2">
                {dummyAccounts.filter(a => a.status === 'authenticated').map(account => {
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
                      onClick={() => setSelectedMessage(message)}
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
                        {message.price > 0 ? `PPV MM ($${message.price})` : 'Free MM'}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        &ldquo;{message.messageContent}&rdquo;
                      </p>
                      {message.mediaIds && message.mediaIds.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <ImageIcon className="h-3 w-3" />
                          {message.mediaIds.length} media
                        </div>
                      )}
                      <div className="flex gap-2 mt-3">
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
                        ) : (
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
                    There are no scheduled events for this day
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Scheduled Message" : "Schedule New Message"}</DialogTitle>
            <DialogDescription>
              {isEditMode ? "Update your scheduled mass message" : "Create a new scheduled mass message"}
            </DialogDescription>
          </DialogHeader>
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
                  {dummyAccounts.filter(a => a.status === 'authenticated').map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      @{account.username} ({account.modelId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Recipients</Label>
              <Select
                value={formData.recipientType}
                onValueChange={(value: "all_subscribers" | "all_chats" | "collection") =>
                  setFormData(prev => ({ ...prev, recipientType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_subscribers">All Subscribers</SelectItem>
                  <SelectItem value="all_chats">All Chats</SelectItem>
                  <SelectItem value="collection">Select Collection</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                <Label>Media</Label>
                <Button variant="ghost" size="sm">
                  Browse Media Vault
                </Button>
              </div>
              <div className="flex gap-2 p-4 bg-muted/50 rounded-lg">
                <div className="w-16 h-16 rounded bg-muted flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="w-16 h-16 rounded bg-muted flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="w-16 h-16 rounded bg-muted flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground self-center ml-2">
                  3 items from &ldquo;GIF Vault&rdquo;
                </span>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsScheduleDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleScheduleMessage}
              disabled={!formData.caption.trim()}
            >
              {isEditMode ? "Update" : "Schedule"}
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
    </div>
  );
}
