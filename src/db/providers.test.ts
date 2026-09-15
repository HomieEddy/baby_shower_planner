import { describe, it, expect, afterEach } from 'vitest';
import { DomainError } from '../lib/errors';
import { providerAvailability, requireProvider } from './providers';

const KEYS = ['RESEND_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
const clear = () => { for (const k of KEYS) delete process.env[k]; };

afterEach(clear);

describe('providerAvailability', () => {
  it('reports nothing configured when env is empty', () => {
    clear();
    expect(providerAvailability()).toEqual({ email: false, sms: false });
  });
});

describe('requireProvider', () => {
  it('throws when no requested channel has a provider', () => {
    clear();
    expect(() => requireProvider(['email', 'text'])).toThrow(DomainError);
  });

  it('passes when at least one requested channel has a provider', () => {
    clear();
    process.env.RESEND_API_KEY = 'test';
    expect(() => requireProvider(['email', 'text'])).not.toThrow();
  });
});
