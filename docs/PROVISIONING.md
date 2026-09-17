# Provisioning runbook

How the operator stands up, upgrades and retires one event. The app's deploy
contract (env vars, secret rules, headers) is in `SECURITY.md`; this is the
procedure around it. `docs/SAAS-TRANSFORMATION.md` §16.7 is the design record.

Each event is one deploy: one slug, one PocketBase database, one admin secret.
There is no tenant identifier anywhere — the slug *is* the deployment identity.

## The host

**One VPS running Docker Compose.** Every event is a slug-scoped Compose project
(`-p <slug>`) on that host: its own containers, its own `pb_data` and `uploads`
volumes. Nothing is published on a host port — a single Traefik reverse proxy is
the only way in and discovers each event from labels.

### One-time host setup

1. **Docker + Compose** on the VPS.
2. **The edge network**, shared by the proxy and every event:
   ```bash
   docker network create edge
   ```
3. **Traefik**, once, joined to `edge`, with Cloudflare DNS-01 for the wildcard
   certificate:
   ```yaml
   # deploy/traefik/docker-compose.yml (host-level, not per event)
   services:
     traefik:
       image: traefik:v3
       restart: unless-stopped
       ports: ["80:80", "443:443"]
       environment:
         - CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock:ro
         - letsencrypt:/letsencrypt
         - ./traefik.yml:/etc/traefik/traefik.yml:ro
       networks: [edge]
   networks:
     edge: { external: true }
   volumes:
     letsencrypt:
   ```
   ```yaml
   # deploy/traefik/traefik.yml
   entryPoints:
     web:
       address: ":80"
       http: { redirections: { entryPoint: { to: websecure, scheme: https } } }
     websecure:
       address: ":443"
   providers:
     docker:
       exposedByDefault: false
       network: edge
   certificatesResolvers:
     cloudflare:
       acme:
         email: you@example.com
         storage: /letsencrypt/acme.json
         dnsChallenge: { provider: cloudflare }
   ```
   `CF_DNS_API_TOKEN` is a Cloudflare token with `Zone:DNS:Edit` on the event
   domain. Bring it up with `docker compose -f deploy/traefik/docker-compose.yml up -d`.
4. **DNS** — a wildcard `*.<domain>` A record to the VPS, so `<slug>.<domain>`
   resolves without a per-event step.
5. **Sending domain** — a verified Resend domain with SPF/DKIM. Without it the
   welcome email and every invitation land in spam.

`PROVISION_DOMAIN` is the domain those events live under. Pass it as `--domain`,
or set the env var. An empty or malformed domain is refused before anything is
written.

### How an event reaches the proxy

`docker-compose.prod.yml` joins `edge` and carries Traefik labels built from the
event env (`SLUG`, `PUBLIC_DOMAIN`): a router for `Host(<slug>.<domain>)`, TLS
from the `cloudflare` resolver, and the wildcard `*.<domain>` in the cert's SANs.
Traefik picks it up the moment the stack comes up — **no per-event proxy config**.

The repo also ships `docker-compose.yml`, the **development** stack
(`NODE_ENV=development`, a bind mount, the Vite dev server). A live event never
uses it; the provisioner defaults to `docker-compose.prod.yml`.

## Provision one event

From the repo root, with checkout data (slug, plan, owner email, event date,
language):

```bash
npx tsx scripts/provision.ts \
  --slug smith-shower --plan Basic --owner owner@example.com \
  --date 2026-09-15 --language EN --domain events.example
```

Under bash you can also use `npm run provision -- <args>`; PowerShell's npm shim
swallows the `--`, so use the direct form there.

The command, in order:

1. **Generates** the event's own `ADMIN_TOKEN` and PocketBase admin password,
   sized to clear the production secret rules. Two events never share a secret.
2. **Writes** `deploys/<slug>.env` (gitignored — it holds secrets).
3. **Appends** a record to `deployments.json` (gitignored — it holds owner PII).
   A slug already in the registry is refused before anything is written.
4. **Brings up** the stack: `docker compose -f docker-compose.prod.yml -p <slug> --env-file deploys/<slug>.env up -d --build`.
   The slug is the compose project name, so per-event containers and the
   `pb_data`/`uploads` volumes do not collide on a shared host. The event's env
   supplies every secret the stack reads (`PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD`
   included), and the stack joins `edge`, where Traefik finds it from its labels.
5. **Seeds settings** through the admin API: the event title (derived from the
   slug), the date, the default language and the host email. It waits for
   `GET <api-url>/api/health` first — so the wildcard DNS and the proxy must
   already be up.
