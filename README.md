# Baby Shower Planner

A bilingual (EN/FR) baby shower planning app I built for my own family's shower, and kept building until it became a real product.

## Why I built this

Planning a baby shower turned out to be a stack of small jobs, each with its own chaos:

- **RSVPs everywhere**: some by text, some by email, some secondhand through another relative
- **Dietary restrictions**: half the guest list has one, and nobody can remember who
- **Seating**: tables arranged on paper, redrawn every time two more people confirm
- **The day itself**: guests arriving and asking where to sit, who's at their table
- **Afterwards**: photos scattered across everyone's phones, thank-you notes left to memory

Spreadsheets and group chats handle one of these well, poorly, and the rest not at all. I wanted one small app that handled all of them, in English *and* French, since our family spans both.

## What it does

**For guests**: no app, no account. Just invitation magic links and day-of QR codes:

- Self-register through the universal invitation link (lands as pending until a host approves)
- RSVP online in a couple of taps
- Log back in with a 4-digit reservation code or by pasting a magic link
- Check in and find their table on the day
- Sign the guestbook and upload photos during the event

**For the host**: everything in one admin dashboard:

- Guest list with live RSVP tracking, pending-registration approval, and bulk invitations by email or SMS
- Catering manifest with dietary restrictions, allergies, and a visual breakdown
- Drag-and-drop floor plan editor and printable escort cards
- Planning agenda with calendar and kanban views, plus per-task reminders
- Urgent alerts broadcast to selected guests
- Gift log and thank-you tracker with AI-drafted messages
- Live guestbook feed and a photo gallery with slideshow
- Check-in tracking
- Event theming and full EN/FR bilingual support throughout
- Rehearsal mode: seed disposable demo data to smoke-test every flow, then clean it up in one click

## From side project to product

What started as a way to survive one afternoon kept growing: real authentication, rate limiting and bot blocking, offline support (PWA), a proper database (PocketBase), automated tests, and a hardened deployment. Somewhere along the way it stopped being a script and became a product: a small, self-hostable baby shower planner I'm genuinely proud of.

I plan to share it more broadly in the future: first as a free tool for friends and family, and eventually as a hosted service anyone can use for their own shower.

## The stack

- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS v4, `motion/react`, React Router v7 (client-side routing)
- **Backend**: a native Node HTTP server (`server.ts`) with security wrappers and per-feature `/api/*` route handlers — no framework
- **Database**: PocketBase (JS SDK, server-side); collections auto-created on first boot
- **State & data**: Zustand for UI state, TanStack Query for server state
- **Forms & validation**: react-hook-form + Zod, with domain schemas as the single source of truth
- **Tables & charts**: TanStack Table (catering manifest), TanStack Virtual (guestbook feed), Recharts
- **Seating & drag-and-drop**: `react-konva` floor plan editor, `@dnd-kit` sortable agenda
- **i18n**: i18next / react-i18next behind a small `useT()` hook; EN/FR everywhere
- **PWA**: `vite-plugin-pwa` for offline support

## Architecture

```
src/
  main.tsx            entry -> src/App.tsx (BrowserRouter + Routes, route-level lazy loading)
  components/
    landing/          guest landing, portal (code/magic-link login), event details, 404
    registration/     universal self-registration form
    rsvp/             RSVP flow + event details card
    guestbook/        guestbook page
    photos/           guest upload + host gallery (lightbox, slideshow)
    seating/          floor plan editor, day-of finder, QR modal, shapes
    admin/            host dashboard (sidebar nav) + tools + login
    shared/           cross-feature UI (Modal, Toast, i18n, form primitives, motion)
    layout/           Header, Footer
  server/             HTTP framework (src/server/http.ts) + per-feature route handlers
  db/                 PocketBase data layer (feature modules + service.ts barrel)
  lib/                validation, date formatting, image compression, API helpers
  stores/             Zustand stores (appStore language, settingsStore)
  translations.ts     EN/FR strings
  themePresets.ts     visual theme definitions
server.ts             native Node server: security wrapping + dispatch + SPA fallback
```

