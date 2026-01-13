import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ accountId: string }>;
}

// GET /api/accounts/[accountId]/active-message - Get active message
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { accountId } = await params;
    const response = await fetch(`${API_BASE}/accounts/${accountId}/active-message`);

    if (response.status === 404) {
      return NextResponse.json(null);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error('[Active Message API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Active Message API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch active message' },
      { status: 500 }
    );
  }
}
