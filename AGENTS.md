# AGENTS.md — Bébé Baby Shower Planner

## Stack
- React 19 + TypeScript 5.8 + Vite 6 + Tailwind CSS v4 + `motion/react` (formerly Framer Motion)
- **react-router-dom v7** — client-side routing via `<BrowserRouter>` + `<Routes>`
- **Zustand** — state management (`src/stores/`)
- **@tanstack/react-query** — data fetching (`['admin-overview']` etc.); mutations invalidate queries
- **react-hook-form + @hookform/resolvers** — forms validated with the Zod schemas in `src/lib/validation.ts`
- **i18next / react-i18next** — engine behind `useT()` (`src/components/shared/i18n.ts`); call sites keep the `t.key` API
- **date-fns** — EN/FR date handling in `src/lib/dateUtils.ts`
- **@tanstack/react-table** (v8) — the catering manifest table
- **Recharts** — catering dietary chart + thank-you progress donut
- **@dnd-kit** — sortable schedule timeline in the host settings
- **@tanstack/react-virtual** — virtualized guestbook feed
- **vite-plugin-pwa** — offline support; SW registered in `src/main.tsx`
- **ESLint** (flat config) + `typescript-eslint` + `eslint-plugin-react-hooks`
- Native Node.js HTTP server (`server.ts`) with embedded Vite dev middleware
- **PocketBase** — primary database (server-side via JS SDK)
- Package manager: `npm` (despite `bun.lock` existing)

## Key Commands
|Command|What it does|
|---|---|
|`npm run dev`|Start dev server (Vite + API backend on `:3025`)|
|`npm run build`|Vite build (incl. PWA) + esbuild bundle `server.ts` → `dist/server.cjs`|
|`npm run start`|Run production build|
|`npm run lint`|`tsc --noEmit` (type check only)|
|`npm run lint:eslint`|ESLint on `src/`|
|`npm run lint:all`|Both tsc + ESLint|
|`npm test`|Vitest unit/component tests (`src/**/*.test.ts(x)`)|
|`npm run test:e2e`|Playwright e2e (`e2e/`) — needs the app on `:3025`|
|`docker compose up`|Start dev (app + PocketBase) with hot reload|

## Testing
- Unit/component: Vitest + Testing Library (jsdom). Integrity tests guard translations (EN/FR key parity, no emoji, symmetric placeholders).
- E2E: Playwright (`e2e/smoke.spec.ts`) — guest home, admin login gate + sidebar, guestbook lock. Runs against the dev server (reuses a running one).

## Architecture
- **Entry**: `src/main.tsx` → `App.tsx` with `<BrowserRouter>` and `<Routes>`
- **Stores**: `src/stores/appStore.ts` (language), `src/stores/settingsStore.ts` (event settings)
- **Backend**: `server.ts` — native Node HTTP server handling API + SPA fallback
- **DB**: **PocketBase** (`src/db/service.ts` is the complete data layer using PB JS SDK)
  - `data/db_store.json`, `src/db/index.ts`, `src/db/schema.ts` are **removed** — PocketBase is the only DB
  - `src/lib/pocketbase.ts` — PB client instance (server-side only)
- **Seeder**: removed — no demo data. `initPocketBase()` auto-creates collections on first run; the database starts empty
- **Validation**: Zod schemas in `src/lib/validation.ts`
- **Theming**: CSS custom properties applied via JS (`themePresets.ts`)
- **Uploads**: saved to `public/uploads/` via base64 POST to `/api/upload`

## Project Structure
```
src/
  components/
    admin/      — host dashboard + tools (AdminDashboard with vertical sidebar nav, AdminGuestsTab, AdminSettingsTab, AdminAlertsTab, GuestCheckIn, EscortCardsGenerator, CateringSummaryView, ThankYouTrackerView, AdminLogin)
    seating/    — floor map feature (FloorPlanPage host editor, GuestFinderPage public day-of table lookup, DayOfQrModal, floorPlanHelpers, venueShapes, renderCustomLandmarkShape, useSeatingHistory)
    rsvp/       — reservation flow (RsvpPage, EventDetailsCard)
    guestbook/  — GuestbookPage
    photos/     — photo upload + host gallery (GuestPhotoUploadPage, HostPhotoGalleryPage, PhotoCard, PhotoLightbox, PhotoSlideshow)
    layout/     — Header
    shared/     — cross-feature UI (Modal, ConfirmDialog, ToastContext, EmptyState, motionPresets, ui form primitives, i18n useT hook)
  db/           — PocketBase service (service.ts), no JSON/Drizzle files
  lib/          — utilities: validation, date formatting, image compression, file helpers, PB client
  stores/       — Zustand stores: appStore (language), settingsStore (event settings)
App.tsx         — root component with BrowserRouter + Routes
types.ts        — all TypeScript interfaces
translations.ts — EN/FR translation strings (726 lines)
themePresets.ts — visual theme definitions
```

