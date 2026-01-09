import { useState, useEffect, useCallback } from 'react';
import { CaptionTemplate } from '@/types';

interface UseCaptionsResult {
  captions: CaptionTemplate[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createCaption: (caption: Omit<CaptionTemplate, 'id' | 'useCount'>) => Promise<CaptionTemplate | null>;
  updateCaption: (id: string, caption: Partial<CaptionTemplate>) => Promise<CaptionTemplate | null>;
  deleteCaption: (id: string) => Promise<boolean>;
  incrementUse: (id: string) => Promise<CaptionTemplate | null>;
}

export function useCaptions(): UseCaptionsResult {
  const [captions, setCaptions] = useState<CaptionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCaptions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/captions');
      if (!response.ok) {
        throw new Error('Failed to fetch captions');
      }
      const data = await response.json();
      setCaptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  const createCaption = useCallback(async (caption: Omit<CaptionTemplate, 'id' | 'useCount'>): Promise<CaptionTemplate | null> => {
    try {
      const response = await fetch('/api/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caption),
      });
      if (!response.ok) {
        throw new Error('Failed to create caption');
      }
      const newCaption = await response.json();
      setCaptions(prev => [...prev, newCaption]);
      return newCaption;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create caption');
      return null;
    }
  }, []);

  const updateCaption = useCallback(async (id: string, updates: Partial<CaptionTemplate>): Promise<CaptionTemplate | null> => {
    try {
      const response = await fetch(`/api/captions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        throw new Error('Failed to update caption');
      }
      const updatedCaption = await response.json();
      setCaptions(prev => prev.map(c => c.id === id ? updatedCaption : c));
      return updatedCaption;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update caption');
      return null;
    }
  }, []);

  const deleteCaption = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/captions/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to delete caption');
      }
      setCaptions(prev => prev.filter(c => c.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete caption');
      return false;
    }
  }, []);

  const incrementUse = useCallback(async (id: string): Promise<CaptionTemplate | null> => {
    try {
      const response = await fetch(`/api/captions/${id}/increment-use`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to increment caption usage');
      }
      const updatedCaption = await response.json();
      setCaptions(prev => prev.map(c => c.id === id ? updatedCaption : c));
      return updatedCaption;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to increment usage');
      return null;
    }
  }, []);

  return {
    captions,
    loading,
    error,
    refetch: fetchCaptions,
    createCaption,
    updateCaption,
    deleteCaption,
    incrementUse,
  };
}
