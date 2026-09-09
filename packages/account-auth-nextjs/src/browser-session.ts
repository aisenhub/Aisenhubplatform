import type {
  ReplayPolicy,
  SessionSnapshot,
  SessionState,
  SessionStepUp,
} from '@kit/account-auth';
import { authCookieNames } from './cookie-policy.ts';

export type AuthScope = 'consumer' | 'admin';

export interface BrowserAuthConfig {
  readonly scope: AuthScope;
  readonly loginUrl: string;
  readonly refreshUrl: string;
  readonly logoutUrl: string;
}

export interface SessionRequestOptions {
  readonly replay?: ReplayPolicy;
}

export class SessionRetryRequiredError extends Error {
  readonly reason = 'SESSION_RETRY_REQUIRED' as const;
  constructor() {
    super('The session was recovered; please submit the operation again.');
    this.name = 'SessionRetryRequiredError';
  }
}

export class SessionExpiredError extends Error {
  readonly reason = 'SESSION_EXPIRED' as const;
  constructor() {
    super('The session has expired.');
    this.name = 'SessionExpiredError';
  }
}

export class AuthorizationUnavailableError extends Error {
  readonly reason = 'AUTHORIZATION_UNAVAILABLE' as const;
  constructor() {
    super('Authorization is temporarily unavailable.');
    this.name = 'AuthorizationUnavailableError';
  }
}

export class SessionReplayPolicyError extends Error {
  readonly reason = 'REPLAY_NOT_SAFE' as const;
  constructor() {
    super('The request body cannot be replayed safely.');
    this.name = 'SessionReplayPolicyError';
  }
}

type Listener = (snapshot: SessionSnapshot) => void;

const DEFAULT_SNAPSHOT: SessionSnapshot = {
  state: 'unauthenticated',
  resolved: false,
  stepUp: null,
};

function stateForScope(scope: AuthScope): SessionStepUp {
  return scope === 'admin' ? 'admin_mfa' : 'consumer_recent_auth';
}

