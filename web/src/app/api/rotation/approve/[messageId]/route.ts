import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// POST /api/rotation/approve/[messageId] - Approve a pending rotation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;

    const response = await fetch(`${API_BASE}/rotation/approve/${messageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Rotation Approve API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Rotation Approve API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to approve rotation' },
      { status: 500 }
    );
  }
}
