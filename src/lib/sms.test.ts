import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();
vi.mock('twilio', () => ({
  default: () => ({ messages: { create: createMock } }),
}));

import { sendSms, toE164, isGsm7, smsBody } from './sms';
import type { MessageContent } from './compose';

const base: MessageContent = {
  kind: 'invitation',
  language: 'EN',
  subject: 'Hi',
  heading: 'Baby Shower',
  rows: [{ label: 'When', value: 'June 5' }],
  paragraphs: [],
  link: 'https://example.com/rsvp/tok-123',
  code: '2468',
};

const KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];

beforeEach(() => {
  createMock.mockReset();
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+14375550100';
});

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  vi.restoreAllMocks();
});

describe('toE164', () => {
  it.each([
    ['514-555-1234', '+15145551234'],
    ['(514) 555 1234', '+15145551234'],
    ['5145551234', '+15145551234'],
    ['1 514 555 1234', '+15145551234'],
    ['+33 6 12 34 56 78', '+33612345678'],
    ['+15145551234', '+15145551234'],
    ['0033612345678', '+33612345678'],
  ])('normalizes %s', (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it.each(['', '   ', '123', 'call me', '+1 514 555', undefined, null])('rejects %p', (input) => {
    expect(toE164(input as string)).toBeNull();
  });
});

describe('isGsm7 / smsBody', () => {
  it('treats plain ASCII and common accents as GSM-7', () => {
    expect(isGsm7('Réponse à votre invitation: 2468')).toBe(true);
  });

  it('flags characters outside GSM-7 (ê, «, emoji)', () => {
    expect(isGsm7('Bienvenue chez nous ê')).toBe(false);
    expect(isGsm7('Bonjour « toi »')).toBe(false);
    expect(isGsm7('🌸 Baby Shower')).toBe(false);
  });

  it('keeps the RSVP link intact when the body is too long', () => {
    const long: MessageContent = {
      ...base,
      paragraphs: ['x'.repeat(900)],
    };
    const body = smsBody(long);
    expect(body.length).toBeLessThanOrEqual(640);
    expect(body).toContain('RSVP: https://example.com/rsvp/tok-123');
    expect(body).toContain('Code: 2468');
    expect(body).toContain('...');
  });

  it('uses the shorter UCS-2 budget for French text with non-GSM characters', () => {
    const fr: MessageContent = {
      ...base,
      language: 'FR',
      heading: 'Baby shower de Eddy « & » Nana',
      paragraphs: ['ê'.repeat(600)],
    };
    const body = smsBody(fr);
    expect(body.length).toBeLessThanOrEqual(268);
    expect(body).toContain('RSVP: https://example.com/rsvp/tok-123');
    expect(body).toContain('Code: 2468');
  });
});

describe('sendSms', () => {
  it('sends to the E.164 form of a free-typed number', async () => {
    createMock.mockResolvedValue({ sid: 'SM1' });
    expect(await sendSms('514-555-1234', base)).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
    const args = createMock.mock.calls[0][0];
    expect(args.to).toBe('+15145551234');
    expect(args.from).toBe('+14375550100');
    expect(args.body).toContain('https://example.com/rsvp/tok-123');
  });

  it('refuses an unusable number without calling Twilio', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendSms('call me maybe', base)).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns false and logs a hint when the guest has opted out (21610)', async () => {
    const err = Object.assign(new Error('unsubscribed'), { code: 21610 });
    createMock.mockRejectedValue(err);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendSms('+15145551234', base)).toBe(false);
    expect(spy.mock.calls[0][0]).toContain('replied STOP');
  });

  it('returns false (no throw) on any other Twilio failure', async () => {
    createMock.mockRejectedValue(Object.assign(new Error('boom'), { code: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendSms('+15145551234', base)).toBe(false);
  });
});
