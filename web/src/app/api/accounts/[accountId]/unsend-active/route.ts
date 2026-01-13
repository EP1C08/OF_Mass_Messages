import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ accountId: string }>;
}

// POST /api/accounts/[accountId]/unsend-active - Unsend active message
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { accountId } = await params;
    const response = await fetch(`${API_BASE}/accounts/${accountId}/unsend-active`, {
      method: 'POST',
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Unsend Active API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Unsend Active API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to unsend active message' },
      { status: 500 }
    );
  }
}
