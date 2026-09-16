# SaaS Transformation

> Status: **Settled design, implementation starting.** This document records the
> business proposition, the decisions reached in the grilling session, the gap
> between the current product and a sellable service, and the implementation
> roadmap. It is the source of truth for turning the self-hosted single-event
> app into a hosted, per-event paid product.
>
> Implementation happens on the `saas-dev` branch, which deploys nowhere.
> §1–§15 cover the business and the product gaps; **§16 covers the landing page,
> the onboarding flow, and the split between the product brand and the event
> brand**.

---

## 1. Executive summary

**One line:** a hosted, deploy-per-event **baby-shower planner for the
organizer** — bilingual EN/FR — sold as two one-time tiers on top of the app
that already exists.

The current codebase is a deep, single-event tool: 10 admin tabs, a full guest
RSVP + self-registration flow, seating, catering, guestbook, photos, gifts,
AI-drafted thank-yous, and a bilingual PWA. What it lacks is an entire
**business layer**: no host accounts, no way to onboard a paying stranger, no
pricing, no payment, no event lifecycle, no privacy artifacts, no analytics.

The transformation is therefore less about new planning features and more about
**wrapping the existing product in commerce, provisioning, and trust**. The
first paying customer is reachable with a deliberately small Phase 0.

---

## 2. The proposition

Stated as a promise to the customer:

> Plan your whole baby shower in one link. Collect RSVPs, handle dietary needs,
> arrange the seating, run the day, gather the photos and messages, and send
> the thank-yous — in English or French — for a single one-time price, less
> than a caterer's deposit.

**Why it can win:**

- **Niche depth, not breadth.** Competitors are generic event tools or
  spreadsheets. This one does the specific baby-shower jobs end to end.
- **Bilingual EN/FR is a real moat.** Already fully implemented; generic tools
  treat translation as an add-on. Strong in Canada (Québec) and France.
- **The guest experience is frictionless.** No app, no account — magic links
  and day-of QR codes. That is what makes guests actually RSVP and upload.
- **A built-in viral loop.** Guest-to-guest invitation attribution already
  exists; every guest is exposed to the product at its best moment.

**What it is not:** a general event platform, a wedding suite, or a
self-serve free tool. Focus is the strategy.

---

## 3. Customer

| Role | Who | Relationship |
|---|---|---|
| **Buyer / customer** | The **organizer** — friend, sibling, colleague, or the parent themselves | Feels the pain, holds the wallet, uses the admin dashboard |
| **Honoree** | The parent-to-be | Their details are **event data** (already stored in `settings`), not an account |
| **Guest** | Invitees | No account; reach pages via magic link / QR code |
| **Caterer / staff** | Venue catering | Consumes the printable catering manifest; not a product user |

Professional event planners are explicitly **out of the wedge**; revisit only if
B2B demand appears (see §14).

---

## 4. Positioning

- **Scope: baby shower only.** Adjacent milestone events (gender reveal,
  baptism, bridal shower, first birthday) are a *later* expansion, only after
  distribution in the niche is proven.
- **Two tiers, one-time price.** No free tier, no subscription, no guest cap.
- **The public demo is the top of funnel** — organizers must be able to feel
  the seating and guestbook before buying (see §11).

---

## 5. Business model

### 5.1 Delivery model — deploy-per-event

Each paid event is its own deployment of the app + PocketBase, reached at:

```
https://<slug>.<yourdomain>/
```

- **Provisioning:** a script takes `slug`, `plan`, and owner email, then stands
  up a Docker Compose stack (app + PocketBase), sets the per-event env, and
  points a reverse proxy at it. First ~20 events can even be done with a
  documented manual runbook plus a deployment registry (a spreadsheet or a tiny
  JSON file). **Do not build a control plane yet.**
