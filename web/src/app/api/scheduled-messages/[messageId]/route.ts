import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ messageId: string }>;
}

// GET /api/scheduled-messages/[messageId] - Get single message
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { messageId } = await params;
    const response = await fetch(`${API_BASE}/scheduled-messages/${messageId}`);
    const data = await response.json();

    if (!response.ok) {
      console.error('[Scheduled Messages API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Scheduled Messages API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled message' },
      { status: 500 }
    );
  }
}

// PUT /api/scheduled-messages/[messageId] - Update message
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { messageId } = await params;
    const body = await request.json();

    const response = await fetch(`${API_BASE}/scheduled-messages/${messageId}`, {
      method: 'PUT',
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
      { error: 'Failed to update scheduled message' },
      { status: 500 }
    );
  }
}

// DELETE /api/scheduled-messages/[messageId] - Delete message
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { messageId } = await params;
    const response = await fetch(`${API_BASE}/scheduled-messages/${messageId}`, {
      method: 'DELETE',
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
      { error: 'Failed to delete scheduled message' },
      { status: 500 }
    );
  }
}
