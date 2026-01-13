import { useState, useCallback } from 'react';
import { VaultApiFolder, VaultApiMedia, VaultMediaResponse, VaultFoldersResponse } from '@/types';

interface UseVaultMediaResult {
  folders: VaultApiFolder[];
  media: VaultApiMedia[];
  loading: boolean;
  loadingMedia: boolean;
  error: string | null;
  hasMore: boolean;
  totalCount: number;
  fetchFolders: (modelId: string) => Promise<void>;
  fetchMedia: (modelId: string, folderId: string | number, reset?: boolean) => Promise<void>;
  loadMoreMedia: (modelId: string, folderId: string | number) => Promise<void>;
  clearMedia: () => void;
}

export function useVaultMedia(): UseVaultMediaResult {
  const [folders, setFolders] = useState<VaultApiFolder[]>([]);
  const [media, setMedia] = useState<VaultApiMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);

  const fetchFolders = useCallback(async (modelId: string) => {
    if (!modelId) {
      setFolders([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/vault/folders?model_id=${encodeURIComponent(modelId)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch vault folders');
      }
      const data: VaultFoldersResponse = await response.json();
      setFolders(data.folders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMedia = useCallback(async (modelId: string, folderId: string | number, reset: boolean = true) => {
    if (!modelId || !folderId) {
      setMedia([]);
      return;
    }

    try {
      setLoadingMedia(true);
      setError(null);

      const newOffset = reset ? 0 : offset;
      const params = new URLSearchParams({
        model_id: modelId,
        list_id: String(folderId),
        limit: '50',
        offset: String(newOffset),
      });

      const response = await fetch(`/api/vault/media?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch vault media');
      }
      const data: VaultMediaResponse = await response.json();

      if (reset) {
        setMedia(data.media || []);
        setOffset(50);
      } else {
        setMedia(prev => [...prev, ...(data.media || [])]);
        setOffset(prev => prev + 50);
      }

      setHasMore(data.has_more);
      setTotalCount(data.total_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      if (reset) {
        setMedia([]);
      }
    } finally {
      setLoadingMedia(false);
    }
  }, [offset]);

  const loadMoreMedia = useCallback(async (modelId: string, folderId: string | number) => {
    await fetchMedia(modelId, folderId, false);
  }, [fetchMedia]);

  const clearMedia = useCallback(() => {
    setMedia([]);
    setOffset(0);
    setHasMore(false);
    setTotalCount(0);
  }, []);

  return {
    folders,
    media,
    loading,
    loadingMedia,
    error,
    hasMore,
    totalCount,
    fetchFolders,
    fetchMedia,
    loadMoreMedia,
    clearMedia,
  };
}