function isMutation(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function defaultReplay(method: string): ReplayPolicy {
  return isMutation(method) ? 'never' : 'safe-read';
}

function isAuthPath(pathname: string): boolean {
  return /^\/api\/auth\/(?:login|refresh|logout|mfa|reauth|forgot-password|password|signup|callback)/u.test(pathname);
}

function readCookie(name: string): string | null {
  const browserDocument = (globalThis as unknown as { document?: { cookie: string } }).document;
  if (!browserDocument) return null;
  const entry = browserDocument.cookie
    .split('; ')
    .find((candidate) => candidate.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function csrfHeaders(headers: Headers, scope: AuthScope): void {
  const token = readCookie(authCookieNames(scope).csrf);
  if (token) headers.set('X-CSRF-Token', token);
}

type ReplayableBody = string | URLSearchParams | FormData;
type BrowserBody = ReplayableBody | Blob | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array> | null | undefined;

function bodyCanBeReplayed(body: BrowserBody): boolean {
  if (body === null || body === undefined) return true;
  return typeof body === 'string' || body instanceof URLSearchParams || body instanceof FormData;
}

function isBinaryRequest(request: Request, body: BrowserBody): boolean {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  return (
    contentType.startsWith('application/octet-stream') ||
    contentType.startsWith('multipart/form-data') ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
  );
}

function sameSnapshot(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return a.state === b.state && a.resolved === b.resolved && a.stepUp === b.stepUp;
}

async function responseErrorCode(response: Response): Promise<string | null> {
  if (response.status !== 403) return null;
  try {
    const payload = (await response.clone().json()) as {
      error?: { code?: unknown };
    };
    return typeof payload.error?.code === 'string' ? payload.error.code : null;
  } catch {
    return null;
  }
}

export class AuthSessionManager {
  private snapshot: SessionSnapshot = DEFAULT_SNAPSHOT;
  private readonly listeners = new Set<Listener>();
  private refreshPromise: Promise<boolean> | null = null;
  private epoch = 0;
  private destroyed = false;
  private logoutPending = false;

  constructor(private readonly config: BrowserAuthConfig) {}

  getSessionState(): SessionSnapshot {
    return this.snapshot;
  }

  getEpoch(): number {
    return this.epoch;
  }

  isCurrentEpoch(epoch: number): boolean {
    return !this.destroyed && epoch === this.epoch;
  }

  subscribe(listener: Listener): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private transition(next: SessionState, resolved: boolean, stepUp = this.snapshot.stepUp): void {
    const nextSnapshot: SessionSnapshot = { state: next, resolved, stepUp };
    if (sameSnapshot(this.snapshot, nextSnapshot)) return;
    this.snapshot = nextSnapshot;
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private requestUrl(input: string | URL | Request): URL {
    const browserWindow = (globalThis as unknown as { window?: { location: { origin: string } } }).window;
    if (!browserWindow) throw new Error('BROWSER_SESSION_REQUIRES_WINDOW');
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, browserWindow.location.origin);
    if (url.origin !== browserWindow.location.origin) throw new SessionReplayPolicyError();
    return url;
  }

  private prepareRequest(input: string | URL | Request, init?: RequestInit): { request: Request; replay: ReplayPolicy; body: BrowserBody; clone: Request | null } {
    const url = this.requestUrl(input);
    const body = init?.body;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const replay = defaultReplay(method);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (isMutation(method)) csrfHeaders(headers, this.config.scope);
    const request = new Request(url, { ...init, headers, method });
    let clone: Request | null = null;
    try {
      clone = request.clone();
    } catch {
      clone = null;
    }
    return { request, replay, body, clone };
  }

  async login(init?: RequestInit): Promise<Response> {
    this.epoch += 1;
    this.transition('authenticating', true, this.snapshot.stepUp);
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
    try {
      const response = await fetch(this.requestUrl(this.config.loginUrl), { ...init, method: 'POST', headers });
      if (response.ok) this.transition('authenticated', true, this.snapshot.stepUp);
      return response;
    } catch (error) {
      this.transition('unauthenticated', true, this.snapshot.stepUp);
      throw error;
    }
  }

  async refresh(): Promise<Response> {
    if (this.destroyed) throw new SessionExpiredError();
    if (this.refreshPromise) {
      await this.refreshPromise;
      return new Response(null, { status: 204 });
    }
    const prior = this.snapshot;
    const generation = this.epoch;
    this.transition('refreshing', true, prior.stepUp);
    const operation: Promise<boolean> = (async () => {
      try {
        const headers = new Headers({ Accept: 'application/json' });
        csrfHeaders(headers, this.config.scope);
        const response = await fetch(this.config.refreshUrl, { method: 'POST', headers, cache: 'no-store' });
        if (this.destroyed || generation !== this.epoch) return false;
        if (response.ok) {
          this.transition(prior.state === 'mfa_required' ? 'mfa_required' : 'authenticated', true, prior.stepUp);
          return true;
        }
        if (response.status === 401) {
          this.epoch += 1;
          this.transition('expired', true, prior.stepUp);
          throw new SessionExpiredError();
        }
        this.transition(prior.state, prior.resolved, prior.stepUp);
        throw new AuthorizationUnavailableError();
      } catch (error) {
        if (error instanceof SessionExpiredError || error instanceof AuthorizationUnavailableError) throw error;
        if (!this.destroyed && generation === this.epoch) this.transition(prior.state, prior.resolved, prior.stepUp);
        throw new AuthorizationUnavailableError();
      }
    })();
    this.refreshPromise = operation;
    try {
      await this.refreshPromise;
      return new Response(null, { status: 204 });
    } finally {
      if (this.refreshPromise === operation) this.refreshPromise = null;
    }
  }

  async logout(init?: RequestInit): Promise<Response> {
    if (this.destroyed) throw new SessionExpiredError();
    this.logoutPending = true;
    this.epoch += 1;
    try {
      const headers = new Headers(init?.headers);
      csrfHeaders(headers, this.config.scope);
      const response = await fetch(this.requestUrl(this.config.logoutUrl), { ...init, method: 'POST', headers, cache: 'no-store' });
      if (response.ok) {
        this.epoch += 1;
        this.transition('unauthenticated', true, null);
      }
      return response;
    } finally {
      this.logoutPending = false;
    }
  }

  async request(input: string | URL | Request, init?: RequestInit, options?: SessionRequestOptions): Promise<Response> {
    if (this.destroyed || this.logoutPending) throw new SessionExpiredError();
    const prepared = this.prepareRequest(input, init);
    const url = this.requestUrl(input);
    const replay = options?.replay ?? (isAuthPath(url.pathname) ? 'never' : prepared.replay);
    if (replay === 'idempotent-mutation') {
      if (!isMutation(prepared.request.method) || isAuthPath(url.pathname) || !prepared.request.headers.has('Idempotency-Key') || !bodyCanBeReplayed(prepared.body) || isBinaryRequest(prepared.request, prepared.body) || !prepared.clone) throw new SessionReplayPolicyError();
    }
    const generation = this.epoch;
    const first = await fetch(prepared.request);
    const firstErrorCode = await responseErrorCode(first);
    if (firstErrorCode === 'MFA_REQUIRED') this.markStepUpRequired('admin_mfa');
    if (firstErrorCode === 'RECENT_MFA_REQUIRED') this.markStepUpRequired('admin_recent_mfa');
    if (first.status !== 401 || isAuthPath(url.pathname)) return first;
    if (!this.isCurrentEpoch(generation)) throw new SessionExpiredError();
    await this.refresh();
    if (replay === 'never') throw new SessionRetryRequiredError();
    if (!prepared.clone) throw new SessionReplayPolicyError();
    const replayResponse = await fetch(prepared.clone);
    if (replayResponse.status === 401) throw new SessionExpiredError();
    const replayErrorCode = await responseErrorCode(replayResponse);
    if (replayErrorCode === 'MFA_REQUIRED') this.markStepUpRequired('admin_mfa');
    if (replayErrorCode === 'RECENT_MFA_REQUIRED') this.markStepUpRequired('admin_recent_mfa');
    return replayResponse;
  }

  markStepUpRequired(kind: SessionStepUp): void {
    this.epoch += 1;
    this.transition('mfa_required', true, kind);
  }

  completeAuthentication(kind?: SessionStepUp): void {
    const stepUp = kind && this.snapshot.stepUp === kind ? null : this.snapshot.stepUp;
    this.epoch += 1;
    this.transition('authenticated', true, stepUp);
  }

  getDefaultStepUp(): SessionStepUp {
    return stateForScope(this.config.scope);
  }

  destroy(): void {
    this.destroyed = true;
    this.epoch += 1;
    this.refreshPromise = null;
    this.listeners.clear();
  }
}

export function createAuthSessionManager(config: BrowserAuthConfig): AuthSessionManager {
  return new AuthSessionManager(config);
}
