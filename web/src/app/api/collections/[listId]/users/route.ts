import { NextRequest, NextResponse } from 'next/server';

const COLLECTIONS_API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ listId: string }>;
}

// GET /api/collections/[listId]/users?model_id=...&limit=20&offset=0 - Get users in a collection (paginated)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { listId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const modelId = searchParams.get('model_id');
  const limit = searchParams.get('limit') || '20';
  const offset = searchParams.get('offset') || '0';

  if (!modelId) {
    return NextResponse.json({ error: 'model_id is required' }, { status: 400 });
  }

  try {
    const url = `${COLLECTIONS_API_BASE}/collections/${listId}/users?model_id=${encodeURIComponent(modelId)}&limit=${limit}&offset=${offset}`;
    console.log('[Collections API] Fetching users:', url);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('[Collections API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Collections API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collection users' },
      { status: 500 }
    );
  }
}

// POST /api/collections/[listId]/users - Add user to collection
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { listId } = await params;

  try {
    const body = await request.json();
    const { user_id, model_id } = body;

    if (!user_id || !model_id) {
      return NextResponse.json(
        { error: 'user_id and model_id are required' },
        { status: 400 }
      );
    }

    const url = `${COLLECTIONS_API_BASE}/collections/${listId}/users`;
    console.log('[Collections API] Adding user:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, model_id }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Collections API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Collections API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to add user to collection' },
      { status: 500 }
    );
  }
}