- **Custom domain is a Premium feature** — CNAME + TLS handled by the operator.
- **Why this model first:** it matches the current architecture exactly (one
  global `settings` row, one `ADMIN_TOKEN`), so it needs *zero* multi-tenancy
  refactor. It also gives each event an isolated PocketBase database — a
  privacy win (see §8): retention and "delete my data" collapse into
  "destroy the deploy."
- **Known ceiling:** per-event provisioning and upgrades are **manual ops**.
  That is acceptable until volume, not hardware, is the bottleneck.

### 5.2 Tiers

No free tier. No guest limit on either tier.

| | **Basic — $29 CAD** | **Premium — $69 CAD** |
|---|---|---|
| Positioning | The "who's coming" job | The whole event, all-in |
| Guest list, guest CRUD | Yes | Yes |
| Shareable invitation magic links | Yes | Yes |
| **RSVP capture** (attending/declined, party size, dietary) | Yes | Yes |
| Guest self-registration queue | Yes | Yes |
| Event details page + theme presets + event title | Yes | Yes |
| CSV guest import / export | Yes | Yes |
| Bulk email/SMS invitations & reminders | — | Yes |
| Catering manifest + dietary breakdown | — | Yes |
| Floor plan / seating (2D + 3D) + auto-seating | — | Yes |
| Escort cards / name badges | — | Yes |
| Day-of check-in + find-my-table | — | Yes |
| Digital guestbook | — | Yes |
| Photo uploads + host gallery + slideshow + ZIP | — | Yes |
| Gift log + AI-drafted thank-yous + sending | — | Yes |
| Agenda / tasks + reminders | — | Yes |
| Broadcast alerts | — | Yes |
| Brand kit: logo upload + invitation background image | — | Yes |
| Custom domain | — | Yes |
| Keepsake exports (memory book, photo album) | — | Yes |
| Priority support | — | Yes |

Rationale for the line: **RSVP capture must be in Basic.** It is the wedge job
— without it, Basic loses to a free Google Form plus a spreadsheet. Premium
sells the *execution* of the event (seating, catering, day-of, keepsakes) at
the moment the organizer is most invested. Event title, theme presets and the
event's default language stay Basic: an event is unusable to its own organizer
without them. The brand kit — logo and invitation background image — is the
branding step reserved for Premium.

### 5.3 Payment

- **Stripe**, one-time, **charged up front at event creation** (the operator
  pays to host each deploy; do not carry that risk).
- **Refund window:** 7 days if the event is unused.
- **No stored cards, no subscription.** A shower is a one-off that ends in an
  afternoon; subscriptions have brutal churn and mismatch how customers think.

### 5.4 Upgrade path

- **Upgrade anytime, pay only the difference**, from the host dashboard via
  Stripe. No penalty.
- Natural trigger: RSVPs close and the organizer suddenly needs seating and
  catering. Surface a persistent "Upgrade to Premium" with the delta price.
- Premium → Basic downgrades are not offered.

### 5.5 Gating mechanics

- **One codebase, a `plan` flag** set at provisioning (stored on the `settings`
  row or a dedicated entitlements record). No separate builds.
- **Host dashboard shows all tabs**, with Premium ones **locked + upgrade
  CTA**. Visible-but-locked converts; hidden does not.
- **Guests never see upgrade prompts.** On a Basic event the Premium guest
  pages (seating, guestbook, photos) are simply absent/disabled with a neutral
  "not available for this event" state.

---

## 6. Feature-entitlement matrix (current features)

Everything below already exists. The transformation adds gating, not the
features themselves.

