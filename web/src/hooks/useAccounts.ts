import { useState, useEffect, useCallback } from 'react';
import { Account } from '@/types';

interface ApiModelResponse {
  model_id: string;
  username: string;
  authenticated: boolean;
}

interface UseAccountsResult {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAccounts(): UseAccountsResult {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[useAccounts] Fetching accounts from /api/collections/models');
      const response = await fetch('/api/collections/models');

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useAccounts] API error:', response.status, errorText);
        throw new Error(`Failed to fetch accounts: ${response.status}`);
      }

      const data: ApiModelResponse[] = await response.json();
      console.log('[useAccounts] Received accounts:', data);

      // Transform API response to Account type
      const transformedAccounts: Account[] = data.map((model) => ({
        id: model.model_id,
        modelId: model.model_id,
        username: model.username,
        status: model.authenticated ? 'authenticated' : 'failed',
        subscriberCount: 0, // Will be populated when selected
        chatCount: 0, // Will be populated when selected
        lastAuth: new Date().toISOString(),
      }));

      console.log('[useAccounts] Transformed accounts:', transformedAccounts.length);
      setAccounts(transformedAccounts);
    } catch (err) {
      console.error('[useAccounts] Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    loading,
    error,
    refetch: fetchAccounts,
  };
}
