import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ messageId: string }>;
}

// POST /api/scheduled-messages/[messageId]/cancel - Cancel message
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { messageId } = await params;
    const response = await fetch(`${API_BASE}/scheduled-messages/${messageId}/cancel`, {
      method: 'POST',
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Scheduled Messages API] Cancel Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Scheduled Messages API] Cancel Error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel scheduled message' },
      { status: 500 }
    );
  }
}