| Area | Feature | Tier |
|---|---|---|
| Guest mgmt | Add/edit/delete guest, search, status/source filters, metric cards | Basic |
| Guest mgmt | CSV batch import / export | Basic |
| Guest mgmt | Magic-link copy, universal `/register` link + message | Basic |
| Guest mgmt | Self-registration approval queue | Basic |
| RSVP | RSVP capture (party, dietary, contact), invite-a-guest | Basic |
| Guest pages | Landing, guest portal (code/magic link), event details | Basic |
| Theming | Theme presets / custom theme | Basic |
| Comms | Bulk email/SMS invitations, reminders | Premium |
| Catering | Manifest, dietary breakdown, chart, CSV/print | Premium |
| Seating | 2D/3D floor plan, drag-drop, auto-seating, escort cards | Premium |
| Day-of | Check-in, find-my-table, QR cards | Premium |
| Guestbook | Submit, live feed, moderation | Premium |
| Photos | Guest upload (quota), host gallery, moderation, ZIP, slideshow | Premium |
| Gifts | Gift log, AI thank-you draft, send, tracker | Premium |
| Agenda | Tasks, Kanban/Calendar, reminders | Premium |
| Alerts | Broadcast templates, audience targeting, history | Premium |
| Branding | Logo/character upload | Premium |
| Domain | Custom domain | Premium |
| Keepsake | Memory-book + photo-album exports | Premium |

---

## 7. Event lifecycle & data retention

Today an event never ends and data lives forever. Introduce an explicit
lifecycle:

```
pre-event  →  day-of  →  post-event  →  archived  →  deleted
```

- **pre-event:** RSVPs, planning, seating, catering.
- **day-of:** check-in, find-my-table, guestbook and photo uploads open inside
  the existing guest content window (`contentOpenAt` / `contentCloseAt`,
  `src/db/settings.ts:21-36`).
- **post-event:** at content close **+14 days**, prompt the organizer to
  download keepsakes — printable guestbook memory book, photo album, guest CSV,
  gift log. This is the **second monetization moment**: peak emotion, and
  everything needed to serve it (guestbook + photo ZIP) already exists.
- **archived → deleted:** unless the organizer pays to keep the event, destroy
  the deployment at **~90 days**. Per-event deploys make this a clean
  operation, and it is the retention story for §8.

Retention must be stated in plain language at checkout and in the privacy
policy.

---

## 8. Privacy, legal & compliance

The product stores guest **names, emails, phones, and dietary/allergy** data,
and targets a bilingual market (France, Canada, Québec). Charging money on that
without the following is legally exposed under **GDPR / PIPEDA / Québec Law 25**.

Required before the first paid event:

- **Privacy policy** — plain-language, EN/FR, naming what is collected, why,
  and for how long.
- **Data Processing Agreement (DPA)** template for the organizer.
- **Retention schedule** — codified from §7 (event data purged at ~90 days).
- **Guest "delete my data" path** — a guest-accessible request route.
- **Host bulk export / erase** — already partially present via CSV export and
  `/api/wipe-data`; formalize as a self-serve "erase this event" action.
- **Allergy data is the sharp edge** — collect it only with a stated purpose,
  never reuse it, and delete it on the retention clock.
- **Deploy-per-event is a privacy asset** — destroying the deploy destroys the
  data; say so in the policy as the deletion mechanism.
- **No third-party assets ship with the product.** Every guest-facing visual is
  either app-owned code (CSS/SVG) or content the organizer uploaded. This keeps
  the product free of any asset whose licence does not permit commercial
  redistribution, and it is why the bundled illustration set was deleted rather
  than replaced (§16.6). Re-check this rule before adding any stock art,
  illustration pack, or icon set to the guest surface.

---

## 9. Measurement & observability

There is currently **no analytics and no error monitoring** — running a paid
business blind. Add, consistent with the CSP that blocks third parties
(`src/server/http.ts`):

- **Privacy-friendly, first-party analytics** (e.g. self-hosted
  Plausible/Umami) on the marketing site and the app, tracking at minimum:
  demo view → checkout start → paid event → Premium upgrade.
- **Error monitoring** (e.g. Sentry-style) on both the server and the client,
  self-hosted or same-origin to respect the CSP.
- **No Google Analytics** — it contradicts the privacy posture the business
  needs.

