import { NextRequest, NextResponse } from 'next/server';

const VAULT_API_BASE = 'https://of-message-sender-3qumvbkjdq-uc.a.run.app';
const VAULT_API_KEY = process.env.VAULT_API || '';

// GET /api/vault/folders?model_id=xxx - Get vault folders for a model
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const modelId = searchParams.get('model_id');

  if (!modelId) {
    return NextResponse.json({ error: 'model_id is required' }, { status: 400 });
  }

  if (!VAULT_API_KEY) {
    return NextResponse.json({ error: 'VAULT_API key not configured' }, { status: 500 });
  }

  const headers = {
    'X-API-Key': VAULT_API_KEY,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(
      `${VAULT_API_BASE}/vault/lists?model_id=${encodeURIComponent(modelId)}`,
      { headers }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vault folders error:', response.status, errorText);
      return NextResponse.json(
        { error: `Failed to fetch folders: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Vault Folders API] Response:', JSON.stringify(data).substring(0, 1000));
    return NextResponse.json(data);
  } catch (error) {
    console.error('Vault folders API error:', error);
    return NextResponse.json({ error: 'Failed to fetch vault folders' }, { status: 500 });
  }
}
