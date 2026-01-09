import { NextRequest, NextResponse } from 'next/server';

const COLLECTIONS_API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ captionId: string }>;
}

// POST /api/captions/[captionId]/increment-use - Increment usage count
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { captionId } = await params;

  try {
    const response = await fetch(`${COLLECTIONS_API_BASE}/captions/${captionId}/increment-use`, {
      method: 'POST',
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
      { error: 'Failed to increment caption usage' },
      { status: 500 }
    );
  }
}
