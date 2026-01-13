import { useState, useCallback } from 'react';
import { CollectionsApiCollection } from '@/types';

interface UseCollectionsResult {
  collections: CollectionsApiCollection[];
  loading: boolean;
  error: string | null;
  fetchCollections: (modelId: string) => Promise<void>;
}

export function useCollections(): UseCollectionsResult {
  const [collections, setCollections] = useState<CollectionsApiCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCollections = useCallback(async (modelId: string) => {
    if (!modelId) {
      setCollections([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/collections?model_id=${encodeURIComponent(modelId)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch collections');
      }
      const data = await response.json();
      // API returns array of collections
      setCollections(Array.isArray(data) ? data : data.collections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    collections,
    loading,
    error,
    fetchCollections,
  };
}
