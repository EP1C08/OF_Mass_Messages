import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// POST /api/rotation/stop/[accountId] - Stop caption rotation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params;

    const response = await fetch(`${API_BASE}/rotation/stop/${accountId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Rotation Stop API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Rotation Stop API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to stop rotation' },
      { status: 500 }
    );
  }
}