North-star metric: **paid events per month**; secondary: **Basic → Premium
upgrade rate** and **keepsake conversion**.

---

## 10. Gap analysis — current state vs. target

Ranked by severity. "Blocks revenue" means no first paying customer until done.

| # | Gap | Current state | Severity |
|---|---|---|---|
| 1 | **No entitlements / payment** | Nothing distinguishes Basic from Premium; no Stripe anywhere | Blocks revenue |
| 2 | **Mock email/SMS report success** | Without keys, transports log `[MOCK …]` and return `true`; UI hides unconfigured channels via `/api/capabilities` (`src/lib/email.ts:18-33`, `src/lib/sms.ts:22-39`, `src/lib/capabilities.ts:11-29`, `src/server/routes/system.ts:25-30`). Premium's bulk invitations are not real until the operator owns send infra + deliverability (SPF/DKIM). | Blocks the core promise |
| 3 | **No plan / provisioning layer** | One global `settings` row (`src/db/settings.ts:7-11`) + one shared `ADMIN_TOKEN` (`server.ts:62-66`); no per-event slug, plan, or domain | Blocks onboarding |
| 4 | **No lifecycle / archive / retention** | Events never end; data lives forever; keepsake upsell unbuilt | Legal + lost revenue |
| 5 | **No privacy artifacts** | No policy, DPA, consent, retention schedule, or delete path | Legal |
| 6 | **No ToS / refund / SLA / support surface** | Undefined ops for a per-event deploy the operator hosts | Trust / ops risk |
| 7 | **No analytics / error monitoring** | None anywhere | Growth blind |
| 8 | **No top of funnel** | No marketing site, SEO pages, or demo deploy | No acquisition |
| 9 | **Guest email deliverability** | Unowned domain, SPF/DKIM, warmup | Operational |
| 10 | **Basic tier doesn't exist** | No `plan` flag or gating; all Premium features reachable | Product work |

Supporting facts: collections carry no owner/tenant field
(`src/db/collectionDefs.ts:62-72`, `src/lib/domain.ts:90-229`); per-guest photo
quota is 12 photos / 24 MB (`src/db/photos.ts:12-14`); rehearsal mode
(`src/db/rehearsal.ts`) seeds and cleanly removes disposable demo data — the
basis for the public demo.

### 10.1 Landing, onboarding & identity gaps

Found in the landing/onboarding review, ranked separately from §10 above. §10
ranks what is missing to *sell* the product; this ranks what is missing for a
stranger to *run* it. Every row here must be closed before the first paying
event is handed over.

| # | Gap | Current state | Severity |
|---|---|---|---|
| 11 | **App identity is the founder's, not the event's** — the tab title, PWA name, header, login page and app icon name the product on every customer's deploy | `index.html:6`, `vite.config.ts:16-27`, `public/icon.svg`, `Header.tsx:65`, `AdminLogin.tsx:46,95` | Blocks onboarding |
| 12 | **No first run** — no create-event step; `GET /api/settings` throws (500) on an unseeded event | `src/db/settings.ts:19-22`, `src/server/routes/settings.ts:16` | Blocks onboarding |
| 13 | **Public data leaks on a live deploy** — `/api/rehearsal` hands out a guest name and magic token while active; `/api/alerts` returns host-internal fields; `/api/floorplan` serves the whole plan to guests | `system.ts:58-62`, `rehearsal.ts:253-257`, `alerts.ts:9-13`, `floorplan.ts:14-18` | Blocks onboarding (trust) |
| 14 | **The admin login is advertised to guests** on the event landing, behind one shared secret | `LandingPage.tsx:51`, `server.ts:67-80`, `AdminLogin.tsx:30` | Blocks onboarding (trust) |
| 15 | **The invitation card is hardcoded and its art is third-party** — a literal "Baby Shower" arch, 5 fixed PNGs plus a watercolour background (~5 MB on the RSVP page) | `EventDetailsCard.tsx:147-177,213`, `ArtworkElements.tsx:16-72`, `public/artwork/` | Product + legal |
| 16 | **Guest copy is the founder's event** — a real date, "View Amazon Baby Registry", placeholder names | `translations.ts:2016`, `:1983-1984` | Product |
| 17 | **Theming is four tokens over a light-mode-only class remap** — several hundred hardcoded hexes escape it entirely | `index.css:98-205`, `themePresets.ts:16-157` | Product |
| 18 | **Outbound mail is sent as the founder** from Resend's sandbox domain, with "Baby Shower" hardcoded in subjects and bodies | `email.ts:18`, `compose.ts:61-62,117-118,190,228` | Blocks the core promise |
| 19 | **No per-event default language** — guests land in whatever the last visitor toggled | `index.html:2`, `src/stores/appStore.ts` | Cosmetic |
| 20 | **Downloads leak the old brand** — `bebe-*-qr-*.png`, `Baby_Shower_Photos.zip`, `baby_shower_guests_*.csv` | `DayOfQrModal.tsx:56`, `HostPhotoGalleryPage.tsx:105,114,315` | Cosmetic |
| 21 | **`logout()` is dead code** — no way to end a session | `src/lib/api.ts:18-20` | Cosmetic |

