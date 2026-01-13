import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// GET /api/rotation/status/[accountId] - Get rotation status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params;

    const response = await fetch(`${API_BASE}/rotation/status/${accountId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Rotation Status API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Rotation Status API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get rotation status' },
      { status: 500 }
    );
  }
}
