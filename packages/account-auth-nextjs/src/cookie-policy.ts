export type AuthScope = 'consumer' | 'admin';

export function authCookieNames(prefix: AuthScope = 'consumer') {
  return prefix === 'admin'
    ? {
        access: 'aisenhub-admin-session',
        refresh: 'aisenhub-admin-refresh-token',
        csrf: 'aisenhub-admin-csrf',
        recentProof: 'aisenhub-admin-recent-auth-proof',
        logoutFence: 'aisenhub-admin-logout-fence',
        loginAck: 'aisenhub-admin-login-ack',
        authFlow: 'aisenhub-admin-auth-flow',
      }
    : {
        access: 'aisenhub-session',
        refresh: 'aisenhub-refresh-token',
        csrf: 'aisenhub-consumer-csrf',
        recentProof: 'aisenhub-consumer-recent-auth-proof',
        logoutFence: 'aisenhub-consumer-logout-fence',
        loginAck: 'aisenhub-consumer-login-ack',
        authFlow: 'aisenhub-consumer-auth-flow',
      };
}
