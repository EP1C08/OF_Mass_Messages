import { NextRequest, NextResponse } from 'next/server';

const COLLECTIONS_API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ captionId: string }>;
}

// GET /api/captions/[captionId] - Get a specific caption
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { captionId } = await params;

  try {
    const response = await fetch(`${COLLECTIONS_API_BASE}/captions/${captionId}`);
    const data = await response.json();

    if (!response.ok) {
      console.error('[Captions API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Captions API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch caption' },
      { status: 500 }
    );
  }
}

// PUT /api/captions/[captionId] - Update a caption
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { captionId } = await params;

  try {
    const body = await request.json();

    const response = await fetch(`${COLLECTIONS_API_BASE}/captions/${captionId}`, {
      method: 'PUT',
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
      { error: 'Failed to update caption' },
      { status: 500 }
    );
  }
}

// DELETE /api/captions/[captionId] - Delete a caption
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { captionId } = await params;

  try {
    const response = await fetch(`${COLLECTIONS_API_BASE}/captions/${captionId}`, {
      method: 'DELETE',
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();

    if (!response.ok) {
      console.error('[Captions API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Captions API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete caption' },
      { status: 500 }
    );
  }
}
