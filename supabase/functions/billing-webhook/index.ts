/// <reference lib="deno.ns" />

import {
  billingSwitchEnabled,
  sha256Bytes,
  constantTimeEqual,
} from '../_shared/billing.ts';
import { readBoundedBody, UploadFault } from '../_shared/upload.ts';

type Row = Record<string, unknown>;

interface Transaction {
  unsafe<T extends Row = Row>(query: string, values?: unknown[]): Promise<T[]>;
}

interface Database {
  begin<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
}

interface BillingWebhookDependencies {
  readonly database?: Database;
  readonly providerAccountId?: string;
  readonly webhookIngressEnabled?: boolean;
  readonly verifySignature?: (
    body: Uint8Array,
    request: Request,
  ) => Promise<boolean>;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requestId(): string {
  return crypto.randomUUID();
}

function response(status: number, body: unknown, id: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Request-Id': id,
    },
  });
}

function value(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function errorCode(error: unknown): string {
  if (error instanceof UploadFault) return error.code;
  if (error instanceof Error && /^[A-Z0-9_.-]{1,80}$/u.test(error.message))
    return error.message;
  return 'WEBHOOK_UNAVAILABLE';
}

async function defaultVerifySignature(
  bytes: Uint8Array,
  request: Request,
): Promise<boolean> {
  const secret = Deno.env.get('BILLING_WEBHOOK_SECRET');
  const presented = request.headers.get('x-provider-signature');
  if (!secret || !presented) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, copy));
  const expected = [...mac]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return constantTimeEqual(expected, presented.trim().toLowerCase());
}

async function parseBody(request: Request): Promise<{
  readonly bytes: Uint8Array;
  readonly payload: Record<string, unknown>;
}> {
  const contentType = request.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim();
  if (contentType !== 'application/json') throw new Error('INVALID_INPUT');
  const { bytes } = await readBoundedBody(request, 65536);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('INVALID_INPUT');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('INVALID_INPUT');
  return { bytes, payload: parsed as Record<string, unknown> };
}

export async function handleBillingWebhookRequest(
  request: Request,
  dependencies: BillingWebhookDependencies = {},
): Promise<Response> {
  const id = requestId();
  if (request.method !== 'POST')
    return response(
      405,
      { error: { code: 'METHOD_NOT_ALLOWED' }, request_id: id },
      id,
    );
  const path = new URL(request.url).pathname;
  if (!path.endsWith('/webhooks/afdian'))
    return response(404, { error: { code: 'NOT_FOUND' }, request_id: id }, id);
  try {
    if (
      !(
        dependencies.webhookIngressEnabled ??
        billingSwitchEnabled('BILLING_WEBHOOK_INGRESS_ENABLED')
      )
    )
      throw new Error('WEBHOOK_INGRESS_DISABLED');
    const providerAccountId =
      dependencies.providerAccountId ??
      Deno.env.get('BILLING_PROVIDER_ACCOUNT_ID');
    if (!providerAccountId || !UUID.test(providerAccountId))
      throw new Error('WEBHOOK_NOT_CONFIGURED');
    const eventKey = value(request.headers.get('x-provider-event-id'));
    if (!eventKey || eventKey.length > 255) throw new Error('INVALID_INPUT');
    const { bytes, payload } = await parseBody(request);
    const orderNo =
      value(request.headers.get('x-provider-order-no')) ??
      value(payload.provider_order_no) ??
      value(payload.order_no);
    const signature = request.headers.get('x-provider-signature');
    if (!signature) throw new Error('SIGNATURE_REQUIRED');
    const verified = await (
      dependencies.verifySignature ?? defaultVerifySignature
    )(bytes, request);
    if (!verified) throw new Error('SIGNATURE_INVALID');
    const payloadHash = await sha256Bytes(bytes);
    const db = dependencies.database;
    if (!db) throw new Error('WEBHOOK_NOT_CONFIGURED');
    const [ingest] = await db.begin(async (transaction) => {
      await transaction.unsafe('set local role billing_ingress');
      return transaction.unsafe<Row>(
        'select * from private.billing_webhook_ingest($1::uuid, $2::text, $3::bytea, $4::text, $5::text)',
        [providerAccountId, eventKey, payloadHash, 'verified', orderNo],
      );
    });
    if (!ingest) throw new Error('WEBHOOK_UNAVAILABLE');
    return response(
      200,
      {
        data: {
          event_id: ingest.event_id,
          job_id: ingest.job_id,
          duplicate: ingest.duplicate === true,
          processing_status: ingest.processing_status,
        },
        request_id: id,
      },
      id,
    );
  } catch (error) {
    const code = errorCode(error);
    const status =
      error instanceof UploadFault
        ? error.status
        : code === 'SIGNATURE_REQUIRED' || code === 'SIGNATURE_INVALID'
          ? 401
          : code === 'INVALID_INPUT'
            ? 400
            : code === 'WEBHOOK_NOT_CONFIGURED'
              ? 503
              : 503;
    return response(status, { error: { code }, request_id: id }, id);
  }
}

if (import.meta.main) {
  Deno.serve((request) => handleBillingWebhookRequest(request));
}
