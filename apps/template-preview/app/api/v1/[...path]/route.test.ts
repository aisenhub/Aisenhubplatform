import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authCookieNames,
  encodeAuthSessionAcknowledgement,
} from '@kit/account-auth-nextjs';

import { DELETE, GET, POST, PUT } from './route';
import { POST as login } from '../../auth/login/route';

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
  readonly body?: BodyInit;
  readonly query?: string;
};

function request(
  method: 'DELETE' | 'GET' | 'POST' | 'PUT',
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
    fetchMock.mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify({
            data: url.endsWith('/v1/account/principal')
              ? { platform_account_id: SESSION_ID }
              : [],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'upstream-request-id',
            },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('forwards an empty streamed DELETE body while keeping its byte limit', async () => {
    const response = await DELETE(
      request('DELETE', `config-files/${SESSION_ID}`, {
        authenticated: true,
        csrf: true,
        body: '',
        headers: {
          origin: 'https://template.example',
          'x-csrf-token': 'csrf-token',
        },
      }),
      context(['config-files', SESSION_ID]),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'DELETE',
      body: '',
    });
  });

  it('rejects oversized business and login JSON before contacting upstream', async () => {
    const options = {
      authenticated: true,
      csrf: true,
      body: 'x'.repeat(65_537),
      headers: {
        origin: 'https://template.example',
        'x-csrf-token': 'csrf-token',
      },
    };
    const response = await POST(
      request('POST', 'account/activate', options),
      context(['account', 'activate']),
    );
    expect(response.status).toBe(413);
    vi.stubEnv('SUPABASE_URL', 'http://local-auth');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'fake-publishable-key');
    const loginResponse = await login(request('POST', 'auth/login', options));
    expect(loginResponse.status).toBe(413);
    const invalidLogin = await login(
      request('POST', 'auth/login', { ...options, body: 'null' }),
    );
    expect(invalidLogin.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('preserves non-UTF-8 upload bytes when proxying file content', async () => {
    const fileId = '11111111-1111-4111-8111-111111111111';
    const bytes = Uint8Array.from([0x00, 0xff, 0x01, 0x80, 0x41]);
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );

    const response = await PUT(
      request('PUT', `config-files/${fileId}/content`, {
        authenticated: true,
        csrf: true,
        body,
        headers: {
          origin: 'https://template.example',
          'x-csrf-token': 'csrf-token',
          'content-type': 'application/octet-stream',
          'idempotency-key': 'upload-1',
        },
      }),
      context(['config-files', fileId, 'content']),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://account.example/v1/account/principal',
    );
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(init.body as ArrayBuffer))).toEqual(
      Array.from(bytes),
    );
  });

  it('rejects declared, streamed and compressed oversized uploads before sending content upstream', async () => {
    const fileId = SESSION_ID;
    const cases: readonly {
      body: BodyInit;
      headers: Record<string, string>;
      status: number;
    }[] = [
      { body: 'x', headers: { 'content-length': '1048577' }, status: 413 },
      { body: new Uint8Array(1_048_577).buffer, headers: {}, status: 413 },
      { body: 'x', headers: { 'content-encoding': 'gzip' }, status: 400 },
    ];
    for (const options of cases) {
      fetchMock.mockClear();
      const response = await PUT(
        request('PUT', `config-files/${fileId}/content`, {
          authenticated: true,
          csrf: true,
          body: options.body,
          headers: {
            origin: 'https://template.example',
            'x-csrf-token': 'csrf-token',
            ...options.headers,
          },
        }),
        context(['config-files', fileId, 'content']),
      );
      expect(response.status).toBe(options.status);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://account.example/v1/account/principal',
      );
    }
  });

  it('rejects invalid sessions without reading upload bytes', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'SESSION_REVOKED' } }), {
        status: 401,
      }),
    );
    const input = request('PUT', `config-files/${SESSION_ID}/content`, {
      authenticated: true,
      csrf: true,
      body: 'private bytes',
      headers: {
        origin: 'https://template.example',
        'x-csrf-token': 'csrf-token',
      },
    });
    const response = await PUT(
      input,
      context(['config-files', SESSION_ID, 'content']),
    );
    expect(response.status).toBe(401);
    expect(input.bodyUsed).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('limits concurrent body reads by the central account and releases admission after completion', async () => {
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    const waiting = [0, 1].map(() => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controllers.push(controller);
        },
      });
      return PUT(
        request('PUT', `config-files/${SESSION_ID}/content`, {
          authenticated: true,
          csrf: true,
          body,
          headers: {
            origin: 'https://template.example',
            'x-csrf-token': 'csrf-token',
          },
        }),
        context(['config-files', SESSION_ID, 'content']),
      );
    });
    // Both requests have acquired admission and are waiting for body chunks.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const third = request('PUT', `config-files/${SESSION_ID}/content`, {
      authenticated: true,
      csrf: true,
      body: 'x',
      headers: {
        origin: 'https://template.example',
        'x-csrf-token': 'csrf-token',
      },
    });
    try {
      const response = await PUT(
        third,
        context(['config-files', SESSION_ID, 'content']),
      );
      expect(response.status).toBe(429);
      expect(third.bodyUsed).toBe(false);
      expect(response.headers.get('retry-after')).toBe('1');
    } finally {
      for (const controller of controllers) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      }
      const responses = await Promise.all(waiting);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
    }
    const final = await PUT(
      request('PUT', `config-files/${SESSION_ID}/content`, {
        authenticated: true,
        csrf: true,
        body: 'x',
        headers: {
          origin: 'https://template.example',
          'x-csrf-token': 'csrf-token',
        },
      }),
      context(['config-files', SESSION_ID, 'content']),
    );
    expect(final.status).toBe(200);
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
