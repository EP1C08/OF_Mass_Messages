import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// GET /api/scheduled-messages - List scheduled messages
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${API_BASE}/scheduled-messages${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('[Scheduled Messages API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Scheduled Messages API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled messages' },
      { status: 500 }
    );
  }
}

// POST /api/scheduled-messages - Create scheduled message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${API_BASE}/scheduled-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Scheduled Messages API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Scheduled Messages API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create scheduled message' },
      { status: 500 }
    );
  }
}
