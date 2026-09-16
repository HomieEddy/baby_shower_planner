# SaaS Transformation

> Status: **Settled design, not yet implemented.** This document records the
> business proposition, the decisions reached in the grilling session, the gap
> between the current product and a sellable service, and the implementation
> roadmap. It is the source of truth for turning the self-hosted single-event
> app into a hosted, per-event paid product.

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
| Event details page + theme presets | Yes | Yes |
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
| Character/Logo upload | — | Yes |
| Custom domain | — | Yes |
| Keepsake exports (memory book, photo album) | — | Yes |
| Priority support | — | Yes |

Rationale for the line: **RSVP capture must be in Basic.** It is the wedge job
— without it, Basic loses to a free Google Form plus a spreadsheet. Premium
sells the *execution* of the event (seating, catering, day-of, keepsakes) at
the moment the organizer is most invested. Theme presets stay Basic; a logo
upload is the branding step reserved for Premium.

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
