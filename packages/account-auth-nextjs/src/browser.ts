import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BrowserSupabaseAuthConfig {
  readonly url: string;
  readonly publishableKey: string;
  readonly cookieName?: string;
}

/**
 * Browser-only Supabase client factory. Server cookies and request-scoped
 * refresh helpers are intentionally exposed from the `/server` entrypoint.
 */
export function createBrowserSupabaseClient(
  config: BrowserSupabaseAuthConfig,
): SupabaseClient {
  return createBrowserClient(config.url, config.publishableKey, {
    ...(config.cookieName
      ? { cookieOptions: { name: config.cookieName } }
      : {}),
  });
}
