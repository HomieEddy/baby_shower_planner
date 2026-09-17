// Standing up one event, from the command line. This is the I/O half of
// provisioning; every decision lives in src/lib/provision.ts, which stays pure
// and unit-tested. Run from the repo root:
//
//   npx tsx scripts/provision.ts --slug smith-shower --plan Basic \
//     --owner you@example.com --date 2026-09-15 --language EN --domain events.example
//
// Add --dry-run to print the artifacts and touch nothing. Under bash you can
// also use `npm run provision -- <args>`; PowerShell's npm shim swallows the
// `--`, so use the direct form there.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendDeployment,
  emptyRegistry,
  provisionEvent,
  titleFromSlug,
  ProvisionError,
  REGISTRY_VERSION,
  type DeploymentRegistry,
  type ProvisionInput,
} from '../src/lib/provision';
import { renderText } from '../src/lib/compose';
import { sendEmail } from '../src/lib/email';

interface CommandArgs {
  slug: string;
  plan: string;
  ownerEmail: string;
  eventDate: string;
  language: string;
  domain: string;
  registry: string;
  envOut: string;
  apiUrl?: string;
  compose: string;
  noUp: boolean;
  demo: boolean;
  dryRun: boolean;
}

const USAGE = `Usage: npx tsx scripts/provision.ts --slug <slug> --plan <Basic|Premium> --owner <email> \\
  --date <YYYY-MM-DD> --language <EN|FR> --domain <domain> [options]

Options:
  --registry <file>   Deployment registry (default deployments.json)
  --env-out <file>    Where the event's env is written (default deploys/<slug>.env)
  --api-url <url>     Where to seed settings when DNS is not up yet
  --compose <file>    Compose file to bring up (default docker-compose.prod.yml;
                      pass docker-compose.yml for a local/dev stack)
  --no-up             Write the artifacts, do not touch Docker
  --demo              Provision the public read-only demo event
  --dry-run           Print the artifacts and change nothing

--domain may also come from PROVISION_DOMAIN.`;

function parseArgs(argv: string[]): CommandArgs {
  const flags = new Map<string, string>();
  let noUp = false;
  let demo = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--no-up') {
      noUp = true;
    } else if (token === '--demo') {
      demo = true;
    } else if (token === '--dry-run') {
      dryRun = true;
    } else if (token.startsWith('--')) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${token} needs a value`);
      flags.set(token.slice(2), value);
      i += 1;
    } else {
      throw new Error(`unexpected argument "${token}"`);
    }
  }

  const required = (key: string): string => {
    const value = flags.get(key);
    if (!value) throw new Error(`--${key} is required\n\n${USAGE}`);
    return value;
  };

  const slug = required('slug');
  return {
    slug,
    plan: required('plan'),
    ownerEmail: required('owner'),
    eventDate: required('date'),
    language: required('language'),
    domain: flags.get('domain') || process.env.PROVISION_DOMAIN || '',
    registry: flags.get('registry') || 'deployments.json',
    envOut: flags.get('env-out') || path.join('deploys', `${slug}.env`),
    apiUrl: flags.get('api-url'),
    compose: flags.get('compose') || 'docker-compose.prod.yml',
    noUp,
    demo,
    dryRun,
  };
}

function readRegistry(file: string): DeploymentRegistry {
  if (!fs.existsSync(file)) return emptyRegistry();
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  const registry = parsed as Partial<DeploymentRegistry> | null;
  if (!registry || !Array.isArray(registry.deployments)) {
    throw new Error(`${file} is not a deployment registry`);
  }
  if (registry.version !== REGISTRY_VERSION) {
    throw new Error(`${file} is registry version ${registry.version}, expected ${REGISTRY_VERSION}`);
  }
  return registry as DeploymentRegistry;
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

async function waitForHealth(apiUrl: string, attempts = 60): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(`${apiUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${apiUrl}/api/health never answered — re-run with --api-url once it is up to seed settings`);
}

async function seedSettings(apiUrl: string, input: ProvisionInput, token: string): Promise<void> {
  await waitForHealth(apiUrl);
  const res = await fetch(`${apiUrl}/api/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({
      eventTitle: titleFromSlug(input.slug),
      date: input.eventDate,
      defaultLanguage: input.language,
      hostEmail: input.ownerEmail,
    }),
  });
  if (!res.ok) throw new Error(`settings seed failed (${res.status}): ${await res.text()}`);
}

function printSummary(appUrl: string, registryFile: string, envFile: string, retentionDate: string, adminToken: string): void {
  console.log(`\n  event     ${appUrl}`);
  console.log(`  admin     ${appUrl}/admin`);
  console.log(`  health    ${appUrl}/api/health`);
  console.log(`  env       ${envFile}`);
  console.log(`  registry  ${registryFile}`);
  console.log(`  retention ${retentionDate}`);
  console.log(`  password  ${adminToken}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const input: ProvisionInput = {
    slug: args.slug,
    plan: args.plan,
    ownerEmail: args.ownerEmail,
    eventDate: args.eventDate,
    language: args.language,
  };

  const provisioned = provisionEvent(input, {
    now: new Date(),
    randomHex: (bytes) => randomBytes(bytes).toString('hex'),
    domain: args.domain,
    email: { apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM },
    demo: args.demo,
  });

  // Refuse a duplicate slug before any write.
  const registry = appendDeployment(readRegistry(args.registry), provisioned.record);

  if (args.dryRun) {
    console.log(`--- ${args.envOut} ---\n${provisioned.env}`);
    console.log(`--- ${args.registry} ---\n${JSON.stringify(registry, null, 2)}`);
    console.log(`--- welcome to ${input.ownerEmail} ---\n${renderText(provisioned.welcome)}`);
    return;
  }

  writeFile(args.envOut, provisioned.env);
  writeFile(args.registry, `${JSON.stringify(registry, null, 2)}\n`);

  if (!args.noUp) {
    execFileSync('docker', ['compose', '-f', args.compose, '-p', input.slug, '--env-file', args.envOut, 'up', '-d', '--build'], {
      stdio: 'inherit',
    });
  }

  console.log(`\nProvisioned ${input.slug}`);
  try {
    await seedSettings(args.apiUrl || provisioned.appUrl, input, provisioned.adminToken);
    if (!(await sendEmail(input.ownerEmail, provisioned.welcome))) {
      console.log(`\n--- Welcome email (not sent — no provider configured) ---\n${renderText(provisioned.welcome)}`);
    }
  } finally {
    // Whatever happens above, the operator keeps the credentials.
    printSummary(
      provisioned.appUrl,
      args.registry,
      args.envOut,
      provisioned.record.retentionDate,
      provisioned.adminToken,
    );
  }
}

main().catch((err: unknown) => {
  if (err instanceof ProvisionError) {
    for (const issue of err.issues) console.error(`  ${issue.field}: ${issue.message}`);
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
});
