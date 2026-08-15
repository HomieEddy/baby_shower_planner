import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import { GiftLogSchema, AgendaTaskSchema, AgendaReorderSchema, ReminderSettingsSchema } from './src/lib/validation.ts';
import type { EventSettings, AgendaTask } from './src/types.ts';
import { pb } from './src/db/service';
import {
  getAllGuests,
  getGuestByToken,
  addGuest,
  updateGuest,
  deleteGuest,
  submitRsvp,
  resetTokenUsage,
  getAllGuestbookEntries,
  addGuestbookEntry,
  wipeDatabaseData,
  getSettings,
  updateSettings,
  getAlerts,
  createAlert,
  deleteAlert,
  getFloorMap,
  updateFloorMap,
  assignGuestToTable,
  shareFloorPlanEmail,
  getAllPhotos,
  addPhotosBatch,
  deletePhoto,
  likePhoto,
  getGifts,
  addGift,
  toggleGiftThankYou,
  getGiftById,
  generateThankYouDraft,
  sendGiftThankYou,
  deleteGift,
  batchImportGuests,
  checkInGuest,
  undoCheckIn,
  getCheckInStats,
  selfCheckIn,
  getSeatingRoster,
  getGuestContentLock,
  sendInvitations,
  sendReminders,
  initPocketBase,
  updateGuestContact,
  inviteGuest,
  getInvitesByGuest,
  removeInvite,
  inviteMessageFor,
  getGuestById,
  getAgendaTasks,
  addAgendaTask,
  updateAgendaTask,
  deleteAgendaTask,
  reorderAgendaTasks,
  runAgendaReminderSweep,
} from './src/db/service.ts';

const PORT = Number(process.env.PORT) || 3025;

// UPLOAD_DIR lets deployments persist uploads on a volume (Coolify: mount a
// volume here). Defaults to public/uploads for local/dev parity.
const uploadsDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads'));
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ─── Security hardening ───────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === 'production';
// Coolify proxies traffic and appends X-Forwarded-For; trust it for rate
// limiting. Set TRUST_PROXY=false if the app port is ever exposed directly.
const TRUST_PROXY = process.env.TRUST_PROXY !== 'false';
const BLOCK_BOTS = process.env.BLOCK_BOTS !== 'false';
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES) || 25 * 1024 * 1024;
const GLOBAL_LIMIT = 600; // requests per minute per IP
const LOGIN_ATTEMPT_LIMIT = 10; // failed admin-auth attempts per minute per IP

