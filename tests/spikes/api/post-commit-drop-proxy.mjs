import http from 'node:http';

const targetUrl = process.env.M3_ACCOUNT_API_TARGET ?? 'http://127.0.0.1:8787';
const port = Number.parseInt(process.env.M3_DROP_PROXY_PORT ?? '8788', 10);
let dropped = false;

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const body = await readBody(request);
    const headers = { ...request.headers };
    delete headers.connection;
    delete headers.host;
    delete headers['content-length'];
    const upstream = await fetch(`${targetUrl}${request.url ?? '/'}`, {
      method: request.method,
      headers,
      body: body.length ? body : undefined,
    });
    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    const isRedeem =
      request.method === 'POST' &&
      request.url?.includes('/v1/subscription/redeem');
    if (isRedeem && upstream.ok && !dropped) {
      dropped = true;
      request.socket.destroy();
      return;
    }
    response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
    response.end(upstreamBody);
  } catch {
    if (!request.socket.destroyed) request.socket.destroy();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`post-commit-drop-proxy listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
