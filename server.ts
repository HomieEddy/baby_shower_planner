import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { getGuestContentLock, initPocketBase, runAgendaReminderSweep } from './src/db/service';
import {
  applySecurityHeaders,
  BLOCK_BOTS,
  BOT_UA_RE,
  clientIp,
  GLOBAL_LIMIT,
  HttpError,
  LOGIN_ATTEMPT_LIMIT,
  MAX_BODY_BYTES,
  MIME_TYPES,
  originMatchesHost,
  rateLimit,
  sendJson,
  serveStaticFile,
  timingSafeEqualStr,
  validateSecrets,
} from './src/server/http';
import type { RouteCtx } from './src/server/http';
import { handleSystemRoutes } from './src/server/routes/system';
import { handleGuestRoutes } from './src/server/routes/guests';
import { handleRsvpRoutes } from './src/server/routes/rsvp';
import { handleGuestbookRoutes } from './src/server/routes/guestbook';
import { handlePhotoRoutes } from './src/server/routes/photos';
import { handleSettingsRoutes } from './src/server/routes/settings';
import { handleAlertRoutes } from './src/server/routes/alerts';
import { handleFloorPlanRoutes } from './src/server/routes/floorplan';
import { handleGiftRoutes } from './src/server/routes/gifts';
import { handleAgendaRoutes } from './src/server/routes/agenda';
import { handleCheckInRoutes } from './src/server/routes/checkin';

const PORT = Number(process.env.PORT) || 3025;

// Ordered per-feature dispatchers; each returns true only when it responded.
const API_HANDLERS: Array<(ctx: RouteCtx) => Promise<boolean>> = [
  handleSystemRoutes,
  handleGuestRoutes,
  handleRsvpRoutes,
  handleGuestbookRoutes,
  handlePhotoRoutes,
  handleSettingsRoutes,
  handleAlertRoutes,
  handleFloorPlanRoutes,
  handleGiftRoutes,
  handleAgendaRoutes,
  handleCheckInRoutes,
];

async function requestHandler(req: http.IncomingMessage, res: http.ServerResponse, viteDevServer?: any) {
  applySecurityHeaders(res);

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';
  const ip = clientIp(req);

  if (serveStaticFile(pathname, res)) return;

  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  const adminOnly = () =>
    !ADMIN_TOKEN ||
    (typeof req.headers['x-admin-token'] === 'string' &&
      timingSafeEqualStr(req.headers['x-admin-token'], ADMIN_TOKEN));

  // Admin gate with brute-force protection: failed auth counts against the
  // caller's IP and excess attempts get a 429 instead of a 401.
  const requireAdmin = () => {
    if (adminOnly()) return;
    const fail = rateLimit(`login:${ip}`, LOGIN_ATTEMPT_LIMIT, 60_000);
    if (!fail.allowed) throw new HttpError(429, 'Too many attempts. Try again later.');
    throw new HttpError(401, 'Unauthorized');
  };

  // Guest content window lock (guestbook + photos): admins bypass it.
  const guestLock: RouteCtx['guestLock'] = async () => {
    if (adminOnly()) return null;
    const lock = await getGuestContentLock();
    return lock.locked ? lock : null;
  };

  // Crawler / AI-scraper user agents get nothing from the API.
  if (BLOCK_BOTS && pathname.startsWith('/api/') && BOT_UA_RE.test(req.headers['user-agent'] || '')) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  if (pathname.startsWith('/api/')) {
    // Per-IP global budget (health checks exempt so Coolify probes keep working).
    if (pathname !== '/api/health') {
      const global = rateLimit(`g:${ip}`, GLOBAL_LIMIT, 60_000);
      if (!global.allowed) return sendJson(res, 429, { error: 'Too many requests' });
    }

    // Cross-site requests can't forge a matching Origin (CSRF defense-in-depth).
    if (method !== 'GET' && !originMatchesHost(req)) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }

    // Reject oversized bodies up front (and again while streaming).
    const contentLength = Number(req.headers['content-length']);
    if (contentLength > MAX_BODY_BYTES) return sendJson(res, 413, { error: 'Payload too large' });

    const ctx: RouteCtx = { req, res, url, ip, adminOnly, requireAdmin, guestLock };
    try {
      for (const handler of API_HANDLERS) {
        if (await handler(ctx)) return;
      }
      return sendJson(res, 404, { error: 'Endpoint not found' });
    } catch (err: any) {
      if (err instanceof HttpError) {
        console.warn(`[API] ${err.status} ${method} ${pathname}: ${err.message}`);
        return sendJson(res, err.status, { error: err.message });
      }
      console.error(`[API] 500 ${method} ${pathname}:`, err);
      return sendJson(res, 500, { error: err.message || 'Server internal error' });
    }
  }

  if (viteDevServer) {
    viteDevServer.middlewares(req, res);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const resolvedDist = path.resolve(distPath);
    const staticFilePath = path.resolve(distPath, '.' + pathname);
    if (
      staticFilePath.startsWith(resolvedDist + path.sep) &&
      fs.existsSync(staticFilePath) &&
      fs.statSync(staticFilePath).isFile()
    ) {
      const ext = path.extname(staticFilePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(staticFilePath).pipe(res);
    } else {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    }
  }
}

async function startServer() {
  validateSecrets();
  await initPocketBase();

  // Agenda reminder sweep: fires every 5 minutes for tasks inside their
  // reminder window. Single-process assumption (dev and prod both run one
  // instance) — a second instance would double-send. ponytail: interval
  // beats cron here; the sweep is idempotent per task via reminder_sent.
  setInterval(() => {
    runAgendaReminderSweep()
      .then((r) => {
        if (r.reminded > 0) {
          console.log(`[AGENDA] Reminded ${r.reminded} task(s)${r.failed ? `, ${r.failed} failed` : ''}`);
        }
      })
      .catch((err) => console.error('[AGENDA] Reminder sweep failed:', err));
  }, 5 * 60 * 1000).unref();

  if (process.env.NODE_ENV !== 'production') {
    // Create the HTTP server first so Vite can attach its HMR websocket to it
    // (middleware mode otherwise opens a random HMR port the browser can't reach).
    const server = http.createServer();
    const viteDevServer = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    server.on('request', (req, res) => requestHandler(req, res, viteDevServer));
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Native Node HTTP + PocketBase Backend listening on http://localhost:${PORT}`);
    });
  } else {
    const server = http.createServer((req, res) => requestHandler(req, res));
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Production Native HTTP Backend listening on http://localhost:${PORT}`);
    });
  }
}

startServer();