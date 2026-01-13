import { useState, useEffect, useCallback } from 'react';
import { ScheduledMessage, ActiveMessage } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

interface ScheduleStats {
  totalScheduled: number;
  pendingApproval: number;
  queued: number;
  processing: number;
  completedToday: number;
  failedToday: number;
}

interface CreateScheduledMessageRequest {
  accountId: string;
  messageContent: string;
  mediaIds?: string[];
  price: number;
  recipientType: 'all_subscribers' | 'all_chats' | 'collection' | 'test_user';
  collectionId?: string;
  collectionName?: string;
  testUserId?: string;
  scheduledAt: string;
  autoUnsendPrevious?: boolean;
}

interface UpdateScheduledMessageRequest {
  messageContent?: string;
  mediaIds?: string[];
  price?: number;
  recipientType?: 'all_subscribers' | 'all_chats' | 'collection' | 'test_user';
  collectionId?: string;
  collectionName?: string;
  testUserId?: string;
  scheduledAt?: string;
  autoUnsendPrevious?: boolean;
}

interface TestExecuteRequest {
  accountId: string;
  messageContent: string;
  mediaIds?: string[];
  price: number;
  testUserId: string;
  autoUnsendPrevious?: boolean;
  autoUnsendAfterMinutes?: number;
  dryRun?: boolean;
}

interface TestExecuteResponse {
  success: boolean;
  message: string;
  testUserId: string;
  messageId?: string;
  unsentPrevious: boolean;
  previousMessageIds?: string[];
  error?: string;
  logFile?: string;
}

interface ApproveRotationResponse {
  success: boolean;
  message: string;
  scheduled?: boolean;
  start_at?: string;
}

interface UseScheduledMessagesResult {
  messages: ScheduledMessage[];
  loading: boolean;
  error: string | null;
  stats: ScheduleStats | null;
  refetch: () => Promise<void>;
  createMessage: (data: CreateScheduledMessageRequest) => Promise<ScheduledMessage | null>;
  updateMessage: (id: string, data: UpdateScheduledMessageRequest) => Promise<ScheduledMessage | null>;
  deleteMessage: (id: string) => Promise<boolean>;
  approveMessage: (id: string, isRotation?: boolean) => Promise<ScheduledMessage | ApproveRotationResponse | null>;
  cancelMessage: (id: string) => Promise<ScheduledMessage | null>;
  getActiveMessage: (accountId: string) => Promise<ActiveMessage | null>;
  unsendActiveMessage: (accountId: string) => Promise<boolean>;
  testExecute: (data: TestExecuteRequest) => Promise<TestExecuteResponse | null>;
}

interface ListFilters {
  accountId?: string;
  status?: string;
  approvalStatus?: string;
  fromDate?: string;
  toDate?: string;
}

export function useScheduledMessages(filters?: ListFilters): UseScheduledMessagesResult {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ScheduleStats | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query params
      const params = new URLSearchParams();
      if (filters?.accountId) params.append('accountId', filters.accountId);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.approvalStatus) params.append('approvalStatus', filters.approvalStatus);
      if (filters?.fromDate) params.append('fromDate', filters.fromDate);
      if (filters?.toDate) params.append('toDate', filters.toDate);

      const queryString = params.toString();
      const url = `/api/scheduled-messages${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch scheduled messages');
      }
      const data = await response.json();
      setMessages(data);

      // Also fetch stats
      const statsUrl = `/api/scheduled-messages/stats${filters?.accountId ? `?accountId=${filters.accountId}` : ''}`;
      const statsResponse = await fetch(statsUrl);
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [filters?.accountId, filters?.status, filters?.approvalStatus, filters?.fromDate, filters?.toDate]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const createMessage = useCallback(async (data: CreateScheduledMessageRequest): Promise<ScheduledMessage | null> => {
    try {
      const response = await fetch('/api/scheduled-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to create scheduled message');
      }
      const newMessage = await response.json();
      setMessages(prev => [...prev, newMessage]);
      return newMessage;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create message');
      return null;
    }
  }, []);

  const updateMessage = useCallback(async (id: string, data: UpdateScheduledMessageRequest): Promise<ScheduledMessage | null> => {
    try {
      const response = await fetch(`/api/scheduled-messages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to update scheduled message');
      }
      const updatedMessage = await response.json();
      setMessages(prev => prev.map(m => m.id === id ? updatedMessage : m));
      return updatedMessage;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update message');
      return null;
    }
  }, []);

  const deleteMessage = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/scheduled-messages/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete scheduled message');
      }
      setMessages(prev => prev.filter(m => m.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
      return false;
    }
  }, []);

  const approveMessage = useCallback(async (id: string, isRotation?: boolean): Promise<ScheduledMessage | ApproveRotationResponse | null> => {
    try {
      // Use rotation-specific endpoint for rotation messages
      const endpoint = isRotation
        ? `/api/rotation/approve/${id}`
        : `/api/scheduled-messages/${id}/approve`;

      const response = await fetch(endpoint, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to approve message');
      }

      const result = await response.json();

      if (isRotation) {
        // For rotations, update the message status locally
        setMessages(prev => prev.map(m =>
          m.id === id
            ? { ...m, approvalStatus: 'approved', status: result.scheduled ? 'queued' : 'processing' }
            : m
        ));
        return result as ApproveRotationResponse;
      } else {
        // For regular messages
        setMessages(prev => prev.map(m => m.id === id ? result : m));
        return result as ScheduledMessage;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve message');
      return null;
    }
  }, []);

  const cancelMessage = useCallback(async (id: string): Promise<ScheduledMessage | null> => {
    try {
      const response = await fetch(`/api/scheduled-messages/${id}/cancel`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to cancel message');
      }
      const updatedMessage = await response.json();
      setMessages(prev => prev.map(m => m.id === id ? updatedMessage : m));
      return updatedMessage;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel message');
      return null;
    }
  }, []);

  const getActiveMessage = useCallback(async (accountId: string): Promise<ActiveMessage | null> => {
    try {
      const response = await fetch(`/api/accounts/${accountId}/active-message`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to get active message');
      }
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error getting active message:', err);
      return null;
    }
  }, []);

  const unsendActiveMessage = useCallback(async (accountId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/accounts/${accountId}/unsend-active`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to unsend active message');
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsend message');
      return false;
    }
  }, []);

  const testExecute = useCallback(async (data: TestExecuteRequest): Promise<TestExecuteResponse | null> => {
    try {
      const response = await fetch('/api/scheduled-messages/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Test execution failed');
      }
      return await response.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test execution failed');
      return null;
    }
  }, []);

  return {
    messages,
    loading,
    error,
    stats,
    refetch: fetchMessages,
    createMessage,
    updateMessage,
    deleteMessage,
    approveMessage,
    cancelMessage,
    getActiveMessage,
    unsendActiveMessage,
    testExecute,
  };
}