---

## 11. Growth & acquisition

- **SEO + content first.** "Baby shower planner / organisateur de baby shower"
  is a low-competition niche; the product already owns the long tail
  (printable escort cards, seating, bilingual).
- **Pinterest/Instagram second.** Visual, and dominant for baby showers.
- **The guest invite loop as accelerant, not foundation.** Guest-to-guest
  invitation attribution already exists; surface it as a growth feature.
- **Public demo deploy.** Publish a permanent, no-signup, read-only demo event
  built from rehearsal mode, clearly labelled, linked from the marketing site.
  "Try the full planner here" is the strongest sales asset for a visual niche
  product and costs almost nothing to ship.
- **No paid ads** until organic funnel data exists (§9).

---

## 12. Support & operations

Deploy-per-event makes the operator the on-call. Commit in writing at checkout:

- **Email-only, best-effort, business hours.**
- **Premium gets priority** (same-day target); Basic is best-effort.
- **Refund policy** stated (7-day unused).
- Document the runbook for provisioning, upgrades, custom-domain setup, and
  deployment teardown at retention.

---

## 13. Implementation roadmap

### Phase 0 — to take the first dollar

1. **Platform-owned email/SMS** — verified sending domain, SPF/DKIM, real
   Resend + Twilio keys; stop relying on the mock path for Premium comms.
2. **Entitlements** — `plan` field + a single `hasEntitlement(plan, feature)`
   helper consumed by both UI and server; gate Premium tabs (locked + upsell)
   and Premium guest routes.
3. **Stripe one-time checkout** at event creation + refund window handling.
4. **Provisioning script** — Docker Compose per event, slug subdomain,
   reverse-proxy wiring; deployment registry (spreadsheet/JSON is fine).
5. **Privacy policy + ToS + retention + delete/export flows.**

### Phase 1 — first ~20 customers

6. **Marketing site + SEO/Pinterest pages.**
7. **Public demo deploy** (rehearsal mode made public/read-only).
8. **Analytics + error monitoring.**
9. **Upgrade-by-difference** flow.
10. **Keepsake export + post-event archive automation.**

### Phase 2 — only if volume justifies

11. **Automated provisioning / minimal control plane.**
12. **Invitation design / template generator** (see §14).
13. **Registry import — Babylist / Amazon** (see §14).
14. **Multi-tenant refactor (accounts)** — only when provisioning ops, not
    hardware, is the bottleneck.

### Value-add features to implement

These extend the product beyond closing gaps, and are explicitly in scope:

- **Invitation design / template generator.** The app already generates escort
  cards and name badges with print layout and QR codes; extending that engine
  to printable/digital **invitations** (theme-matched to the event, EN/FR) is
  cheap and highly valued by this audience. **Premium.**
