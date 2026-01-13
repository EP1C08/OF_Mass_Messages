import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COLLECTIONS_API_URL || 'http://localhost:8001';

// POST /api/scheduled-messages/test - Test execute a message to a single user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${API_BASE}/scheduled-messages/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Test Execute API] Error:', response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Test Execute API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to execute test message' },
      { status: 500 }
    );
  }
}
