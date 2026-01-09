import { NextRequest, NextResponse } from 'next/server';

const COLLECTIONS_API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ listId: string; userId: string }>;
}

// DELETE /api/collections/[listId]/users/[userId]?model_id=... - Remove user from collection
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { listId, userId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const modelId = searchParams.get('model_id');

  if (!modelId) {
    return NextResponse.json({ error: 'model_id is required' }, { status: 400 });
  }

  try {
    const url = `${COLLECTIONS_API_BASE}/collections/${listId}/users/${userId}?model_id=${encodeURIComponent(modelId)}`;
    console.log('[Collections API] Removing user:', url);

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
      { error: 'Failed to remove user from collection' },
      { status: 500 }
    );
  }
}