// Well-known crawlers / AI scrapers — they get 403 on the API. Search engines
// are intentionally NOT in the list (robots.txt covers them).
const BOT_UA_RE =
  /(GPTBot|ChatGPT-User|OAI-SearchBot|anthropic-ai|ClaudeBot|Claude-Web|CCBot|Google-Extended|Bytespider|PetalBot|PerplexityBot|Amazonbot|cohere-ai|AhrefsBot|MJ12bot|SemrushBot|DotBot|YandexBot|Baiduspider|Sogou|Exabot|ia_archiver|archive\.org_bot|BLEXBot|SeznamBot|Applebot-Extended|ImagesiftBot)/i;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Constant-time comparison so token checks don't leak prefix matches.
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function clientIp(req: http.IncomingMessage): string {
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
function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
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
function originMatchesHost(req: http.IncomingMessage): boolean {
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
function applySecurityHeaders(res: http.ServerResponse) {
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
function validateSecrets() {
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

function parseJson(req: http.IncomingMessage): Promise<any> {
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

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Static assets: correct Content-Type matters (module scripts and stylesheets
// are refused by browsers without it).
const MIME_TYPES: Record<string, string> = {
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

function serveStaticFile(reqPath: string, res: http.ServerResponse): boolean {
  if (reqPath.startsWith('/uploads/')) {
    const filename = path.basename(reqPath);
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.webp': 'image/webp', '.gif': 'image/gif',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }
  }
  return false;
}

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
  const guestLock = async (): Promise<{ locked: boolean; opensAt?: string; closesAt?: string } | null> => {
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

    try {
      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(res, 200, { status: 'ok', engine: 'Native Node HTTP + PocketBase SDK', time: new Date().toISOString() });
      }

      // Delivery provider availability — the UI hides channels that can't send.
      if (pathname === '/api/capabilities' && method === 'GET') {
        return sendJson(res, 200, {
          email: !!process.env.RESEND_API_KEY,
          sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
        });
      }

      // ─── Guests ───────────────────────────────────────
      if (pathname === '/api/guests') {
        requireAdmin();
        if (method === 'GET') {
          const guests = await getAllGuests();
          return sendJson(res, 200, { guests });
        }
        if (method === 'POST') {
          const body = await parseJson(req);
          const { name, email, phone, delivery_channel, max_party_size, language_pref } = body;
          const channel = delivery_channel || 'none';
          if (!name || !name.trim()) return sendJson(res, 400, { error: 'Guest name is required' });
          if ((channel === 'email' || channel === 'both') && (!email || !email.trim())) return sendJson(res, 400, { error: 'Email address is required' });
          if ((channel === 'text' || channel === 'both') && (!phone || !phone.trim())) return sendJson(res, 400, { error: 'Phone number is required' });
          if (!['email', 'text', 'both', 'none'].includes(channel)) return sendJson(res, 400, { error: 'Invalid delivery channel' });

          const result = await addGuest({
            name: name.trim(), email: email?.trim() || '', phone: phone?.trim() || '',
            delivery_channel: channel, max_party_size: Number(max_party_size) || 1,
            language_pref: language_pref === 'EN' ? 'EN' : 'FR',
          });
          return sendJson(res, 200, result);
        }
      }

      if (pathname.startsWith('/api/guests/') && pathname !== '/api/guests/batch-import') {
        if (method === 'GET' && pathname.endsWith('/invite-message')) {
          requireAdmin();
          const id = pathname.replace('/api/guests/', '').replace('/invite-message', '');
          const guest = await getGuestById(id);
          return sendJson(res, 200, { message: await inviteMessageFor(guest) });
        }
          const id = pathname.replace('/api/guests/', '');
        requireAdmin();
        if (method === 'PUT') {
          const body = await parseJson(req);
          const guest = await updateGuest(id, body);
          return sendJson(res, 200, { guest });
        }
        if (method === 'DELETE') {
          await deleteGuest(id);
          return sendJson(res, 200, { success: true });
        }
      }

      if (pathname === '/api/guests/batch-import' && method === 'POST') {
        requireAdmin();
        const body = await parseJson(req);
        if (!Array.isArray(body.guests) || body.guests.length === 0) {
          return sendJson(res, 400, { error: 'Array of guest objects is required' });
        }
        const result = await batchImportGuests(body.guests);
        return sendJson(res, 200, { success: true, count: result.count, imported: result.imported });
      }

      // ─── RSVP ────────────────────────────────────────
      if (pathname.startsWith('/api/rsvp/')) {
        const parts = pathname.replace('/api/rsvp/', '').split('/');
        const token = parts[0];
        const isReset = parts[1] === 'reset';
        const isContact = parts[1] === 'contact';
        const isInvite = parts[1] === 'invite' && parts.length === 2;
        const isInvitesList = parts[1] === 'invites' && parts.length === 2;
        const isInviteDelete = parts[1] === 'invites' && parts.length === 3;

        if (isInviteDelete && method === 'DELETE') {
          const removed = await removeInvite(token, parts[2]);
          if (!removed) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Invite not found' });
          return sendJson(res, 200, { success: true });
        }
        if (isInvitesList && method === 'GET') {
          const invites = await getInvitesByGuest(token);
          const withMessages = await Promise.all(invites.map(async (g) => ({ ...g, invite_message: await inviteMessageFor(g) })));
          return sendJson(res, 200, { invites: withMessages });
        }
        if (isInvite && method === 'POST') {
          const body = await parseJson(req);
          const result = await inviteGuest(token, {
            name: body.name, contact: body.contact, channel: body.channel, note: body.note,
          });
          if (!result.ok) {
            const msg = result.error === 'NAME_REQUIRED' ? 'Invitee name is required'
              : result.error === 'CONTACT_REQUIRED' ? 'Contact is required for that delivery channel'
              : 'Invalid invitation token';
            return sendJson(res, result.error === 'INVALID_TOKEN' ? 404 : 400, { error: result.error, message: msg });
          }
          return sendJson(res, 200, result);
        }
        if (isContact && method === 'POST') {
          const body = await parseJson(req);
          const { email, phone, delivery_channel } = body;
          if (!['none', 'email', 'text', 'both'].includes(delivery_channel)) {
            return sendJson(res, 400, { error: 'Invalid delivery channel' });
          }
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return sendJson(res, 400, { error: 'Invalid email address' });
          }
          try {
            const guest = await updateGuestContact(token, { email, phone, delivery_channel });
            return sendJson(res, 200, { success: true, guest });
          } catch (err) {
            const msg = err instanceof Error && err.message === 'EMAIL_REQUIRED' ? 'Email is required for email delivery'
              : err instanceof Error && err.message === 'PHONE_REQUIRED' ? 'Phone number is required for SMS delivery'
              : 'Invalid invitation token';
            return sendJson(res, err instanceof Error && (err.message === 'EMAIL_REQUIRED' || err.message === 'PHONE_REQUIRED') ? 400 : 404, { error: 'CONTACT_UPDATE_FAILED', message: msg });
          }
        }
        if (isReset && method === 'POST') {
          const guest = await resetTokenUsage(token);
          return sendJson(res, 200, { success: true, guest });
        }
        if (method === 'GET') {
          const guest = await getGuestByToken(token);
          if (!guest) return sendJson(res, 404, { error: 'INVALID_TOKEN', message: 'Invitation token not found' });
          return sendJson(res, 200, { guest });
        }
        if (method === 'POST') {
          const body = await parseJson(req);
          const { rsvp_status, attending_party_size, dietary_restrictions, attendee_details, attendee_names } = body;
          if (!['Attending', 'Declined'].includes(rsvp_status)) {
            return sendJson(res, 400, { error: 'Invalid RSVP status' });
          }
          const updated = await submitRsvp(token, {
            rsvp_status, attending_party_size: Number(attending_party_size) || 1,
            dietary_restrictions: dietary_restrictions || '',
            attendee_details,
            attendee_names,
          });
          return sendJson(res, 200, { success: true, guest: updated });
        }
      }

      // ─── Guestbook ───────────────────────────────────
      if (pathname === '/api/guestbook') {
        const lock = await guestLock();
        if (lock) {
          return sendJson(res, 403, { error: 'GUEST_CONTENT_LOCKED', opensAt: lock.opensAt, closesAt: lock.closesAt });
        }
        if (method === 'GET') {
          const entries = await getAllGuestbookEntries();
          return sendJson(res, 200, { entries });
        }
        if (method === 'POST') {
          const body = await parseJson(req);
          const { guest_name, message, photo_url } = body;
          if (!guest_name || !message) return sendJson(res, 400, { error: 'Name and message are required' });
          const entry = await addGuestbookEntry({ guest_name, message, photo_url });
          return sendJson(res, 200, { success: true, entry });
        }
      }

      // ─── Upload ─────────────────────────────────────
      if (pathname === '/api/upload' && method === 'POST') {
        const body = await parseJson(req);
        if (body.photo_base64) {
          const matches = body.photo_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const allowed: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', heic: 'heic' };
            const ext = allowed[matches[1].split('/')[1]] || 'jpg';
            const filename = `photo-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
            fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(matches[2], 'base64'));
            return sendJson(res, 200, { photo_url: `/uploads/${filename}` });
          }
        }
        return sendJson(res, 200, { photo_url: body.photo_url || '/uploads/sample.jpg' });
      }

      // ─── Photos ─────────────────────────────────────
      if (pathname === '/api/photos') {
        const lock = await guestLock();
        if (lock) {
          return sendJson(res, 403, { error: 'GUEST_CONTENT_LOCKED', opensAt: lock.opensAt, closesAt: lock.closesAt });
        }
        if (method === 'GET') {
          const photos = await getAllPhotos();
          return sendJson(res, 200, { photos });
        }
      }

      if (pathname === '/api/photos/upload' && method === 'POST') {
        const lock = await guestLock();
        if (lock) {
          return sendJson(res, 403, { error: 'GUEST_CONTENT_LOCKED', opensAt: lock.opensAt, closesAt: lock.closesAt });
        }
        const body = await parseJson(req);
        const { uploader_name, caption, table_name, table_id, photos } = body;
        const list = Array.isArray(photos) ? photos : [{ url: body.url || '/uploads/sample.jpg', filename: 'photo.jpg' }];
        const created = await addPhotosBatch(list.map((p: any) => ({
          url: p.url || '/uploads/sample.jpg', filename: p.filename || 'photo.jpg',
          caption: caption || '', uploader_name: uploader_name || 'Guest',
          table_name: table_name || 'Table Visitor', table_id: table_id || '',
        })));
        return sendJson(res, 200, { success: true, count: created.length, photos: created });
      }

      if (pathname.startsWith('/api/photos/')) {
        const parts = pathname.replace('/api/photos/', '').split('/');
        const id = parts[0];
        const action = parts[1];
        if (action === 'like' && method === 'POST') {
          const lock = await guestLock();
          if (lock) {
            return sendJson(res, 403, { error: 'GUEST_CONTENT_LOCKED', opensAt: lock.opensAt, closesAt: lock.closesAt });
          }
          const updated = await likePhoto(id);
          return sendJson(res, 200, { success: true, photo: updated });
        }
        if (method === 'DELETE') {
          requireAdmin();
          await deletePhoto(id);
          return sendJson(res, 200, { success: true });
        }
      }

      // ─── Settings ────────────────────────────────────
      if (pathname === '/api/settings') {
        if (method === 'GET') {
          const settings = await getSettings();
          // Host contact details are admin-only; guests need event info + footer names.
          if (!adminOnly()) {
            delete (settings as Partial<EventSettings>).hostEmail;
            delete (settings as Partial<EventSettings>).hostPhone;
          }
          return sendJson(res, 200, { settings });
        }
        if (method === 'POST') {
          requireAdmin();
          const body = await parseJson(req);
          const reminder = ReminderSettingsSchema.partial().safeParse(body);
          if (!reminder.success) {
            return sendJson(res, 400, { error: reminder.error.issues[0]?.message || 'Invalid settings payload' });
          }
          const settings = await updateSettings({ ...body, ...reminder.data });
          return sendJson(res, 200, { success: true, settings });
        }
      }

      // ─── Alerts ──────────────────────────────────────
      if (pathname === '/api/alerts') {
        if (method === 'GET') {
          const alerts = await getAlerts();
          return sendJson(res, 200, { alerts });
        }
        if (method === 'POST') {
          requireAdmin();
          const body = await parseJson(req);
          const { type, title, message, target_audience } = body;
          if (!title || !message) return sendJson(res, 400, { error: 'Title and message are required' });
          const result = await createAlert({ type: type || 'CUSTOM', title, message, target_audience });
          return sendJson(res, 200, { success: true, alert: result.alert, notified_count: result.notified_count });
        }
      }

      if (pathname.startsWith('/api/alerts/') && method === 'DELETE') {
        requireAdmin();
        const id = pathname.replace('/api/alerts/', '');
        const remaining = await deleteAlert(id);
        return sendJson(res, 200, { success: true, alerts: remaining });
      }

      // ─── Floorplan ──────────────────────────────────
      if (pathname === '/api/floorplan') {
        if (method === 'GET') {
          const floorMap = await getFloorMap();
          return sendJson(res, 200, { floorMap });
        }
        if (method === 'POST') {
          requireAdmin();
          const body = await parseJson(req);
          const floorMap = await updateFloorMap(body);
          return sendJson(res, 200, { success: true, floorMap });
        }
      }

      if (pathname === '/api/floorplan/roster' && method === 'GET') {
        const guestToken = url.searchParams.get('guest') || undefined;
        const result = await getSeatingRoster(guestToken);
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/floorplan/assign' && method === 'POST') {
        requireAdmin();
        const body = await parseJson(req);
        if (!body.guestId) return sendJson(res, 400, { error: 'guestId is required' });
        const floorMap = await assignGuestToTable(body.guestId, body.tableId || null);
        return sendJson(res, 200, { success: true, floorMap });
      }

      if (pathname === '/api/floorplan/share-email' && method === 'POST') {
        requireAdmin();
        const body = await parseJson(req);
        const result = await shareFloorPlanEmail(body.guestIds, body.customMessage);
        return sendJson(res, 200, { success: true, count: result.count });
      }

      // ─── Gifts ──────────────────────────────────────
      if (pathname === '/api/gifts') {
        requireAdmin();
        if (method === 'GET') {
          const gifts = await getGifts();
          return sendJson(res, 200, { gifts });
        }
        if (method === 'POST') {
          const body = await parseJson(req);
          const validation = GiftLogSchema.safeParse(body);
          if (!validation.success) {
            return sendJson(res, 400, { error: validation.error.issues[0]?.message || 'Invalid gift payload' });
          }
          const newGift = await addGift(validation.data);
          return sendJson(res, 200, { success: true, gift: newGift });
        }
      }

      if (pathname.startsWith('/api/gifts/')) {
        const parts = pathname.replace('/api/gifts/', '').split('/');
        const id = parts[0];
        const action = parts[1];
        if (action === 'thankyou' && method === 'POST') {
          requireAdmin();
          const updated = await toggleGiftThankYou(id);
          return sendJson(res, 200, { success: true, gift: updated });
        }
        if (action === 'draft' && method === 'POST') {
          requireAdmin();
          const gift = await getGiftById(id);
          let settings: Partial<EventSettings> = {};
          try {
            settings = await getSettings();
          } catch { /* no event settings yet — fallback placeholders */ }
          const draft = await generateThankYouDraft(gift, settings);
          return sendJson(res, 200, { success: true, draft });
        }
        if (action === 'send-thankyou' && method === 'POST') {
          requireAdmin();
          const body = await parseJson(req);
          const { channel, text } = body;
          if (!['email', 'text', 'both'].includes(channel)) {
            return sendJson(res, 400, { error: 'Invalid delivery channel' });
          }
          if (!text || !text.trim()) return sendJson(res, 400, { error: 'Thank-you message is required' });
          try {
            const result = await sendGiftThankYou(id, channel, text.trim());
            return sendJson(res, 200, { success: true, ...result });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'SEND_FAILED';
            if (message === 'GUEST_NOT_FOUND' || message === 'NO_EMAIL' || message === 'NO_PHONE') {
              return sendJson(res, 400, { error: message });
            }
            return sendJson(res, 500, { error: 'SEND_FAILED' });
          }
        }
        if (method === 'DELETE') {
          requireAdmin();
          await deleteGift(id);
          return sendJson(res, 200, { success: true });
        }
      }

      // ─── Agenda (host task planner) ───────────────────
      if (pathname === '/api/agenda') {
        requireAdmin();
        if (method === 'GET') {
          const tasks = await getAgendaTasks();
          return sendJson(res, 200, { tasks });
        }
        if (method === 'POST') {
          const body = await parseJson(req);
          const validation = AgendaTaskSchema.safeParse(body);
          if (!validation.success) {
            return sendJson(res, 400, { error: validation.error.issues[0]?.message || 'Invalid task payload' });
          }
          const task = await addAgendaTask(validation.data);
          return sendJson(res, 200, { success: true, task });
        }
      }

      if (pathname === '/api/agenda/reorder' && method === 'POST') {
        requireAdmin();
        const body = await parseJson(req);
        const validation = AgendaReorderSchema.safeParse(body.items);
        if (!validation.success) {
          return sendJson(res, 400, { error: 'Invalid reorder payload' });
        }
        await reorderAgendaTasks(validation.data);
        return sendJson(res, 200, { success: true });
      }

      if (pathname === '/api/agenda/test-reminder' && method === 'POST') {
        requireAdmin();
        const settings = await getSettings();
        const channels = settings.reminderChannels ?? { email: false, sms: false };
        const sampleTask: AgendaTask = {
          id: 'test', title: settings.language === 'FR' ? 'Rappel test' : 'Test reminder',
          due_date: settings.date || '', due_time: undefined,
          status: 'todo', position: 0, reminder_sent: false, created_at: '',
        };
        const results: Record<string, boolean> = {};
        if (channels.email && settings.hostEmail) {
          const { sendAgendaReminderEmail } = await import('./src/lib/email');
          results.email = await sendAgendaReminderEmail(settings.hostEmail, sampleTask, settings);
        }
        if (channels.sms && settings.hostPhone) {
          const { sendAgendaReminderSms } = await import('./src/lib/sms');
          results.sms = await sendAgendaReminderSms(settings.hostPhone, sampleTask, settings);
        }
        return sendJson(res, 200, { success: true, results });
      }

      if (pathname.startsWith('/api/agenda/')) {
        requireAdmin();
        const id = pathname.replace('/api/agenda/', '');
        if (method === 'PATCH') {
          const body = await parseJson(req);
          const validation = AgendaTaskSchema.partial().safeParse(body);
          if (!validation.success) {
            return sendJson(res, 400, { error: validation.error.issues[0]?.message || 'Invalid task payload' });
          }
          const task = await updateAgendaTask(id, validation.data);
          return sendJson(res, 200, { success: true, task });
        }
        if (method === 'DELETE') {
          await deleteAgendaTask(id);
          return sendJson(res, 200, { success: true });
        }
      }

      // ─── Check-in (admin) ────────────────────────────
      if (pathname === '/api/check-in' && method === 'POST') {
        requireAdmin();
        const body = await parseJson(req);
        if (!body.guestId) return sendJson(res, 400, { error: 'guestId is required' });
        // body.name: check in one party member; omitted = whole party
        const guest = await checkInGuest(body.guestId, body.name);
        return sendJson(res, 200, { guest });
      }

      if (pathname === '/api/check-in/undo' && method === 'POST') {
        requireAdmin();
        const body = await parseJson(req);
        if (!body.guestId) return sendJson(res, 400, { error: 'guestId is required' });
        const guest = await undoCheckIn(body.guestId, body.name);
        return sendJson(res, 200, { guest });
      }

      if (pathname === '/api/check-in/stats' && method === 'GET') {
        requireAdmin();
        const stats = await getCheckInStats();
        return sendJson(res, 200, { stats });
      }

      // ─── Check-in (public, self-service) ─────────────
      // The merged day-of page identifies parties via the seating roster
      // endpoint; only the check-in action lives here. Body: { token } |
      // { code, name }, plus optional targetName / all / undo.
      if (pathname === '/api/check-in/self' && method === 'POST') {
        const body = await parseJson(req);
        const result = await selfCheckIn({
          token: body.token,
          code: body.code,
          name: body.name,
          targetName: body.targetName,
          all: !!body.all,
          undo: !!body.undo,
        });
        if (!result.ok) {
          const status = result.error === 'ONLY_LEAD' ? 403 : result.error === 'NOT_IN_PARTY' ? 400 : 404;
          return sendJson(res, status, { error: result.error });
        }
        return sendJson(res, 200, { guest: result.guest });
      }

      // ─── Invitation Sending ──────────────────────────
      if (pathname === '/api/send-invitations' && method === 'POST') {
        requireAdmin();
        const body = await parseJson(req).catch(() => ({}));
        const result = await sendInvitations(Array.isArray(body.guestIds) ? body.guestIds : undefined);
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/send-reminders' && method === 'POST') {
        requireAdmin();
        const result = await sendReminders();
        return sendJson(res, 200, result);
      }

      // ─── Wipe ────────────────────────────────────────
      if (pathname === '/api/wipe-data' && method === 'POST') {
        requireAdmin();
        const data = await wipeDatabaseData();
        return sendJson(res, 200, { success: true, data });
      }

      return sendJson(res, 404, { error: 'Endpoint not found' });
    } catch (err: any) {
      if (err instanceof HttpError) {
        return sendJson(res, err.status, { error: err.message });
      }
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
