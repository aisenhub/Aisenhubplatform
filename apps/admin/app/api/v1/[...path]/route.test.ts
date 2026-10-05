import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authCookieNames,
  encodeAuthSessionAcknowledgement,
} from '@kit/account-auth-nextjs';

import { GET, POST, isAllowedAdminPath } from './route';
import { POST as login } from '../../auth/login/route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const ACCESS_TOKEN = `e30.${Buffer.from(
  JSON.stringify({ session_id: SESSION_ID, exp: 4_102_444_800 }),
).toString('base64url')}.signature`;
const COOKIE_NAMES = authCookieNames('admin');
const LOGIN_ACK = encodeAuthSessionAcknowledgement({
  fence: 'none',
  session_id: SESSION_ID,
});

function request(
  method: 'GET' | 'POST',
  path: string,
  options: {
    readonly csrf?: boolean;
    readonly body?: string;
    readonly query?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  const cookies = [
    `${COOKIE_NAMES.access}=${ACCESS_TOKEN}`,
    `${COOKIE_NAMES.loginAck}=${LOGIN_ACK}`,
  ];
  if (options.csrf) {
    cookies.push(`${COOKIE_NAMES.csrf}=csrf-token`);
    headers.set('origin', 'https://admin.example');
    headers.set('x-csrf-token', 'csrf-token');
    headers.set('content-type', 'application/json');
  }
  headers.set('cookie', cookies.join('; '));
  return new NextRequest(
    `http://admin.local/api/v1/${path}${options.query ?? ''}`,
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

describe('admin BFF', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('ACCOUNT_API_URL', 'https://account.example');
    vi.stubEnv('ADMIN_ORIGIN', 'https://admin.example');
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects oversized business and login JSON before contacting upstream', async () => {
    const oversized = 'x'.repeat(65_537);
    const response = await POST(
      request('POST', 'admin/api/v1/platforms', {
        csrf: true,
        body: oversized,
      }),
      context(['admin', 'api', 'v1', 'platforms']),
    );
    expect(response.status).toBe(413);
    vi.stubEnv('SUPABASE_URL', 'http://local-auth');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'fake-publishable-key');
    const loginResponse = await login(
      request('POST', 'auth/login', { csrf: true, body: oversized }),
    );
    expect(loginResponse.status).toBe(413);
    const invalidLogin = await login(
      request('POST', 'auth/login', { csrf: true, body: 'null' }),
    );
    expect(invalidLogin.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the explicit allowlist aligned with every Admin OpenAPI operation', () => {
    const contract = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          '../../docs/reference/contracts/admin.openapi.json',
        ),
        'utf8',
      ),
    ) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const supportedMethods = new Set(['get', 'post', 'patch', 'delete']);
    const fixtureId = '11111111-1111-4111-8111-111111111111';
    let operationCount = 0;

    for (const [contractPath, operations] of Object.entries(contract.paths)) {
      const runtimePath = contractPath
        .replace(/^\//u, '')
        .replace(/\{[^}]+\}/gu, fixtureId);
      for (const method of Object.keys(operations)) {
        if (!supportedMethods.has(method)) continue;
        operationCount += 1;
        expect(
          isAllowedAdminPath(method.toUpperCase(), runtimePath),
          `${method.toUpperCase()} ${contractPath}`,
        ).toBe(true);
      }
    }

    expect(operationCount).toBe(45);
  });

  it('preserves the central request ID for response and audit correlation', async () => {
    const centralId = '11111111-1111-4111-8111-111111111112';
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], request_id: centralId }), {
        headers: { 'x-request-id': centralId },
      }),
    );
    const response = await GET(
      request('GET', 'admin/api/v1/platforms'),
      context(['admin', 'api', 'v1', 'platforms']),
    );
    expect(response.headers.get('x-request-id')).toBe(centralId);
    expect((await response.json()).request_id).toBe(centralId);
  });

  it('rejects paths outside the explicit Admin allowlist', async () => {
    const response = await GET(
      request('GET', 'v1/profile'),
      context(['v1', 'profile']),
    );
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows documented Admin reads and attaches an upstream deadline', async () => {
    const response = await GET(
      request('GET', 'admin/api/v1/platforms', { query: '?limit=10' }),
      context(['admin', 'api', 'v1', 'platforms']),
    );
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://account.example/admin/api/v1/platforms?limit=10');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('allows documented Admin mutations with Origin and CSRF', async () => {
    const response = await POST(
      request('POST', 'admin/api/v1/platforms', {
        csrf: true,
        body: JSON.stringify({ code: 'fixture', name: 'Fixture' }),
      }),
      context(['admin', 'api', 'v1', 'platforms']),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
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
    const response = await GET(
      request('GET', 'admin/api/v1/platforms'),
      context(['admin', 'api', 'v1', 'platforms']),
    );
    expect(response.status).toBe(503);
  });
});
