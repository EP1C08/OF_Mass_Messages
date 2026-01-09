import { NextResponse } from 'next/server';

const COLLECTIONS_API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// GET /api/collections/models - Get all available models
export async function GET() {
  try {
    const url = `${COLLECTIONS_API_BASE}/models`;
    console.log('[Collections API] Fetching models:', url);

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
      { error: 'Failed to fetch models. Is the local API server running?' },
      { status: 500 }
    );
  }
}
