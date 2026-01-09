import { NextRequest, NextResponse } from 'next/server';

const VAULT_API_BASE = 'https://of-message-sender-3qumvbkjdq-uc.a.run.app';
const VAULT_API_KEY = process.env.VAULT_API || '';

// GET /api/vault/media?model_id=xxx&list_id=xxx&limit=100&offset=0 - Get media from vault folder
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const modelId = searchParams.get('model_id');
  const listId = searchParams.get('list_id');
  const limit = searchParams.get('limit') || '100';
  const offset = searchParams.get('offset') || '0';

  if (!modelId) {
    return NextResponse.json({ error: 'model_id is required' }, { status: 400 });
  }

  if (!listId) {
    return NextResponse.json({ error: 'list_id is required' }, { status: 400 });
  }

  if (!VAULT_API_KEY) {
    return NextResponse.json({ error: 'VAULT_API key not configured' }, { status: 500 });
  }

  const headers = {
    'X-API-Key': VAULT_API_KEY,
    'Content-Type': 'application/json',
  };

  try {
    const params = new URLSearchParams({
      model_id: modelId,
      list_id: listId,
      limit,
      offset,
    });

    const response = await fetch(
      `${VAULT_API_BASE}/vault/media?${params.toString()}`,
      { headers }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vault media error:', response.status, errorText);
      return NextResponse.json(
        { error: `Failed to fetch media: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Vault media API error:', error);
    return NextResponse.json({ error: 'Failed to fetch vault media' }, { status: 500 });
  }
}
