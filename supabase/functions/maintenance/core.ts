/// <reference lib="deno.ns" />

import postgres from 'npm:postgres@3.4.3';
import {
  createSupabaseStorageAdapter,
  type StorageAdapter,
} from '../_shared/storage.ts';
import { readBoundedBody } from '../_shared/upload.ts';

export type Row = Record<string, unknown>;

export interface Transaction {
  unsafe<T extends Row = Row>(query: string, values?: unknown[]): Promise<T[]>;
  json(value: unknown): unknown;
}

export interface Database {
  begin<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
}

export interface MaintenanceDependencies {
  readonly database?: Database;
  readonly storageAdapter?: StorageAdapter;
  readonly authAdapter?: AuthAdminAdapter;
  readonly jobToken?: string;
  readonly workerId?: string;
  readonly billingProviderAdapter?: BillingProviderAdapter;
  readonly backgroundProcessingEnabled?: boolean;
  readonly automaticSettlementEnabled?: boolean;
  readonly billingAlertReceiver?: BillingAlertReceiver;
  readonly billingAlertThresholds?: Readonly<Record<string, number>>;
}

export interface AuthAdminAdapter {
  deleteUser(userId: string): Promise<void>;
}

export interface BillingProviderAdapter {
  queryOrder(providerOrderNo: string): Promise<{
    readonly status: 'found' | 'not_found' | 'temporarily_unavailable';
    readonly order?: unknown;
    readonly facts?: Record<string, unknown>;
  }>;
  listOrders?(page: number): Promise<{
    readonly status: 'found' | 'temporarily_unavailable';
    readonly orders?: readonly unknown[];
    readonly totalPage?: number;
  }>;
}

export interface BillingAlertReceiver {
  deliver(alert: Row): Promise<void>;
}

const BILLING_ALERT_THRESHOLD_KEYS = new Set([
  'pending_age_seconds',
  'processing_age_seconds',
  'discovery_stale_seconds',
  'processing_stale_seconds',
  'expired_lease_count',
  'manual_review_count',
  'duplicate_payment_count',
  'retry_budget_exhausted_count',
  'refund_mismatch_count',
  'scheduler_failure_count',
]);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const databases = new Map<string, Database>();

export function requestId(): string {
  return crypto.randomUUID();
}

export function database(): Database {
  const cached = databases.get('job');
  if (cached) return cached;
  const url =
    Deno.env.get('MAINTENANCE_DB_URL') ??
    Deno.env.get('SUPABASE_DB_URL') ??
    Deno.env.get('ACCOUNT_API_DB_URL');
  if (!url) throw new Error('MAINTENANCE_NOT_CONFIGURED');
  const connection = postgres(url, {
    max: 4,
    prepare: false,
    connect_timeout: 5,
  }) as unknown as Database;
  databases.set('job', connection);
  return connection;
}

export function storageAdapter(): StorageAdapter {
  return createSupabaseStorageAdapter();
}

export function authAdminAdapter(): AuthAdminAdapter {
  const baseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/u, '');
  const secret = Deno.env.get('SUPABASE_SECRET_KEY');
  if (!baseUrl || !secret) throw new Error('AUTH_NOT_CONFIGURED');
  return {
    async deleteUser(userId) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(
          `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
          {
            method: 'DELETE',
            headers: {
              apikey: secret,
              Authorization: `Bearer ${secret}`,
            },
            signal: controller.signal,
          },
        );
      } catch {
        throw new Error('PROVIDER_TIMEOUT');
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        await response.text();
        throw new Error(`AUTH_DELETE_FAILED_${response.status}`);
      }
    },
  };
}

export function billingAlertReceiver(): BillingAlertReceiver | undefined {
  const target = Deno.env.get('BILLING_ALERT_WEBHOOK_URL')?.trim();
  if (!target) return undefined;
  return {
    async deliver(alert) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const delivered = await fetch(target, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ event: 'billing.alert', alert }),
          signal: controller.signal,
        });
        if (!delivered.ok)
          throw new Error(`ALERT_RECEIVER_HTTP_${delivered.status}`);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError')
          throw new Error('ALERT_RECEIVER_TIMEOUT');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function bearer(request: Request): string | null {
  const value = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/u.exec(value);
  return match?.[1] ?? null;
}

export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const { bytes } = await readBoundedBody(request, 4096);
  const text = new TextDecoder().decode(bytes);
  let value: unknown;
  try {
    value = JSON.parse(text || '{}');
  } catch {
    throw new Error('INVALID_INPUT');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_INPUT');
  return value as Record<string, unknown>;
}

export function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

export function context(workerId: string, id: string, fencingToken = 1) {
  return [crypto.randomUUID(), workerId, fencingToken, id];
}

export function billingContext(
  workerId: string,
  requestId: string,
  jobId: string,
  fencingToken: number,
) {
  return [jobId, workerId, fencingToken, requestId];
}

export async function withJobRole<T>(
  db: Database,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return db.begin(async (transaction) => {
    await transaction.unsafe('set local role job_executor');
    return callback(transaction);
  });
}

export function errorCode(error: unknown): string {
  const code =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null
        ? 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'code' in error && typeof error.code === 'string'
            ? error.code
            : 'provider_error'
        : 'provider_error';
  return /^[a-z0-9_.-]{1,128}$/iu.test(code) ? code : 'provider_error';
}

export function response(status: number, data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function alertThresholds(value: unknown): Record<string, number> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_INPUT');
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const numeric = typeof raw === 'number' ? raw : Number.NaN;
    if (
      !BILLING_ALERT_THRESHOLD_KEYS.has(key) ||
      !Number.isFinite(numeric) ||
      numeric <= 0
    )
      throw new Error('INVALID_INPUT');
    result[key] = numeric;
  }
  return result;
}
