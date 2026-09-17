# Provisioning runbook

How the operator stands up, upgrades and retires one event. The app's deploy
contract (env vars, secret rules, headers) is in `SECURITY.md`; this is the
procedure around it. `docs/SAAS-TRANSFORMATION.md` §16.7 is the design record.

Each event is one deploy: one slug, one PocketBase database, one admin secret.
There is no tenant identifier anywhere — the slug *is* the deployment identity.

## Before the first event

These are operator decisions, not code, and they are prerequisites for a real
event (§16.8):

1. **Host** — one VPS running Docker Compose behind a reverse proxy, or one
   platform service per event. The commands below assume Docker Compose on a
   host you control.
2. **Domain and DNS** — a wildcard record `*.<domain>` pointing at the host, so
   `<slug>.<domain>` resolves without a per-event DNS step.
3. **TLS** — a wildcard certificate for `*.<domain>`. With Let's Encrypt, issue
   it via DNS-01 (HTTP-01 cannot issue wildcards).
4. **Sending domain** — a verified Resend domain with SPF/DKIM. Without it the
   welcome email and every invitation land in spam.

`PROVISION_DOMAIN` is the domain those events live under. Pass it as `--domain`,
or set the env var. An empty or malformed domain is refused before anything is
written.

## Host, ports and the reverse proxy

The compose file publishes fixed host ports (`3025` for the app, `3026` for
PocketBase), which two events on one host cannot both bind. Resolve it one of two
ways, and write the choice down for the host you use:

- **Shared host, one port per event.** Keep a per-event compose override that
  maps a unique host port, and pass it with `--compose`:

  ```bash
  npx tsx scripts/provision.ts ... --compose deploys/smith-shower.compose.yml
  ```

  The override only needs the port mapping (the base file keeps the rest), and
  the reverse proxy targets `127.0.0.1:<port>`. `-p <slug>` keeps the containers
  and the `pb_data` volume separate per event.

- **One event per host (or one platform service per event).** No override is
  needed; the default compose file's ports are fine. Use `--no-up` if the host
  starts the stack itself.

The reverse proxy terminates TLS and routes `<slug>.<domain>` to the event's app
port. Only the proxy publishes `80`/`443` — the app's own port stays on the host
loopback.

**The repo's `docker-compose.yml` is the development stack** — `NODE_ENV=development`,
a bind mount and the Vite dev server. A live event must run the production image
instead: the `Dockerfile`'s `prod` target, `NODE_ENV=production`, so the production
secret checks and the CSP/HSTS security headers apply. Keep the production compose
(and its port arrangement) for your chosen host and pass it with `--compose`; the
event's env file applies to it the same way.

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
4. **Brings up** the stack: `docker compose -f <compose> -p <slug> --env-file deploys/<slug>.env up -d --build`.
   The slug is the compose project name, so per-event containers and the
   `pb_data` volume do not collide on a shared host. The event's env supplies
   every secret the stack reads — including `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD`,
   which `docker-compose.yml` interpolates from it.
5. **Seeds settings** through the admin API: the event title (derived from the
   slug), the date, the default language and the host email. It waits for
   `GET <api-url>/api/health` first.
6. **Delivers the welcome email** to the owner through Resend, or prints it when
   no provider is configured.

Useful flags:

| Flag | Why |
|---|---|
| `--dry-run` | Print the env, registry record and welcome message; touch nothing. Use this to review before a real run. |
| `--api-url <url>` | Seed through `http://localhost:<port>` when DNS/proxy is not wired yet (default: the event's own URL). |
| `--no-up` | Write the artifacts without touching Docker (a host where you start the stack yourself). |
| `--compose <file>` | Bring up your production compose instead of the repo's dev `docker-compose.yml`. |
| `--registry <file>` | Keep the registry somewhere other than `deployments.json`. |

### After it returns

- Confirm the deploy answers: `curl https://<slug>.<domain>/api/health`.
- Confirm the event renders with its name and language at `https://<slug>.<domain>/`.
- Check the organizer received the welcome email (or send the printed one).
- Route `<slug>.<domain>` through the reverse proxy if the proxy is configured
  per host rather than by wildcard.

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
docker compose -p <slug> --env-file deploys/<slug>.env up -d --build
```

Rules:

- **Never regenerate the event's secrets.** Re-running the provisioner for an
  existing slug is refused; an upgrade is a rebuild, not a re-provision.
- **Never delete the `pb_data` volume** — that is the guestbook, photos and every
  RSVP.
- Take a volume snapshot before an upgrade you are unsure about (`SECURITY.md`,
  Backups).

## Custom domain

- DNS: covered by the wildcard `*.<domain>` record. A per-event record is only
  needed if you did not set the wildcard.
- Reverse proxy: terminate TLS and proxy `<slug>.<domain>` to the app container's
  port. The app trusts `X-Forwarded-For` when `TRUST_PROXY=true` (the default),
  and its CSRF check accepts `APP_URL` as the origin — both assume the proxy
  fronts it.
- TLS: the wildcard certificate covers every slug; no per-event certificate.

## Teardown at retention

§7: destroy the deployment ~90 days after the event unless the organizer pays to
keep it. The registry's `retentionDate` is the event date + 90 days — read it
from `deployments.json` to know when an event is due.

Destroying the deploy is the deletion mechanism (§8). Do all four:

```bash
docker compose -p <slug> down -v        # containers + the pb_data volume
rm deploys/<slug>.env                   # the event's secrets
# remove the <slug> entry from deployments.json
# remove the <slug> mapping from the reverse proxy (if not wildcard)
```

The `-v` is what deletes the data: the `pb_data` volume holds every guest
record, guestbook entry and photo. Confirm with the organizer before running it.

## Related

- `SECURITY.md` — deploy targets, required env vars, secret rules, built-in
  protections, backups.
- `docs/SAAS-TRANSFORMATION.md` §7 (lifecycle and retention), §12 (support),
  §16.4–§16.8 (onboarding and provisioning design).
