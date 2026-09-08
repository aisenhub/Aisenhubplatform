import { NextRequest, NextResponse } from 'next/server';
import {
  callbackReturnTo,
  createRequestAuthClient,
  exchangeAuthCode,
  writeAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';

export const dynamic = 'force-dynamic';

function config(): { url: string; publishableKey: string } {
  const url = (
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.replace(/\/$/u, '');
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) throw new Error('AUTH_NOT_CONFIGURED');
  return { url, publishableKey };
}

export async function GET(request: NextRequest): Promise<Response> {
  let returnTo: string;
  try {
    returnTo = callbackReturnTo(request.nextUrl.searchParams.get('returnTo'));
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'INVALID_INPUT' } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, request.url));
  try {
    const code = request.nextUrl.searchParams.get('code');
    if (!code) return redirect('/login?error=invalid_callback');
    const client = createRequestAuthClient(config());
    const { data, error } = await exchangeAuthCode(client, code);
    if (error || !data.session) return redirect('/login?error=callback_failed');
    const response = NextResponse.redirect(new URL(returnTo, request.url));
    writeAuthSessionCookies({
      writer: response.cookies as unknown as AuthCookieWriter,
      session: data.session,
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch {
    return redirect('/login?error=callback_unavailable');
  }
}
