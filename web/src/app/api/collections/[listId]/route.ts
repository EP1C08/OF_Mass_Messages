import { NextRequest, NextResponse } from 'next/server';

const COLLECTIONS_API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ listId: string }>;
}

// GET /api/collections/[listId]?model_id=... - Get a specific collection
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { listId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const modelId = searchParams.get('model_id');

  if (!modelId) {
    return NextResponse.json({ error: 'model_id is required' }, { status: 400 });
  }

  try {
    const url = `${COLLECTIONS_API_BASE}/collections/${listId}?model_id=${encodeURIComponent(modelId)}`;
    console.log('[Collections API] Fetching collection:', url);

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
      { error: 'Failed to fetch collection' },
      { status: 500 }
    );
  }
}

// DELETE /api/collections/[listId]?model_id=... - Delete a collection
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { listId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const modelId = searchParams.get('model_id');

  if (!modelId) {
    return NextResponse.json({ error: 'model_id is required' }, { status: 400 });
  }

  try {
    const url = `${COLLECTIONS_API_BASE}/collections/${listId}?model_id=${encodeURIComponent(modelId)}`;
    console.log('[Collections API] Deleting collection:', url);

    const response = await fetch(url, { method: 'DELETE' });
    const data = await response.json();

    if (!response.ok) {
      console.error('[Collections API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Collections API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete collection' },
      { status: 500 }
    );
  }
}
