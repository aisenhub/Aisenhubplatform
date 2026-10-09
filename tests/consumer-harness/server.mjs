import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  contractSummary,
  operationFor,
  validateSupportedOperations,
} from './contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(here, 'public');
const ACCESS = 'aisenhub-harness-access';
const REFRESH = 'aisenhub-harness-refresh';
const CSRF = 'aisenhub-harness-csrf';
const JSON_LIMIT = 65_536;
const BINARY_LIMIT = 1_048_576;
const DEFAULT_TIMEOUT_MS = 5_000;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`HARNESS_MISSING_${name}`);
  return value;
}

const origin = new URL(required('HARNESS_ORIGIN'));
const port = Number.parseInt(required('HARNESS_PORT'), 10);
if (
  origin.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost', '::1'].includes(origin.hostname) ||
  !Number.isSafeInteger(port) ||
  port <= 0 ||
  Number(origin.port || 80) !== port
) {
  throw new Error('HARNESS_LOOPBACK_ONLY');
}

const supabaseUrl = required('SUPABASE_URL').replace(/\/$/u, '');
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY');
const accountApiUrl = required('ACCOUNT_API_URL').replace(/\/$/u, '');
const platformKey = required('ACCOUNT_PLATFORM_KEY');
const timeoutMs = Math.min(
  Math.max(
    1,
    Number.parseInt(process.env.ACCOUNT_API_TIMEOUT_MS ?? '', 10) ||
      DEFAULT_TIMEOUT_MS,
  ),
  30_000,
);

const contractFailures = validateSupportedOperations();
if (contractFailures.length) throw new Error(contractFailures.join('; '));

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index < 0
          ? [part, '']
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function cookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Strict',
  ];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

function clearSessionCookies() {
  return [
    cookie(ACCESS, '', { httpOnly: true, maxAge: 0 }),
    cookie(REFRESH, '', { httpOnly: true, maxAge: 0 }),
  ];
}

function responseHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'X-Request-Id': crypto.randomUUID(),
    ...extra,
  };
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(
    status,
    responseHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    }),
  );
  res.end(JSON.stringify(body));
}

function error(res, status, code, headers = {}) {
  const requestId = crypto.randomUUID();
  sendJson(
    res,
    status,
    { error: { code, message: code }, request_id: requestId },
    { 'X-Request-Id': requestId, ...headers },
  );
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function validOrigin(req) {
  return req.headers.origin === origin.origin;
}

function validCsrf(req, cookies) {
  return Boolean(
    cookies[CSRF] && cookies[CSRF] === req.headers['x-csrf-token'],
  );
}

async function authRequest(pathname, init) {
  return fetch(`${supabaseUrl}${pathname}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function login(req, res) {
  if (!validOrigin(req)) return error(res, 403, 'INVALID_INPUT');
  const body = await readBody(req, JSON_LIMIT);
  let credentials;
  try {
    credentials = JSON.parse(body.toString('utf8'));
  } catch {
    return error(res, 400, 'INVALID_INPUT');
  }
  if (
    typeof credentials?.email !== 'string' ||
    typeof credentials?.password !== 'string'
  )
    return error(res, 400, 'INVALID_INPUT');
  const upstream = await authRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok || !payload?.access_token || !payload?.refresh_token)
    return error(
      res,
      upstream.status === 429 ? 429 : upstream.status >= 500 ? 503 : 401,
      upstream.status === 429
        ? 'RATE_LIMITED'
        : upstream.status >= 500
          ? 'AUTHORIZATION_UNAVAILABLE'
          : 'UNAUTHORIZED',
    );
  const csrf = crypto.randomUUID();
  return sendJson(
    res,
    200,
    { data: { authenticated: true }, request_id: crypto.randomUUID() },
    {
      'Set-Cookie': [
        cookie(ACCESS, payload.access_token, { httpOnly: true }),
        cookie(REFRESH, payload.refresh_token, {
          httpOnly: true,
          maxAge: 2_592_000,
        }),
        cookie(CSRF, csrf, { maxAge: 2_592_000 }),
      ],
    },
  );
}

async function refresh(req, res, cookies) {
  if (!validOrigin(req) || !validCsrf(req, cookies))
    return error(res, 403, 'INVALID_INPUT');
  if (!cookies[REFRESH]) return error(res, 401, 'UNAUTHORIZED');
  const upstream = await authRequest(
    '/auth/v1/token?grant_type=refresh_token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: cookies[REFRESH] }),
    },
  );
  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok || !payload?.access_token || !payload?.refresh_token) {
    const definitive = upstream.status === 400 || upstream.status === 401;
    return error(
      res,
      definitive ? 401 : upstream.status === 429 ? 429 : 503,
      definitive
        ? 'UNAUTHORIZED'
        : upstream.status === 429
          ? 'RATE_LIMITED'
          : 'AUTHORIZATION_UNAVAILABLE',
      definitive ? { 'Set-Cookie': clearSessionCookies() } : {},
    );
  }
  return sendJson(
    res,
    200,
    { data: { authenticated: true }, request_id: crypto.randomUUID() },
    {
      'Set-Cookie': [
        cookie(ACCESS, payload.access_token, { httpOnly: true }),
        cookie(REFRESH, payload.refresh_token, {
          httpOnly: true,
          maxAge: 2_592_000,
        }),
      ],
    },
  );
}

async function logout(req, res, cookies) {
  if (!validOrigin(req) || !validCsrf(req, cookies))
    return error(res, 403, 'INVALID_INPUT');
  if (cookies[ACCESS]) {
    await authRequest('/auth/v1/logout?scope=local', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cookies[ACCESS]}` },
    }).catch(() => undefined);
  }
  return sendJson(
    res,
    200,
    { data: { authenticated: false }, request_id: crypto.randomUUID() },
    { 'Set-Cookie': clearSessionCookies() },
  );
}

