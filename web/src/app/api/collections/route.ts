import { NextRequest, NextResponse } from 'next/server';

const COLLECTIONS_API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// GET /api/collections?model_id=... - Get all collections for a model
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const modelId = searchParams.get('model_id');

  if (!modelId) {
    return NextResponse.json({ error: 'model_id is required' }, { status: 400 });
  }

  try {
    const url = `${COLLECTIONS_API_BASE}/collections?model_id=${encodeURIComponent(modelId)}`;
    console.log('[Collections API] Fetching:', url);

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
      { error: 'Failed to fetch collections. Is the local API server running?' },
      { status: 500 }
    );
  }
}

// POST /api/collections - Create a new collection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, model_id } = body;

    if (!name || !model_id) {
      return NextResponse.json(
        { error: 'name and model_id are required' },
        { status: 400 }
      );
    }

    const url = `${COLLECTIONS_API_BASE}/collections`;
    console.log('[Collections API] Creating collection:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, model_id }),
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
      { error: 'Failed to create collection' },
      { status: 500 }
    );
  }
}