## API Routes (all under `/api/`)
Guest CRUD, RSVP (token-based), guestbook, photo upload/gallery, floor plan editor, settings, alerts, baby predictions, gift log, database reset/wipe.

## Docker
- **Two services**: `app` (Node dev server) + `pocketbase` (PB server)
- Ports: app on `:3025`, PocketBase admin on `:3026`
- Hot reload: `CHOKIDAR_USEPOLLING=1` for Vite HMR, `tsx watch` restarts on backend changes
- On startup, `initPocketBase()` creates collections if missing (no demo seeding)
- PB volume: `pb_data` named volume for persistence across restarts

## Env Variables
| Variable | Required | Purpose |
|---|---|---|
| `POCKETBASE_URL` | Yes | PocketBase server URL |
| `PB_ADMIN_EMAIL` | Yes | PocketBase superuser email |
| `PB_ADMIN_PASSWORD` | Yes | PocketBase superuser password |
| `THANKYOU_AI_API_KEY` | Yes* | OpenCode Go key for AI thank-you drafts (fallback template without it) |
| `THANKYOU_MODEL` | No | AI model for drafts (default `deepseek-v4-flash`) |
| `THANKYOU_AI_BASE_URL` | No | OpenAI-compatible endpoint (default `https://opencode.ai/zen/go/v1`) |
| `APP_URL` | Yes | Self-referential URL for callbacks |
| `ADMIN_TOKEN` | Yes* | Guards admin API endpoints (`x-admin-token` header); compose sets a default |
| `TRUST_PROXY` | No | Rate limiting trusts `X-Forwarded-For` (default `true` — Coolify proxy) |
| `BLOCK_BOTS` | No | Reject known crawler/AI-scraper UAs on the API (default `true`) |
| `MAX_BODY_BYTES` | No | Max JSON body size (default 25 MB) |
| `UPLOAD_DIR` | No | Persistent volume path for guest photo uploads |

`ADMIN_TOKEN` — the admin login page validates against this value. Leave unset to disable admin protection (not recommended).

Security hardening (rate limits, bot blocking, CSP/HSTS headers, prod secret validation) lives in `server.ts` — see `SECURITY.md` for the deployment runbook. Production refuses to start with missing/weak secrets.

`.env*` is gitignored. Only `.env.example` tracked.

## Conventions
- Bilingual EN/FR throughout — every user-facing string goes through `translations.ts`
- **Two UI surfaces** (split in `App.tsx`):
  - Guest pages (`/rsvp`, `/rsvp/:token`, `/find-my-table`, `/guestbook`, `/upload-photos`) render without the admin header/nav; they are reached only via invitation magic links and day-of QR codes. `/seating` is admin-only (RequireAdmin); the guest finder lives on `/find-my-table` (QR links use `/find-my-table?guest=<token>` to pre-select)
  - Admin surface (`/login`, `/admin`, `/photo-gallery`) renders the header with nav; `/photo-gallery` is behind `RequireAdmin`
- **Guest content window**: settings `contentOpenAt`/`contentCloseAt` (ISO) gate the guestbook and photo uploads — guests get 403 `GUEST_CONTENT_LOCKED` outside the window; admin requests bypass. Guest pages render a locked state with the window times
- Photo uploads go through base64 JSON (`POST /api/upload` → `/api/photos/upload`), never multipart — the server only parses JSON bodies
- `pb.autoCancellation(false)` — the PocketBase SDK cancels concurrent same-key requests, which broke StrictMode double-fetches (random 500s/403s)
- Build order: `npm run lint:all && npm run build` before deploy, no test step defined
- Data wipe via `/api/wipe-data` (clears records, keeps settings; requires `ADMIN_TOKEN`)
- Admin endpoints are guarded by `ADMIN_TOKEN` (header `x-admin-token`); the public seating page uses `/api/floorplan/roster` (guest data with emails/tokens scrubbed)