- **Registry import — Babylist / Amazon.** Pull gift-registry items into the
  gift log so the host does not hand-enter them, feeding the thank-you tracker
  automatically. **Premium.**

---

## 14. Risks, assumptions & deferred decisions

**Risks**

- **Manual provisioning doesn't scale.** Mitigation: script + registry first;
  automate at Phase 2. The model's ceiling is ops time, not code.
- **Acquisition is unproven.** The niche may be too small or too seasonal.
  Mitigation: ship SEO + demo early and instrument the funnel before building
  Phase 2.
- **Deliverability.** A young sending domain without warmup lands in spam.
  Mitigation: own the domain, warm it, and keep Basic's shareable links as a
  working fallback.
- **One-time pricing yields no recurring revenue.** Accepted trade-off;
  keepsake and premium add-ons are the incremental path.

**Assumptions**

- Organizers will pay a one-time fee rather than use a free spreadsheet.
- The organizer, not the honoree, is the buyer.
- Deploy-per-event is operationally tolerable for the first ~20 events.

**Deferred / decided-not-now**

- Multi-tenancy and host accounts (Phase 2 at the earliest).
- Generalizing beyond baby showers.
- Subscription pricing.
- Repeat-event / loyalty program (revisit only if professional planners appear).
- Referral program for organizers (the existing guest-invite loop is enough for
  now).

---

## 15. Glossary

Domain terms follow `CONTEXT.md`; use them exactly.

- **Event** — one baby shower, one deploy, one PocketBase database, one `plan`.
- **Organizer / host** — the buyer and admin user of an event.
- **Honoree / parent** — the celebrated party; event data, not an account.
- **Guest** — an invitee; no account; reaches pages by magic link or QR code.
- **Basic / Premium** — the two one-time tiers (see §5.2).
- **Attendee**, **Split**, **Seat**, **Table Assignment** — see `CONTEXT.md`.

---

## 16. Landing page & onboarding

Added after the landing/onboarding review. §1–§15 describe the business and the
product gaps. This section describes how a stranger becomes a paying organizer,
and where the product brand and the event brand each live.

### 16.1 Two surfaces, two brands

Deploy-per-event means two surfaces with two owners of the visual identity:

- **The marketing site** owns the *product* brand. It is a separate static
  deploy at the root domain, with its own build, and it is the only place the
  product names itself.
