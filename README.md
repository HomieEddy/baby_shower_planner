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

- RSVP online in a couple of taps
- Check in and find their table on the day
- Sign the guestbook and upload photos during the event

**For the host**: everything in one admin dashboard:

- Guest list with live RSVP tracking, bulk invitations by email or SMS
- Catering manifest with dietary restrictions, allergies, and a visual breakdown
- Drag-and-drop floor plan editor and printable escort cards
- Gift log, baby predictions (due date, weight, name guesses), and check-in tracking
- Live guestbook feed and a photo gallery with slideshow
- Thank-you tracker with AI-drafted messages
- Event theming and full EN/FR bilingual support throughout

## From side project to product

What started as a way to survive one afternoon kept growing: real authentication, rate limiting and bot blocking, offline support (PWA), a proper database (PocketBase), automated tests, and a hardened deployment. Somewhere along the way it stopped being a script and became a product: a small, self-hostable baby shower planner I'm genuinely proud of.

I plan to share it more broadly in the future: first as a free tool for friends and family, and eventually as a hosted service anyone can use for their own shower.

## The stack

React 19 + Vite frontend, native Node HTTP backend, PocketBase for storage, Tailwind CSS, Zustand, TanStack Query, and offline support via vite-plugin-pwa.

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

## Testing Email & SMS

Provider keys live in the gitignored `.env` file (docker compose substitutes them into the app container):

| Variable | Where to get it | Notes |
|---|---|---|
| `RESEND_API_KEY` | https://resend.com/api-keys | Sandbox mode (`onboarding@resend.dev` sender) only delivers to the **account owner's verified email** |
| `EMAIL_FROM` | | Default `Baby Shower <onboarding@resend.dev>`; use your verified domain sender if you have one |
| `TWILIO_ACCOUNT_SID` | https://console.twilio.com | |
| `TWILIO_AUTH_TOKEN` | Twilio console | |
| `TWILIO_PHONE_NUMBER` | Twilio console → Phone Numbers | Trial accounts can only send to **verified numbers** |

After editing `.env`, recreate the container so the vars apply:

```sh
docker compose up -d
```

Then in the admin app (`/admin`): add a guest with `delivery_channel` email/text/both (guest email must be your verified address in sandbox/trial mode), and use **Send Invite** / the invitations button. Watch delivery in the app logs: `docker compose logs app -f` (lines tagged `[RESEND]` / `[TWILIO]`). Without keys the same flow logs `[MOCK EMAIL]` / `[MOCK SMS]` and always reports success.

## Guest & Admin Surfaces

Guests never see the admin header/nav. They reach their pages only via invitation magic links and day-of QR codes:

- `/`: landing page (guest/host/event entry buttons)
- `/portal`: guest login — enter the 4-digit reservation code or paste a magic link
- `/event`: event details card
- `/rsvp/:token`: reservation / RSVP
- `/seating?guest=<token>`: floor map
- `/guestbook` and `/upload-photos`: guestbook and photo uploads, **time-locked**

The guest content window (settings → "Guest Content Window" in the host dashboard) controls when the guestbook and photo uploads open (`contentOpenAt`, defaults to event start) and close (`contentCloseAt`). Outside the window guests see a locked page and the API returns 403; the admin always has access. Admin-only routes (`/admin`, `/photo-gallery`) require the admin password.

## Deploy

```sh
npm run lint:all && npm run build
npm run start
```
