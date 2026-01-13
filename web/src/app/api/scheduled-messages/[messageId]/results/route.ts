import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ messageId: string }>;
}

// GET /api/scheduled-messages/[messageId]/results - Get send results
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { messageId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${API_BASE}/scheduled-messages/${messageId}/results${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('[Scheduled Messages API] Results Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Scheduled Messages API] Results Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch message results' },
      { status: 500 }
    );
  }
}
