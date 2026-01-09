import { NextRequest, NextResponse } from 'next/server';

const VAULT_API_BASE = 'https://of-message-sender-3qumvbkjdq-uc.a.run.app';
const VAULT_API_KEY = process.env.VAULT_API || '';

// GET /api/vault - Get models or health check
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  console.log('[Vault API] Action:', action);
  console.log('[Vault API] Key configured:', !!VAULT_API_KEY, 'Key length:', VAULT_API_KEY.length);

  if (!VAULT_API_KEY) {
    return NextResponse.json({ error: 'VAULT_API key not configured' }, { status: 500 });
  }

  const headers = {
    'X-API-Key': VAULT_API_KEY,
    'Content-Type': 'application/json',
  };

  try {
    if (action === 'health') {
      const url = `${VAULT_API_BASE}/health`;
      console.log('[Vault API] Fetching:', url);
      const response = await fetch(url, { headers });
      console.log('[Vault API] Health response status:', response.status);
      const data = await response.json();
      console.log('[Vault API] Health data:', data);
      return NextResponse.json(data);
    }

    if (action === 'models') {
      const url = `${VAULT_API_BASE}/models`;
      console.log('[Vault API] Fetching:', url);
      const response = await fetch(url, { headers });
      console.log('[Vault API] Models response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Vault API] Models error:', response.status, errorText);
        return NextResponse.json({ error: `API error: ${response.status}`, details: errorText }, { status: response.status });
      }

      const data = await response.json();
      console.log('[Vault API] Models data:', JSON.stringify(data).substring(0, 500));
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Invalid action. Use action=health or action=models' }, { status: 400 });
  } catch (error) {
    console.error('[Vault API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch from vault API', details: String(error) }, { status: 500 });
  }
}

// POST /api/vault - Refresh authentication
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  console.log('[Vault API] POST Action:', action);

  if (!VAULT_API_KEY) {
    return NextResponse.json({ error: 'VAULT_API key not configured' }, { status: 500 });
  }

  const headers = {
    'X-API-Key': VAULT_API_KEY,
    'Content-Type': 'application/json',
  };

  try {
    if (action === 'refresh-auth') {
      const url = `${VAULT_API_BASE}/refresh-auth`;
      console.log('[Vault API] Calling refresh-auth:', url);
      const response = await fetch(url, { method: 'POST', headers });
      console.log('[Vault API] Refresh-auth response status:', response.status);

      const data = await response.json();
      console.log('[Vault API] Refresh-auth data:', JSON.stringify(data));

      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to refresh auth', details: data }, { status: response.status });
      }

      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Invalid action. Use action=refresh-auth' }, { status: 400 });
  } catch (error) {
    console.error('[Vault API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch from vault API', details: String(error) }, { status: 500 });
  }
}
