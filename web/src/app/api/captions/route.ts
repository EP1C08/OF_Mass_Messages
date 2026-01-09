import { NextRequest, NextResponse } from 'next/server';

const COLLECTIONS_API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// GET /api/captions - Get all captions
export async function GET() {
  try {
    const response = await fetch(`${COLLECTIONS_API_BASE}/captions`);
    const data = await response.json();

    if (!response.ok) {
      console.error('[Captions API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Captions API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch captions' },
      { status: 500 }
    );
  }
}

// POST /api/captions - Create new caption
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${COLLECTIONS_API_BASE}/captions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Captions API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Captions API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create caption' },
      { status: 500 }
    );
  }
}
