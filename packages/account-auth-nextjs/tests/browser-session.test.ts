import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthSessionManager,
  AuthorizationUnavailableError,
  SessionExpiredError,
  SessionReplayPolicyError,
  SessionRetryRequiredError,
} from '../src/browser-session.ts';

const config = {
  scope: 'consumer' as const,
  loginUrl: '/api/auth/login',
  refreshUrl: '/api/auth/refresh',
  logoutUrl: '/api/auth/logout',
};

afterEach(() => {
  FakeBroadcastChannel.channels.clear();
  FakeBroadcastChannel.messages.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function installBrowser(cookie = 'aisenhub-consumer-csrf=csrf-token') {
  vi.stubGlobal('window', { location: { origin: 'https://app.test' } });
  vi.stubGlobal('document', { cookie });
}

class FakeBroadcastChannel {
  static readonly channels = new Set<FakeBroadcastChannel>();
  static readonly messages: unknown[] = [];
  readonly name: string;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.channels.add(this);
  }

  postMessage(data: unknown): void {
    FakeBroadcastChannel.messages.push(data);
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel !== this && channel.name === this.name)
        channel.onmessage?.({ data } as MessageEvent<unknown>);
    }
  }

  close(): void {
    FakeBroadcastChannel.channels.delete(this);
  }
}

describe('AuthSessionManager', () => {
  it('does not touch browser globals during construction', () => {
    const manager = new AuthSessionManager(config);
    expect(manager.getSessionState()).toEqual({
      state: 'unauthenticated',
      resolved: false,
      stepUp: null,
    });
  });

  it('coalesces concurrent refreshes and safely replays reads once', async () => {
    installBrowser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('one', { status: 200 }))
      .mockResolvedValueOnce(new Response('two', { status: 200 }))
      .mockResolvedValueOnce(new Response('three', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const manager = new AuthSessionManager(config);

    const responses = await Promise.all([
      manager.request('/api/v1/account'),
      manager.request('/api/v1/subscription'),
      manager.request('/api/v1/files'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(
      fetcher.mock.calls.filter(([input]) =>
        String(input).endsWith('/api/auth/refresh'),
      ),
    ).toHaveLength(1);
    expect(manager.getSessionState().state).toBe('authenticated');
  });

  it('never replays mutations and asks the UI to resubmit after recovery', async () => {
    installBrowser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const manager = new AuthSessionManager(config);

    await expect(
      manager.request('/api/v1/account', {
        method: 'POST',
        body: JSON.stringify({ display_name: 'Ada' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    ).rejects.toBeInstanceOf(SessionRetryRequiredError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not promote an If-Match mutation into an automatic replay', async () => {
    installBrowser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const manager = new AuthSessionManager(config);

    await expect(
      manager.request('/api/v1/account', {
        method: 'PATCH',
        headers: { 'If-Match': 'etag-1' },
        body: JSON.stringify({ display_name: 'Ada' }),
      }),
    ).rejects.toBeInstanceOf(SessionRetryRequiredError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('allows only explicitly keyed, repeatable idempotent mutations to replay', async () => {
    installBrowser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    const manager = new AuthSessionManager(config);
    const response = await manager.request(
      '/api/v1/account',
      {
        method: 'POST',
        body: 'display_name=Ada',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': 'request-1',
        },
      },
      { replay: 'idempotent-mutation' },
    );
    expect(response.status).toBe(201);
    expect(fetcher).toHaveBeenCalledTimes(3);

    await expect(
      manager.request(
        '/api/v1/account',
        { method: 'POST', body: new Blob(['binary']) },
        { replay: 'idempotent-mutation' },
      ),
    ).rejects.toBeInstanceOf(SessionReplayPolicyError);
  });

  it('maps MFA authorization responses to an explicit step-up state', async () => {
    installBrowser('aisenhub-admin-csrf=admin-csrf');
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'RECENT_MFA_REQUIRED' } }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    );
    const manager = new AuthSessionManager({ ...config, scope: 'admin' });
    await manager.request('/api/v1/admin/subscriptions');
    expect(manager.getSessionState()).toMatchObject({
      state: 'mfa_required',
      stepUp: 'admin_recent_mfa',
    });
    expect(fetch).toHaveBeenCalledWith(expect.any(Request));
    const request = vi.mocked(fetch).mock.calls[0]?.[0] as Request;
    expect(request.headers.get('X-CSRF-Token')).toBeNull();
  });

  it('enters expired state on definitive refresh failure and preserves state on outage', async () => {
    installBrowser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    const expired = new AuthSessionManager(config);
    await expect(expired.refresh()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(expired.getSessionState()).toMatchObject({
      state: 'expired',
      resolved: true,
    });

    const outageFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', outageFetcher);
    const unavailable = new AuthSessionManager(config);
    await expect(unavailable.refresh()).rejects.toBeInstanceOf(
      AuthorizationUnavailableError,
    );
    expect(unavailable.getSessionState()).toEqual({
      state: 'unauthenticated',
      resolved: false,
      stepUp: null,
    });
  });

  it('allows a new refresh after the prior single-flight operation settles', async () => {
    installBrowser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const manager = new AuthSessionManager(config);

    await manager.refresh();
    await manager.refresh();

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses versioned, scoped terminal hints without echoing to the sender', async () => {
    installBrowser();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 200 })),
    );
    const consumerA = new AuthSessionManager(config);
    const consumerB = new AuthSessionManager(config);
    const admin = new AuthSessionManager({ ...config, scope: 'admin' });
    const consumerAStates: string[] = [];
    const consumerBStates: string[] = [];
    const adminStates: string[] = [];
    consumerA.subscribe((snapshot) => consumerAStates.push(snapshot.state));
    consumerB.subscribe((snapshot) => consumerBStates.push(snapshot.state));
    admin.subscribe((snapshot) => adminStates.push(snapshot.state));
    consumerA.completeAuthentication();
    consumerB.completeAuthentication();
    admin.completeAuthentication();

    await consumerA.logout();

    expect(consumerAStates).toEqual([
      'unauthenticated',
      'authenticated',
      'unauthenticated',
    ]);
    expect(consumerBStates).toEqual([
      'unauthenticated',
      'authenticated',
      'unauthenticated',
    ]);
    expect(adminStates).toEqual(['unauthenticated', 'authenticated']);
    expect(FakeBroadcastChannel.channels.size).toBe(3);
    expect(FakeBroadcastChannel.messages[0]).toMatchObject({
      version: 1,
      scope: 'consumer',
      type: 'logged_out',
    });
    expect(
      typeof (FakeBroadcastChannel.messages[0] as { sourceId?: unknown })
        .sourceId,
    ).toBe('string');
  });
});