- **Two UI surfaces**: guest pages render without the admin header/nav; the admin surface (`/login`, `/admin`, `/photo-gallery`, `/seating`) shows the header. `/find-my-table` and `/check-in` show only a slim FR/EN bar.
- **Validation**: domain shapes live in `src/lib/domain.ts`; form/payload schemas in `src/lib/validation.ts` derive from them, and PocketBase field defs derive from the same schemas.
- **Theming**: CSS custom properties applied at runtime from `themePresets.ts`.
- **Uploads**: photos arrive as base64 JSON (`POST /api/upload` → `/api/photos/upload`); never multipart.

## Ports

| Service | Port | Notes |
|---|---|---|
| App (frontend + API) | `http://localhost:3025` | Served by one Node process (Vite dev middleware + `/api/*`) |
| PocketBase | `http://localhost:3026` | Admin UI at `http://localhost:3026/_/` |

PocketBase's default port (`8090`) stays inside the Docker container. Nothing listens on `8090` on your machine. If `3025` or `3026` are ever taken on your machine, change the left-hand side of the `ports:` mapping in `docker-compose.yml` (e.g. `3027:8090`).

## Run Locally (Docker Compose, recommended)

**Prerequisites:** Docker with the Compose plugin.

1. Start everything:
   ```sh
   docker compose up -d --build
   ```
2. Open `http://localhost:3025`: collections are auto-created on first boot; the database starts empty.
3. PocketBase admin: `http://localhost:3026/_/`. Superuser `admin@babyshower.com` / `changeme123` (see `docker-compose.yml`).
4. App admin login (`http://localhost:3025/login`): password is `ADMIN_TOKEN` in your `.env` file (default `babyshower-admin-2026`). The **PocketBase** superuser (`admin@babyshower.com` / `changeme123`) is a separate credential for the PB admin UI at `:3026/_/`. Change `ADMIN_TOKEN` in `.env`, then `docker compose up -d`.

Data persists in the `pb_data` volume. To start over: `curl -X POST http://localhost:3025/api/wipe-data -H "x-admin-token: babyshower-admin-2026"` (clears records, keeps event settings).

## Run Locally (native Node)

**Prerequisites:** Node.js 20+ and a PocketBase binary running somewhere reachable.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set:
   - `POCKETBASE_URL` / `VITE_POCKETBASE_URL` → your PocketBase URL (e.g. `http://127.0.0.1:8090` or another port if `8090` is taken)
   - `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` → credentials the app uses to create the superuser and collections
   - `APP_URL` → `http://localhost:3025`
3. Run the app: `npm run dev`

`THANKYOU_AI_API_KEY` powers the AI thank-you drafts (OpenCode Go, default model `deepseek-v4-flash`; any OpenAI-compatible endpoint works via `THANKYOU_AI_BASE_URL`); without it, drafts fall back to a built-in template. `RESEND_API_KEY` / `TWILIO_*` are optional; without them invitations fall back to console logging.

## Guest & Admin Surfaces

Guests never see the admin header/nav. They reach their pages via invitation links and day-of QR codes:

- `/`: landing page (guest login + host login). The register and event-details links are intentionally not advertised here, so they're only reachable from the invitation the host shares.
- `/register`: universal self-registration (optional `?ref=` referrer); new records start **pending** until approved
- `/portal`: guest login — enter the 4-digit reservation code or paste a magic link
- `/event`: event details card (also embedded in the RSVP flow)
- `/rsvp/:token`: reservation / RSVP
- `/find-my-table?guest=<token>`: day-of check-in and table lookup (QR links pre-select the guest)
- `/check-in`: alias of `/find-my-table` so older links and QRs keep working
- `/guestbook` and `/upload-photos`: guestbook and photo uploads, **time-locked**

The guest content window (settings → "Guest Content Window" in the host dashboard) controls when the guestbook and photo uploads open (`contentOpenAt`, defaults to event start) and close (`contentCloseAt`). Outside the window guests see a locked page and the API returns 403; the admin always has access. Admin-only routes (`/admin`, `/photo-gallery`, `/seating`) require the admin password.

## Testing

- Unit / component: `npm test` (Vitest + Testing Library). Includes EN/FR translation integrity tests (key parity, no emoji, symmetric placeholders).
- End-to-end: `npm run test:e2e` (Playwright, `e2e/`) — needs the app on `:3025`.
- Type check + lint: `npm run lint:all`.

## Deploy

```sh
npm run lint:all && npm run build
npm run start
```
