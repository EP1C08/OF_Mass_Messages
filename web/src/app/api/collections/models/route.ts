import { NextResponse } from 'next/server';

const COLLECTIONS_API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/collections/models - Get all available models
export async function GET() {
  try {
    const url = `${COLLECTIONS_API_BASE}/models`;
    console.log('[Models API] Fetching from:', url);

    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();

    console.log('[Models API] Response:', response.status, JSON.stringify(data).substring(0, 200));

    if (!response.ok) {
      console.error('[Models API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Models API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models. Is the local API server running?' },
      { status: 500 }
    );
  }
}
