import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authCookieNames,
  encodeAuthSessionAcknowledgement,
} from '@kit/account-auth-nextjs';

import { GET, POST } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const ACCESS_TOKEN = `e30.${Buffer.from(
  JSON.stringify({ session_id: SESSION_ID, exp: 4_102_444_800 }),
).toString('base64url')}.signature`;
const COOKIE_NAMES = authCookieNames('consumer');
const LOGIN_ACK = encodeAuthSessionAcknowledgement({
  fence: 'none',
  session_id: SESSION_ID,
});

type RequestOptions = {
  readonly headers?: Record<string, string>;
  readonly authenticated?: boolean;
  readonly csrf?: boolean;
  readonly recentProof?: string;
  readonly body?: string;
  readonly query?: string;
};

function request(
  method: 'GET' | 'POST',
  path: string,
  options: RequestOptions = {},
): NextRequest {
  const headers = new Headers(options.headers);
  const cookies: string[] = [];

  if (options.authenticated) {
    cookies.push(`${COOKIE_NAMES.access}=${ACCESS_TOKEN}`);
    cookies.push(`${COOKIE_NAMES.loginAck}=${LOGIN_ACK}`);
  }
  if (options.csrf) cookies.push(`${COOKIE_NAMES.csrf}=csrf-token`);
  if (options.recentProof)
    cookies.push(`${COOKIE_NAMES.recentProof}=${options.recentProof}`);
  if (cookies.length > 0) headers.set('cookie', cookies.join('; '));

  return new NextRequest(
    `http://template.local/api/v1/${path}${options.query ?? ''}`,
    {
      method,
      headers,
      body: method === 'GET' ? undefined : options.body,
    },
  );
}

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe('template-preview Consumer BFF', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('ACCOUNT_API_URL', 'https://account.example');
    vi.stubEnv('ACCOUNT_PLATFORM_KEY', 'server-platform-key');
    vi.stubEnv('TEMPLATE_ORIGIN', 'https://template.example');
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'upstream-request-id',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects paths outside the Consumer allowlist before contacting upstream', async () => {
    const response = await GET(
      request('GET', 'admin/api/v1/platforms'),
      context(['admin', 'api', 'v1', 'platforms']),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows public catalog reads without a session and injects the server platform key', async () => {
    const response = await GET(
      request('GET', 'plans', { query: '?limit=10' }),
      context(['plans']),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('https://account.example/v1/plans?limit=10');
    expect(headers.get('x-platform-key')).toBe('server-platform-key');
    expect(headers.get('authorization')).toBeNull();
  });

  it('aborts a stalled Account API request at the configured deadline', async () => {
    vi.stubEnv('ACCOUNT_API_TIMEOUT_MS', '5');
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          expect(signal).toBeInstanceOf(AbortSignal);
          if (signal?.aborted) reject(signal.reason);
          else
            signal?.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
        }),
    );
    const response = await GET(request('GET', 'plans'), context(['plans']));
    expect(response.status).toBe(503);
  });

  it('requires an acknowledged session for protected reads', async () => {
    const response = await GET(request('GET', 'profile'), context(['profile']));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires both the configured Origin and matching CSRF token for mutations', async () => {
    const wrongOrigin = await POST(
      request('POST', 'account/activate', {
        authenticated: true,
        csrf: true,
        headers: {
          origin: 'https://attacker.example',
          'x-csrf-token': 'csrf-token',
        },
      }),
      context(['account', 'activate']),
    );
    expect(wrongOrigin.status).toBe(403);

    const missingCsrf = await POST(
      request('POST', 'account/activate', {
        authenticated: true,
        headers: { origin: 'https://template.example' },
      }),
      context(['account', 'activate']),
    );
    expect(missingCsrf.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only the approved credential headers and prefers trusted cookie credentials', async () => {
    const response = await POST(
      request('POST', 'subscription/redeem', {
        authenticated: true,
        csrf: true,
        recentProof: 'cookie-proof',
        body: JSON.stringify({ code: 'TEST-CODE' }),
        headers: {
          origin: 'https://template.example',
          authorization: 'Bearer attacker-token',
          'x-platform-key': 'attacker-platform-key',
          'x-csrf-token': 'csrf-token',
          'x-recent-auth-proof': 'attacker-proof',
          'x-reauth-access-token': 'event-access-token',
          'idempotency-key': 'idem-1',
          'content-type': 'application/json',
          'x-untrusted-header': 'do-not-forward',
        },
      }),
      context(['subscription', 'redeem']),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('https://account.example/v1/subscription/redeem');
    expect(headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.get('x-platform-key')).toBe('server-platform-key');
    expect(headers.get('x-recent-auth-proof')).toBe('cookie-proof');
    expect(headers.get('x-reauth-access-token')).toBe('event-access-token');
    expect(headers.get('idempotency-key')).toBe('idem-1');
    expect(headers.get('x-untrusted-header')).toBeNull();
    expect(headers.get('origin')).toBeNull();
    expect(init.body).toBe(JSON.stringify({ code: 'TEST-CODE' }));
  });
});
