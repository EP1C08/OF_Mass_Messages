import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// GET /api/scheduled-messages/stats - Get schedule statistics
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${API_BASE}/scheduled-messages-stats${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('[Scheduled Messages Stats API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Scheduled Messages Stats API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedule stats' },
      { status: 500 }
    );
  }
}