- **The event app** owns the *event's* identity. It never advertises the product
  beyond a discreet footer credit. A customer's deployment must say *their*
  event, not ours — in the tab title, the PWA name, the header, the login page
  and the app icon (§10.1 #11).

Treat the event app as a white-label artefact. Anything that names the product
inside it is a bug.

### 16.2 The event landing page (guest-facing)

`/` on an event deploy is the *event's* landing, not the product's, and stays
guest-facing:

- Names the event from settings (title, honoree, date, venue) — never the
  product.
- Two calls to action for guests (open invitation, find my table) and no host
  entry point: the admin login moves off the landing page entirely (§10.1 #14).
  The host reaches `/admin` from the welcome email instead.
- Carries an event-branded document title and social preview, so a shared link
  reads as the event rather than as the product.

### 16.3 The marketing site (separate deploy)

A standalone static site — its own directory, its own Vercel project, no shared
build with the app. Plain HTML/CSS/JS in EN and FR: a framework is not worth a
build step at this page count, and hand-written pages are what crawlers want.
Sections: hero → live demo of a real event → two-tier pricing → FAQ → CTA.
Content follows §11 — SEO first, no paid ads until there is funnel data.

Its job is acquisition and checkout. It is *not* a second copy of the app.

### 16.4 Onboarding: stranger → paying organizer

```
marketing site → pricing → checkout → payment received
   → provisioning (operator) → welcome email
   → first-run wizard → invite guests → (upgrade) → post-event keepsakes
```

- **Checkout** collects the organizer's email, a preferred slug, the event date
  and the plan. Everything after it is an operator action in the hybrid phase
  (§5.1, §16.5).
- **Provisioning** stands up the event's stack and seeds its settings from the
  checkout data, so the organizer's first login is a real, named event and never
  an empty shell (§10.1 #12, §16.7).
- **Welcome email** carries the event URL, the admin URL and the generated admin
  password. It is the only place that password is ever sent.
- **First-run wizard** completes what checkout could not know (§16.6).
- The rest of the journey is the product: invite guests, run the event, upgrade,
  keep the keepsakes.

### 16.5 Payment in the hybrid phase

Take the money first, provision by hand, and **do not build a control plane**
(§5.1). Concretely: **Stripe Payment Links**, one per tier, with custom fields
for slug and event date, and a success page stating that the event link arrives
within 24 hours. No webhook, no checkout code, no backend — until provisioning
itself is automated, an automated checkout only manufactures work for the
operator.

An upgrade is a second Payment Link for the price difference (§5.4).

### 16.6 First run & customization

**First run.** Provisioning seeds the event, so the wizard exists for the
unseeded case (an event with no settings row). `GET /api/settings` must return
"no settings" rather than erroring, and the host dashboard must render a setup
wizard instead of a broken dashboard. The wizard writes the first settings row
and nothing else.

**Customization.** The rule is that an organizer can make the event look like
theirs without us shipping a single third-party asset:

| Layer | Tier | Notes |
|---|---|---|
| Event title | Basic | Replaces the hardcoded "Baby Shower" arch and headings |
| Theme preset / custom colours + font | Basic | Already implemented (§6) |
| Default language | Basic | EN or FR per event |
| Logo upload | Premium | Replaces the app icon and header mark |
| Invitation background image | Premium | Replaces the watercolour background |

**No bundled artwork.** The illustration set that shipped the baby-shower art
was **deleted, not replaced** (§8): it was third-party art whose licence does
not clearly permit commercial redistribution. The invitation card is decorated
by theme-driven CSS alone — arch border, dot texture, gradient — and organizers
supply their own imagery. If the bare card later reads as too plain, the
replacement is **self-authored SVG** tinted by the theme accent, never stock
art.

### 16.7 Provisioning runbook

For the first ~20 events: a script and a registry, not a platform.

- A **provisioning script** takes slug, plan, owner email, event date and
  language; generates that event's secrets (notably a unique `ADMIN_TOKEN`,
  never the compose default); writes the event's env; brings up the stack; seeds
  settings through the API; and prints the admin credentials for the welcome
  email.
- A **deployment registry** (a small JSON file or a spreadsheet) records slug,
  plan, owner, date provisioned and retention date — the retention clock in §7
  runs off it.
- The **runbook** documents provisioning, upgrades, custom-domain setup and
  teardown at retention (§12).

### 16.8 Open decisions and milestones

**Blocked on the operator, not on code:**

1. **Hosting target** — one VPS running Docker Compose with a reverse proxy
   handling `<slug>.<domain>`, versus one platform service per event.
2. **Domain, DNS and TLS** — including a wildcard certificate for slug
   subdomains.
3. **Sending domain with SPF/DKIM** (§10 #9) — without it invitations land in
   spam, and invitations are Premium's core promise.

**Milestones**

| | Deliverable | Gate |
|---|---|---|
| M1 | The app stops being the founder's app: event title, theme, language, logo and background all come from settings; artwork deleted; first run works; hardcoded guest copy removed | A stranger's event looks like theirs |
| M2 | Trust fixes: public read leaks closed, admin login off the guest landing, per-deploy secret, `logout()` wired | No guest data exposed |
| M3 | Provisioning script, registry, runbook, welcome email | One real organizer's event live |
| M4 | Marketing site and checkout, separate deploy | Money can arrive |
