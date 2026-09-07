import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const origin = process.env.CONSUMER_ORIGIN;
  const csrf = request.cookies.get('aisenhub-csrf')?.value;
  if (
    !origin ||
    request.headers.get('origin') !== origin ||
    !csrf ||
    request.headers.get('x-csrf-token') !== csrf
  ) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'INVALID_INPUT' } },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const response = NextResponse.json(
    { data: { authenticated: false } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  response.cookies.delete('aisenhub-session');
  response.cookies.delete('aisenhub-refresh-token');
  response.cookies.delete('aisenhub-csrf');
  return response;
}
