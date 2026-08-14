# Security

Threat model and hardening notes for the Bébé Baby Shower Planner. The app is
designed for a short, event-day traffic window, but it is hardened against
internet-wide scanners, crawlers, and spammers.

## Deployment (Vercel + Railway)

The app is split across two platforms:

- **Vercel** — static frontend (this repo, `npm run build:web` → `dist`).
  `vercel.json` provides the SPA fallback, proxies `/api/*` and `/uploads/*`
  to the Railway API service (same-origin for the browser, so CSP/PWA
  behavior is unchanged), and applies the production security headers
  (CSP/HSTS/etc.) with parity to `server.ts`.
- **Railway** — two services in one project:
  1. **pocketbase** — `pocketbase.Dockerfile` (`ghcr.io/muchobien/pocketbase:latest`).
     Give it **no public domain**; the API reaches it on the internal network
     (`http://pocketbase.railway.internal:8090`). Set `PB_ADMIN_EMAIL` /
     `PB_ADMIN_PASSWORD` on the service — the image auto-creates the
     superuser; the API's `initPocketBase()` then creates all collections.
     Mount a volume at `/pb_data`. Never publish the PB admin UI (`/_/`).
  2. **api** — `api.Dockerfile` (same as `docker build --target prod .`).
     Needs a public domain (Vercel's rewrite targets it). Mount a volume at
     `/data` and set `UPLOAD_DIR=/data`. Healthcheck: `GET /api/health`.

Required environment variables (set on the Railway **api** service, never in
code):

| Variable | Requirement |
|---|---|
| `POCKETBASE_URL` | internal URL, e.g. `http://pocketbase.railway.internal:8090` |
| `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` | strong, unique; password ≥ 12 chars (same values on both Railway services) |
| `ADMIN_TOKEN` | ≥ 16 chars, high entropy (this is the admin login secret) |
| `APP_URL` | the Vercel https URL (email links + CSRF origin allowlist) |
| `UPLOAD_DIR` | persistent volume path for guest photos (`/data` on Railway) |

The server **refuses to start in production** (`NODE_ENV=production`) if any of
these are missing, too short, or equal to the dev defaults
(`changeme123`, `babyshower-admin-2026`).

Recommended but optional: `THANKYOU_AI_API_KEY` (AI thank-you drafts),
`RESEND_API_KEY` / `TWILIO_*` (email/SMS delivery).

## Built-in protections (all in `server.ts`)

- **Rate limiting** — per-IP sliding window, trusting `X-Forwarded-For`
  forwarded by the Vercel proxy through Railway (`TRUST_PROXY=true`):
  - global 600 req/min/IP
  - failed admin-auth attempts: 10/min/IP (brute-force protection on `/login`)
  - all API POSTs also count against the global budget (guestbook/upload spam)
- **Bot / crawler blocking** — known AI scrapers and SEO crawlers (GPTBot,
  ClaudeBot, CCBot, Bytespider, PerplexityBot, AhrefsBot, MJ12bot, Yandex,
  Baidu, …) get `403` on the API. Search engines are allowed but `robots.txt`
  disallows everything. Toggle with `BLOCK_BOTS=false`.
- **Security headers** — `nosniff`, `X-Frame-Options: DENY`, no-referrer,
  restrictive `Permissions-Policy`, `COOP`/`CORP same-origin`; in production
  also **CSP** (self + Google Fonts + `api.qrserver.com` for QR posters) and
  **HSTS**. Set by `server.ts` on API responses and by `vercel.json` on
  static responses (Vercel serves `index.html` directly).
- **CSRF defense** — mutating API requests (`POST/PUT/DELETE`) are rejected when
  a browser `Origin` header doesn't match the request `Host` **or the
  `APP_URL` origin** (the latter is required behind the Vercel proxy, where
  the browser sends the Vercel origin to the Railway host).
- **Timing-safe admin token comparison** (`crypto.timingSafeEqual`).
- **Payload caps** — JSON bodies capped at 25 MB (default,
  `MAX_BODY_BYTES`); oversized requests get `413` before parsing.
- **Static containment** — the production server only serves files resolved
  inside `dist/`; uploads are served by basename only (no path traversal).
- **Uploads** — extension allowlist (jpeg/png/webp/gif/heic), server-generated
  filenames; served with `nosniff` so stored content can't execute as script.

## Data exposure notes

- The guest day-of surface (`/find-my-table`, `/check-in`) is intentionally
  public — guests reach it via QR codes printed at the event. The roster API
  therefore returns **guest names + 4-digit reservation codes** to anyone.
  Emails, phones, tokens, and dietary notes are scrubbed. If a crawler harvests
  names, that's cosmetic; the rate limits and content-window lock limit damage.
- The **guest content window** (`contentOpenAt`/`contentCloseAt`) already gates
  guestbook + photo uploads to event hours; outside the window guests get 403
  and upload endpoints are inert.
- `ADMIN_TOKEN` is a single shared secret — rotate it (env change + restart)
  if you suspect it leaked. PB admin credentials protect the database layer;
  keep them out of logs; the Railway dashboard is the only place they live.
- Backups: PocketBase `pb_data` lives on the Railway volume; snapshot it
  after the event (guestbook + photos are the irreplaceable data).

## Known dependency finding (tracked)

`npm audit` reports 2 high-severity findings for `react-router` 7.12.0–8.2.0
(GHSA-qwww-vcr4-c8h2 — RSC-mode CSRF). The advisory explicitly states it only
affects apps using the unstable RSC APIs; this app uses plain declarative SPA
mode (`BrowserRouter`/`Routes`, no RSC, no framework mode). As of deployment
there is **no patched release published** (registry latest = 7.18.2, patched
8.3.0 not yet available). Keep `react-router-dom` at latest 7.x and re-run
`npm audit` when 8.3.0+ (or a 7.x backport) ships.
