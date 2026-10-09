import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const syntheticPlatformKey = 'harness-smoke-platform-key-do-not-expose';
const child = spawn(process.execPath, ['tests/consumer-harness/server.mjs'], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    HARNESS_ORIGIN: origin,
    HARNESS_PORT: String(port),
    SUPABASE_URL: 'http://127.0.0.1:9',
    SUPABASE_PUBLISHABLE_KEY: 'harness-smoke-publishable',
    ACCOUNT_API_URL: 'http://127.0.0.1:9',
    ACCOUNT_PLATFORM_KEY: syntheticPlatformKey,
    ACCOUNT_API_TIMEOUT_MS: '100',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

async function waitForReady() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(500),
      });
      if (response.status === 200) return response;
    } catch {
      // The child may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Harness did not become ready: ${stderr}`);
}

try {
  const home = await waitForReady();
  const html = await home.text();
  assert.match(html, /Consumer Conformance Harness/u);
  assert.doesNotMatch(html, new RegExp(syntheticPlatformKey, 'u'));
  const setCookie = home.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /aisenhub-harness-csrf=/u);
  assert.doesNotMatch(
    setCookie,
    /HttpOnly/iu,
    'CSRF cookie must remain browser-readable',
  );

  const script = await fetch(`${origin}/app.js`);
  assert.equal(script.status, 200);
  assert.doesNotMatch(
    await script.text(),
    new RegExp(syntheticPlatformKey, 'u'),
  );

  const meta = await fetch(`${origin}/api/meta`);
  assert.equal(meta.status, 200);
  const metaPayload = await meta.json();
  assert.equal(metaPayload.data.major, 'v1');
  assert.equal(metaPayload.data.version, '1.0.1');

  const unsupported = await fetch(`${origin}/api/v1/not-a-contract-route`);
  assert.equal(unsupported.status, 404);

  const wrongOrigin = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: {
      Origin: 'http://127.0.0.1:1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: 'nobody@example.test', password: 'nope' }),
  });
  assert.equal(wrongOrigin.status, 403);

  console.log(
    JSON.stringify(
      {
        processStart: 'PASS',
        staticUi: 'PASS',
        csrfBootstrap: 'PASS',
        contractMeta: 'PASS',
        unsupportedRoute: 'PASS',
        originRejection: 'PASS',
      },
      null,
      2,
    ),
  );
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2_000).unref();
  });
}