function publicOperation(method, pathname) {
  return (
    method === 'GET' &&
    (pathname === '/v1/plans' || pathname === '/v1/subscription/products')
  );
}

async function upstreamFetch(url, init, canRetry) {
  const deadline = Date.now() + timeoutMs;
  const attempts = canRetry ? 3 : 1;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(remaining),
      });
      if (
        ![502, 503, 504].includes(response.status) ||
        attempt === attempts - 1
      )
        return response;
    } catch (caught) {
      lastError = caught;
      if (attempt === attempts - 1) throw caught;
    }
  }
  throw lastError ?? new Error('UPSTREAM_TIMEOUT');
}

async function proxy(req, res, requestUrl, cookies) {
  const upstreamPath = requestUrl.pathname.slice('/api'.length);
  if (!operationFor(req.method, upstreamPath))
    return error(res, 404, 'NOT_FOUND');
  if (!publicOperation(req.method, upstreamPath) && !cookies[ACCESS])
    return error(res, 401, 'UNAUTHORIZED');
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET');
  if (mutation && (!validOrigin(req) || !validCsrf(req, cookies)))
    return error(res, 403, 'INVALID_INPUT');

  const contentType = req.headers['content-type'] ?? '';
  const binary = contentType
    .toLowerCase()
    .startsWith('application/octet-stream');
  const body = mutation
    ? await readBody(req, binary ? BINARY_LIMIT : JSON_LIMIT)
    : undefined;
  const upstream = await upstreamFetch(
    `${accountApiUrl}${upstreamPath}${requestUrl.search}`,
    {
      method: req.method,
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-store',
        'X-Platform-Key': platformKey,
        ...(cookies[ACCESS]
          ? { Authorization: `Bearer ${cookies[ACCESS]}` }
          : {}),
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(req.headers['idempotency-key']
          ? { 'Idempotency-Key': req.headers['idempotency-key'] }
          : {}),
        ...(req.headers['if-match']
          ? { 'If-Match': req.headers['if-match'] }
          : {}),
      },
      body: mutation ? body : undefined,
    },
    req.method === 'GET',
  );
  const buffer = Buffer.from(await upstream.arrayBuffer());
  const headers = responseHeaders({
    'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    ...(upstream.headers.get('x-request-id')
      ? { 'X-Request-Id': upstream.headers.get('x-request-id') }
      : {}),
    ...(upstream.headers.get('etag')
      ? { ETag: upstream.headers.get('etag') }
      : {}),
    ...(upstream.headers.get('content-disposition')
      ? { 'Content-Disposition': upstream.headers.get('content-disposition') }
      : {}),
    ...(upstream.headers.get('x-content-type-options')
      ? {
          'X-Content-Type-Options': upstream.headers.get(
            'x-content-type-options',
          ),
        }
      : {}),
  });
  res.writeHead(upstream.status, headers);
  res.end(buffer);
}

async function protectedFeature(res, cookies) {
  if (!cookies[ACCESS]) return error(res, 401, 'UNAUTHORIZED');
  try {
    const upstream = await upstreamFetch(
      `${accountApiUrl}/v1/subscription`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          'X-Platform-Key': platformKey,
          Authorization: `Bearer ${cookies[ACCESS]}`,
        },
      },
      true,
    );
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !payload?.data)
      return error(res, 503, 'AUTHORIZATION_UNAVAILABLE');
    if (payload.data.effective_status !== 'active')
      return error(
        res,
        403,
        payload.data.effective_status === 'suspended'
          ? 'ACCOUNT_SUSPENDED'
          : 'ENTITLEMENT_REQUIRED',
      );
    if (payload.data.features?.advanced_config !== true)
      return error(res, 403, 'ENTITLEMENT_REQUIRED');
    return sendJson(res, 200, {
      data: { authorized: true },
      request_id: payload.request_id ?? crypto.randomUUID(),
    });
  } catch {
    return error(res, 503, 'AUTHORIZATION_UNAVAILABLE');
  }
}

function staticFile(res, name, contentType) {
  const body = fs.readFileSync(path.join(publicRoot, name));
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? '/', origin.origin);
    const cookies = parseCookies(req.headers.cookie);
    if (req.method === 'GET' && requestUrl.pathname === '/') {
      const csrf = cookies[CSRF] || crypto.randomUUID();
      res.setHeader('Set-Cookie', cookie(CSRF, csrf, { maxAge: 2_592_000 }));
      return staticFile(res, 'index.html', 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && requestUrl.pathname === '/app.js')
      return staticFile(res, 'app.js', 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && requestUrl.pathname === '/api/meta')
      return sendJson(res, 200, {
        data: contractSummary(),
        request_id: crypto.randomUUID(),
      });
    if (req.method === 'POST' && requestUrl.pathname === '/api/auth/login')
      return await login(req, res);
    if (req.method === 'POST' && requestUrl.pathname === '/api/auth/refresh')
      return await refresh(req, res, cookies);
    if (req.method === 'POST' && requestUrl.pathname === '/api/auth/logout')
      return await logout(req, res, cookies);
    if (
      req.method === 'GET' &&
      requestUrl.pathname === '/api/protected/advanced-config'
    )
      return await protectedFeature(res, cookies);
    if (requestUrl.pathname.startsWith('/api/v1/'))
      return await proxy(req, res, requestUrl, cookies);
    return error(res, 404, 'NOT_FOUND');
  } catch (caught) {
    if (caught?.status === 413) return error(res, 413, 'INVALID_INPUT');
    return error(res, 503, 'AUTHORIZATION_UNAVAILABLE');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Consumer Conformance Harness listening on ${origin.origin}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