6. **Delivers the welcome email** to the owner through Resend, or prints it when
   no provider is configured.

Useful flags:

| Flag | Why |
|---|---|
| `--dry-run` | Print the env, registry record and welcome message; touch nothing. Use this to review before a real run. |
| `--api-url <url>` | Seed through a different base URL (default: the event's own URL). |
| `--no-up` | Write the artifacts without touching Docker (a host where you start the stack yourself). |
| `--compose <file>` | Use another compose file (default `docker-compose.prod.yml`; pass `docker-compose.yml` for a local dev stack). |
| `--registry <file>` | Keep the registry somewhere other than `deployments.json`. |

### After it returns

- Confirm the deploy answers: `curl https://<slug>.<domain>/api/health`.
- Confirm the event renders with its name and language at `https://<slug>.<domain>/`.
- Confirm Traefik registered the event and issued (or reused) the wildcard cert:
  its log or dashboard should show a router for `<slug>.<domain>`.
- Check the organizer received the welcome email (or send the printed one).

## Where secrets live

- `deploys/<slug>.env` — the event's `ADMIN_TOKEN` (the admin login secret) and
  `PB_ADMIN_PASSWORD` (the PocketBase superuser, database-layer only). Never
  committed; never print the PocketBase password. `PB_ADMIN_EMAIL` is an
  operator-owned address (`admin@<domain>`), never the organizer's.
- `deployments.json` — a versioned document (`{ "version": 1, "deployments": [...] }`).
  Each record is slug, plan, owner email, event date, language, dates. Owner PII;
  never committed. A file written by a future version is refused, not misread.
- The **welcome email carries only the admin password** (the `ADMIN_TOKEN`), and
  it is the only place that password is sent. It is not stored in plain text
  anywhere but the env file. The PocketBase superuser password is never emailed.

## Upgrade an event

The event's data lives in the `pb_data` volume; the code is the image. An upgrade
replaces the image without touching the volume or the env:

```bash
git pull
docker compose -f docker-compose.prod.yml -p <slug> --env-file deploys/<slug>.env up -d --build
```

Rules:

- **Never regenerate the event's secrets.** Re-running the provisioner for an
  existing slug is refused; an upgrade is a rebuild, not a re-provision.
- **Never delete the `pb_data` volume** — that is the guestbook, photos and every
  RSVP.
- Take a volume snapshot before an upgrade you are unsure about (`SECURITY.md`,
  Backups).

## Custom domain

- DNS and TLS: covered by the wildcard `*.<domain>` record and the proxy's
  wildcard certificate — a new event needs nothing.
- Reverse proxy: the event registers itself through its Traefik labels. No
  per-event config; the app trusts `X-Forwarded-For` (`TRUST_PROXY=true`) and its
  CSRF check accepts `APP_URL` as the origin, both assuming the proxy fronts it.
- A per-event record or certificate is only needed if you did not set the
  wildcard.

## The public demo

The demo is one ordinary deploy with two switches, stood up once (§11):

```bash
npx tsx scripts/provision.ts \
  --slug demo --plan Premium --demo \
  --owner you@example.com --date 2027-01-01 --language EN --domain events.example
```

`--demo` renders `DEMO=true` into the event env. On boot the app seeds rehearsal's
demo content into that deploy's own database (idempotently — a restart does not
duplicate it) and refuses every guest mutation with `DEMO_READ_ONLY`, while reads
and the operator's admin routes stay open. Guest surfaces carry a demo banner.

It is a Premium deploy, so every surface renders; the demo flag — not the tier —
is what makes it a demo. Guests reach it at `https://demo.<domain>`.

## Teardown at retention

§7: destroy the deployment ~90 days after the event unless the organizer pays to
keep it. The registry's `retentionDate` is the event date + 90 days — read it
from `deployments.json` to know when an event is due.

Destroying the deploy is the deletion mechanism (§8). Do all four:

```bash
docker compose -f docker-compose.prod.yml -p <slug> down -v   # containers + volumes
rm deploys/<slug>.env                                         # the event's secrets
# remove the <slug> entry from deployments.json
# (no proxy config to remove — Traefik drops the router with the container)
```

The `-v` is what deletes the data: the `pb_data` volume holds every guest
record, guestbook entry and photo. Confirm with the organizer before running it.

## Related

- `SECURITY.md` — deploy targets, required env vars, secret rules, built-in
  protections, backups.
- `docs/SAAS-TRANSFORMATION.md` §7 (lifecycle and retention), §12 (support),
  §16.4–§16.8 (onboarding and provisioning design).
