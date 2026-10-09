# Consumer Conformance Harness

This directory is a Local/test-only external Consumer boundary probe. It is intentionally **not** a Next.js app, production starter, workspace package, SDK, or deployment target.

The server uses only Node built-ins and standard HTTP/fetch. It reads the canonical Account OpenAPI, keeps Platform Key and user tokens server-side/HttpOnly, enforces same-origin CSRF on mutations, and proxies only an explicit subset of `/v1` operations validated against the canonical contract.

Required Local/test environment names: `HARNESS_ORIGIN`, `HARNESS_PORT`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ACCOUNT_API_URL`, `ACCOUNT_PLATFORM_KEY`; optional `ACCOUNT_API_TIMEOUT_MS`.

Run the static boundary check with `pnpm test:consumer-harness`. Real Local Auth/API/Storage behavior is exercised by the R3 Consumer Harness E2E after Phase 04 migrates the existing T16 fixture.
