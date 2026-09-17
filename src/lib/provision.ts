// Provisioning core: the decision half of standing up one event's deploy.
// Pure — no fs, no network, no process.env. The command in scripts/provision.ts
// wraps this and applies the artifacts. Clock and randomness are inputs so the
// whole thing is deterministic under test.

import { z } from 'zod';
import { LanguageEnum, type Language } from './domain';
import { composeWelcome, type MessageContent } from './compose';
import type { Plan } from './entitlements';

// One definition of the plan vocabulary (src/lib/entitlements.ts); re-exported
// here so operator tooling can keep importing it from the provisioning core.
export type { Plan };

// §7: destroy the deployment ~90 days after the event.
const RETENTION_DAYS = 90;

// The deployment registry's on-disk shape. Bump the version if a record's shape
// ever changes; an unrecognised version is refused rather than misread.
export const REGISTRY_VERSION = 1;

// Compose deployment defaults (docker-compose.yml: the service is `pocketbase`
// on 8090; production mounts the uploads volume at /data).
const POCKETBASE_URL = 'http://pocketbase:8090';
const UPLOAD_DIR = '/data';

export interface ProvisionInput {
  slug: string;
  plan: string;
  ownerEmail: string;
  eventDate: string;
  language: string;
}

export interface DeploymentRecord {
  slug: string;
  plan: Plan;
  ownerEmail: string;
  eventDate: string;
  language: Language;
  provisionedAt: string;
  retentionDate: string;
}

export interface DeploymentRegistry {
  version: number;
  deployments: DeploymentRecord[];
}

export interface ProvisionOptions {
  now: Date;
  randomHex: (bytes: number) => string;
  domain: string;
  email?: { apiKey?: string; from?: string };
}

export interface ProvisionedEvent {
  env: string;
  // Structured values the command needs without re-parsing the rendered env.
  appUrl: string;
  adminToken: string;
  record: DeploymentRecord;
  welcome: MessageContent;
}

export interface ProvisionIssue {
  field: string;
  message: string;
}

export class ProvisionError extends Error {
  readonly issues: ProvisionIssue[];

  constructor(issues: ProvisionIssue[]) {
    super(issues.map((issue) => `${issue.field}: ${issue.message}`).join('; '));
    this.name = 'ProvisionError';
    this.issues = issues;
  }
}

const asUtcDate = (date: string): Date => new Date(`${date}T00:00:00Z`);

const isRealDate = (value: string): boolean => {
  const parsed = asUtcDate(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const InputSchema = z.object({
  // A lowercase DNS label: safe as a subdomain.
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'must be a lowercase DNS label'),
  plan: z.enum(['Basic', 'Premium']),
  ownerEmail: z.email(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .refine(isRealDate, 'is not a real date'),
  language: LanguageEnum,
});

const toIssues = (error: z.ZodError): ProvisionIssue[] =>
  error.issues.map((issue) => ({ field: String(issue.path[0] ?? ''), message: issue.message }));

// The domain is operator configuration, not a per-event input, but it still has
// to be a hostname: an empty one would silently render `https://<slug>.`.
const DOMAIN = z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/, 'must be a hostname');

export function validateProvisionInput(input: ProvisionInput): ProvisionIssue[] {
  const parsed = InputSchema.safeParse(input);
  return parsed.success ? [] : toIssues(parsed.error);
}

// No event title reaches provisioning (checkout collects none), but the
// organizer's first sign-in must be a named event. Derive one from the slug.
// ponytail: derived; add a real title input when checkout starts collecting one.
export const titleFromSlug = (slug: string): string =>
  slug
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

const addDays = (date: string, days: number): string => {
  const next = asUtcDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

export function provisionEvent(input: ProvisionInput, options: ProvisionOptions): ProvisionedEvent {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new ProvisionError(toIssues(parsed.error));

  const domain = DOMAIN.safeParse(options.domain);
  if (!domain.success) {
    throw new ProvisionError([{ field: 'domain', message: 'must be a hostname (set --domain or PROVISION_DOMAIN)' }]);
  }

  const { slug, plan, ownerEmail, eventDate, language } = parsed.data;
  const publicHost = `${slug}.${domain.data}`;
  const appUrl = `https://${publicHost}`;
  const adminToken = options.randomHex(32);
  const pbPassword = options.randomHex(24);

  const lines = [
    `# Provisioned event: ${slug}`,
    'NODE_ENV=production',
    // The reverse proxy labels read these: SLUG names the router, PUBLIC_DOMAIN
    // is the base the Host rule is built from. `-p <slug>` already scopes the
    // compose project.
    `SLUG=${slug}`,
    `PUBLIC_DOMAIN=${domain.data}`,
    `POCKETBASE_URL=${POCKETBASE_URL}`,
    `PB_ADMIN_EMAIL=admin@${domain.data}`,
    `PB_ADMIN_PASSWORD=${pbPassword}`,
    `ADMIN_TOKEN=${adminToken}`,
    `APP_URL=${appUrl}`,
    `UPLOAD_DIR=${UPLOAD_DIR}`,
  ];
  if (options.email?.apiKey) lines.push(`RESEND_API_KEY=${options.email.apiKey}`);
  if (options.email?.from) lines.push(`EMAIL_FROM=${options.email.from}`);

  return {
    env: `${lines.join('\n')}\n`,
    appUrl,
    adminToken,
    record: {
      slug,
      plan,
      ownerEmail,
      eventDate,
      language,
      provisionedAt: options.now.toISOString(),
      retentionDate: addDays(eventDate, RETENTION_DAYS),
    },
    welcome: composeWelcome({
      title: titleFromSlug(slug),
      eventUrl: appUrl,
      adminUrl: `${appUrl}/admin`,
      password: adminToken,
      language,
    }),
  };
}

export const emptyRegistry = (): DeploymentRegistry => ({ version: REGISTRY_VERSION, deployments: [] });

export function appendDeployment(
  registry: DeploymentRegistry,
  record: DeploymentRecord,
): DeploymentRegistry {
  if (registry.deployments.some((existing) => existing.slug === record.slug)) {
    throw new ProvisionError([
      { field: 'slug', message: `"${record.slug}" is already provisioned` },
    ]);
  }
  return { ...registry, deployments: [...registry.deployments, record] };
}
