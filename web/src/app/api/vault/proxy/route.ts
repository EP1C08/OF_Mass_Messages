import { NextRequest, NextResponse } from 'next/server';

const VAULT_API_BASE = 'https://of-message-sender-3qumvbkjdq-uc.a.run.app';
const VAULT_API_KEY = process.env.VAULT_API || '';

// GET /api/vault/proxy?path=/proxy/image?url=... - Proxy images from vault API
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'path parameter is required' }, { status: 400 });
  }

  if (!VAULT_API_KEY) {
    return NextResponse.json({ error: 'VAULT_API key not configured' }, { status: 500 });
  }

  try {
    // Build the full URL to the vault API
    // The image proxy endpoint uses api_key as a query parameter (not header)
    // This is because <img> tags can't send headers
    const separator = path.includes('?') ? '&' : '?';
    const url = `${VAULT_API_BASE}${path}${separator}api_key=${encodeURIComponent(VAULT_API_KEY)}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error('[Vault Proxy] Error:', response.status);
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: response.status }
      );
    }

    // Get the image data as a buffer
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Return the image with proper headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('[Vault Proxy] Error:', error);
    return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 });
  }
}
