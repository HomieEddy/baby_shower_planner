// Shared HTTP framework primitives for the API server (no feature logic).

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { UPLOADS_DIR } from './uploadFiles';

export const IS_PROD = process.env.NODE_ENV === 'production';
// Coolify proxies traffic and appends X-Forwarded-For; trust it for rate
// limiting. Set TRUST_PROXY=false if the app port is ever exposed directly.
export const TRUST_PROXY = process.env.TRUST_PROXY !== 'false';
export const BLOCK_BOTS = process.env.BLOCK_BOTS !== 'false';
export const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES) || 25 * 1024 * 1024;
export const GLOBAL_LIMIT = 600; // requests per minute per IP
export const LOGIN_ATTEMPT_LIMIT = 10; // failed admin-auth attempts per minute per IP

// Well-known crawlers / AI scrapers — they get 403 on the API. Search engines
// are intentionally NOT in the list (robots.txt covers them).
export const BOT_UA_RE =
  /(GPTBot|ChatGPT-User|OAI-SearchBot|anthropic-ai|ClaudeBot|Claude-Web|CCBot|Google-Extended|Bytespider|PetalBot|PerplexityBot|Amazonbot|cohere-ai|AhrefsBot|MJ12bot|SemrushBot|DotBot|YandexBot|Baiduspider|Sogou|Exabot|ia_archiver|archive\.org_bot|BLEXBot|SeznamBot|Applebot-Extended|ImagesiftBot)/i;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Constant-time comparison so token checks don't leak prefix matches.
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function clientIp(req: http.IncomingMessage): string {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const first = xff.split(',')[0].trim();
      if (first) return first;
    }
  }
  return req.socket.remoteAddress || 'unknown';
}

// In-memory sliding-window rate limiter keyed per IP. Per-process state is
// fine: production runs a single instance, and Coolify restarts clear it.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}
// Sweep expired buckets so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 60_000).unref();

// Browser-origin check for mutating requests: cross-site pages can't forge a
// matching Origin, so drive-by form/fetch spam is rejected. Non-browser
// clients (curl, health probes) send no Origin and pass. Behind the Vercel
// proxy the browser sends the Vercel Origin while the Host header is the
// Railway service, so the APP_URL origin is allowed too.
export function originMatchesHost(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    if (originHost === (req.headers.host || '')) return true;
    const appUrl = process.env.APP_URL;
    if (appUrl && originHost === new URL(appUrl).host) return true;
    return false;
  } catch {
    return false;
  }
}

// Baseline headers on every response; CSP + HSTS only in production (the Vite
// dev server needs inline/eval and localhost would swallow HSTS anyway).
export function applySecurityHeaders(res: http.ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://api.qrserver.com",
      "connect-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '));
  }
}

// Fail fast on weak/missing secrets in production; warn (and keep dev
// conveniences) otherwise.
export function validateSecrets() {
  const problems: string[] = [];
  if (!process.env.ADMIN_TOKEN) problems.push('ADMIN_TOKEN is not set');
  else if (process.env.ADMIN_TOKEN.length < 16) problems.push('ADMIN_TOKEN is shorter than 16 characters');
  else if (process.env.ADMIN_TOKEN === 'babyshower-admin-2026') problems.push('ADMIN_TOKEN is the known dev default');
  if (!process.env.PB_ADMIN_EMAIL) problems.push('PB_ADMIN_EMAIL is not set');
  if (!process.env.PB_ADMIN_PASSWORD) problems.push('PB_ADMIN_PASSWORD is not set');
  else if (process.env.PB_ADMIN_PASSWORD.length < 12) problems.push('PB_ADMIN_PASSWORD is shorter than 12 characters');
  else if (process.env.PB_ADMIN_PASSWORD === 'changeme123') problems.push('PB_ADMIN_PASSWORD is the known dev default');
  if (!process.env.POCKETBASE_URL) problems.push('POCKETBASE_URL is not set');
  if (IS_PROD && problems.length > 0) {
    console.error('[SECURITY] Refusing to start in production — fix these before exposing the app:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  if (problems.length > 0) {
    console.warn('[SECURITY] Dev-mode: ' + problems.join('; ') + '.');
  }
}

export function parseJson(req: http.IncomingMessage): Promise<any> {
  const { promise, resolve, reject } = Promise.withResolvers<any>();
  let body = '';
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      reject(new HttpError(413, 'Payload too large'));
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}); }
    catch { reject(new HttpError(400, 'Invalid JSON body')); }
  });
  req.on('error', (err) => reject(err));
  return promise;
}

// Returns `true` so route handlers can `return sendJson(...)` to signal they
// handled the request (dispatch stops on a truthy handler result).
export function sendJson(res: http.ServerResponse, statusCode: number, data: any): true {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
  return true;
}

// Static assets: correct Content-Type matters (module scripts and stylesheets
// are refused by browsers without it).
export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

export function serveStaticFile(reqPath: string, res: http.ServerResponse): boolean {
  if (reqPath.startsWith('/uploads/')) {
    const filePath = getUploadFilePathGuarded(reqPath);
    if (filePath && fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }
  }
  return false;
}

function getUploadFilePathGuarded(reqPath: string): string | null {
  const name = reqPath.slice('/uploads/'.length);
  if (!name || name.includes('..')) return null;
  return path.join(UPLOADS_DIR, path.basename(name));
}

// Context passed to every route handler; admin/guest-lock guards are bound to
// the current request (built in server.ts where the db imports live).
export interface RouteCtx {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  ip: string;
  adminOnly: () => boolean;
  requireAdmin: () => void;
  guestLock: () => Promise<{ locked: boolean; opensAt?: string; closesAt?: string } | null>;
}