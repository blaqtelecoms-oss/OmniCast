// Preview bridge for this app's hosted Base44 backend.
//
// The app's client calls `${serverUrl}/api/...` (see src/api/base44Client.js and
// the SDK's modules). In the sandbox preview those requests reach this service
// through the Vite dev server's `/api` proxy, and this service forwards them to
// the app's real Base44 backend, adding the app's access token server-side so the
// browser never holds a credential. Deployed app: unused — the client talks to
// Base44 directly.
//
// It holds only the app id (for the dev server); the token is read from the
// environment and never leaves this process.
import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = (process.env.BASE44_API_UPSTREAM || 'https://app.base44.com').replace(/\/+$/, '');
const TOKEN = process.env.BASE44_ADMIN_TOKEN || '';
const APP_ID = process.env.BASE44_APP_ID || '';

const DROPPED_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'authorization',
  'cookie',
  'set-cookie',
  'content-length',
]);

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
};

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.url === '/api/_preview/app-id') {
    return sendJson(res, 200, { appId: APP_ID });
  }

  const target = new URL(UPSTREAM + req.url);
  const headers = { ...req.headers };
  for (const name of Object.keys(headers)) {
    if (DROPPED_HEADERS.has(name.toLowerCase())) delete headers[name];
  }
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

  const upstream = https.request(
    {
      host: target.hostname,
      port: 443,
      method: req.method,
      path: target.pathname + target.search,
      headers,
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      for (const name of Object.keys(responseHeaders)) {
        if (DROPPED_HEADERS.has(name.toLowerCase())) delete responseHeaders[name];
      }
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    },
  );

  upstream.on('error', (error) => {
    console.error(`[preview-api] ${req.method} ${req.url} failed: ${error.message}`);
    if (!res.headersSent) sendJson(res, 502, { error: 'upstream_unreachable', message: error.message });
    else res.end();
  });

  req.pipe(upstream);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[preview-api] forwarding /api -> ${UPSTREAM} for app ${APP_ID || '(unset)'}`);
});
