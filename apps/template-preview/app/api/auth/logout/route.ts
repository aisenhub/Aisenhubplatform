import { NextRequest, NextResponse } from 'next/server';
import { revokeSupabaseSession } from '@kit/account-auth-nextjs';

export const dynamic = 'force-dynamic';

function authConfig(): { url: string; anonKey: string; origin: string } {
  const url = (
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.replace(/\/$/u, '');
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const origin = process.env.CONSUMER_ORIGIN;
  if (!url || !anonKey || !origin) throw new Error('AUTH_NOT_CONFIGURED');
  return { url, anonKey, origin };
}

export async function POST(request: NextRequest): Promise<Response> {
  let config: ReturnType<typeof authConfig>;
  try {
    config = authConfig();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'AUTHORIZATION_UNAVAILABLE',
          message: 'AUTHORIZATION_UNAVAILABLE',
        },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const csrf = request.cookies.get('aisenhub-csrf')?.value;
  if (
    request.headers.get('origin') !== config.origin ||
    !csrf ||
    request.headers.get('x-csrf-token') !== csrf
  ) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'INVALID_INPUT' } },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const accessToken = request.cookies.get('aisenhub-session')?.value;
  if (accessToken) {
    try {
      await revokeSupabaseSession({
        url: config.url,
        publishableKey: config.anonKey,
        accessToken,
      });
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'AUTHORIZATION_UNAVAILABLE',
            message: 'AUTHORIZATION_UNAVAILABLE',
          },
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
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
