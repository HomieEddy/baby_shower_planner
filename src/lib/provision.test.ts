import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  provisionEvent,
  appendDeployment,
  emptyRegistry,
  validateProvisionInput,
  titleFromSlug,
  ProvisionError,
  type ProvisionInput,
  type ProvisionOptions,
} from './provision';

const input: ProvisionInput = {
  slug: 'smith-shower',
  plan: 'Basic',
  ownerEmail: 'owner@example.com',
  eventDate: '2026-09-15',
  language: 'EN',
};

const options = (override: Partial<ProvisionOptions> = {}): ProvisionOptions => ({
  now: new Date('2026-08-01T12:00:00.000Z'),
  randomHex: () => 'stub-secret',
  domain: 'bebe.example',
  ...override,
});

const envValue = (env: string, key: string): string | undefined =>
  env.split('\n').find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1);

describe('provisionEvent', () => {
  it('renders the event environment with its own URL and secrets', () => {
    const { env, appUrl, adminToken } = provisionEvent(input, options());

    expect(appUrl).toBe('https://smith-shower.bebe.example');
    expect(adminToken).toBe('stub-secret');
    expect(envValue(env, 'NODE_ENV')).toBe('production');
    expect(envValue(env, 'SLUG')).toBe('smith-shower');
    expect(envValue(env, 'PUBLIC_DOMAIN')).toBe('bebe.example');
    expect(envValue(env, 'APP_URL')).toBe('https://smith-shower.bebe.example');
    expect(envValue(env, 'ADMIN_TOKEN')).toBe('stub-secret');
    expect(envValue(env, 'PB_ADMIN_PASSWORD')).toBe('stub-secret');
  });

  it('passes the email provider keys through when configured', () => {
    const { env } = provisionEvent(input, options({ email: { apiKey: 'rk-test', from: 'Hi <hi@example.com>' } }));

    expect(env).toContain('RESEND_API_KEY=rk-test');
    expect(env).toContain('EMAIL_FROM=Hi <hi@example.com>');
  });

  it('records the deployment with a retention date derived from the event date', () => {
    const { record } = provisionEvent(input, options());

    expect(record).toEqual({
      slug: 'smith-shower',
      plan: 'Basic',
      ownerEmail: 'owner@example.com',
      eventDate: '2026-09-15',
      language: 'EN',
      provisionedAt: '2026-08-01T12:00:00.000Z',
      retentionDate: '2026-12-14',
    });
  });

  it('composes a welcome message naming the event and carrying the way in', () => {
    const { welcome } = provisionEvent(input, options());

    expect(welcome.subject).toContain('Smith Shower');
    const values = welcome.rows.map((row) => row.value);
    expect(values).toContain('https://smith-shower.bebe.example');
    expect(values).toContain('https://smith-shower.bebe.example/admin');
    expect(values).toContain('stub-secret');
  });

  it('generates secrets that clear the production rules, unique per event', () => {
    const real = (bytes: number) => randomBytes(bytes).toString('hex');
    const first = provisionEvent(input, options({ randomHex: real }));
    const second = provisionEvent({ ...input, slug: 'jones-shower' }, options({ randomHex: real }));

    const firstToken = envValue(first.env, 'ADMIN_TOKEN');
    const firstPassword = envValue(first.env, 'PB_ADMIN_PASSWORD');
    expect(firstToken!.length).toBeGreaterThanOrEqual(16);
    expect(firstPassword!.length).toBeGreaterThanOrEqual(12);
    expect(firstToken).not.toBe('babyshower-admin-2026');
    expect(firstPassword).not.toBe('changeme123');
    expect(firstToken).not.toBe(envValue(second.env, 'ADMIN_TOKEN'));
  });

  it('refuses a missing domain before producing anything', () => {
    let caught: unknown;
    try {
      provisionEvent(input, options({ domain: '' }));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProvisionError);
    expect((caught as ProvisionError).issues.map((issue) => issue.field)).toContain('domain');
  });

  it('refuses invalid input before producing anything', () => {
    let caught: unknown;
    try {
      provisionEvent({ ...input, ownerEmail: 'not-an-email' }, options());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProvisionError);
    expect((caught as ProvisionError).issues.map((issue) => issue.field)).toContain('ownerEmail');
  });
});

describe('validateProvisionInput', () => {
  it('accepts a full valid input', () => {
    expect(validateProvisionInput(input)).toEqual([]);
  });

  it('reports one issue per invalid field, each with a reason', () => {
    const issues = validateProvisionInput({
      slug: 'Bad_Slug',
      plan: 'Free',
      ownerEmail: 'nope',
      eventDate: '2026-02-31',
      language: 'ES',
    });

    expect(issues.map((issue) => issue.field).sort()).toEqual([
      'eventDate',
      'language',
      'ownerEmail',
      'plan',
      'slug',
    ]);
    expect(issues.every((issue) => issue.message.length > 0)).toBe(true);
  });
});

describe('appendDeployment', () => {
  it('adds the first record to an empty registry', () => {
    const { record } = provisionEvent(input, options());

    expect(appendDeployment(emptyRegistry(), record).deployments).toEqual([record]);
  });

  it('preserves existing records and their order', () => {
    const first = provisionEvent(input, options()).record;
    const second = provisionEvent({ ...input, slug: 'jones-shower' }, options()).record;

    expect(appendDeployment(appendDeployment(emptyRegistry(), first), second).deployments).toEqual([
      first,
      second,
    ]);
  });

  it('refuses a second deployment of the same slug', () => {
    const { record } = provisionEvent(input, options());

    expect(() => appendDeployment(appendDeployment(emptyRegistry(), record), record)).toThrow(
      ProvisionError,
    );
  });
});

describe('titleFromSlug', () => {
  it('turns a slug into an event title', () => {
    expect(titleFromSlug('smith-baby-shower')).toBe('Smith Baby Shower');
  });
});
