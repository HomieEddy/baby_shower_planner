import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();
vi.mock('twilio', () => ({
  default: () => ({ messages: { create: createMock } }),
}));

import { sendSms, toE164, isGsm7, smsBody, smsParts } from './sms';
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

  it('never cuts a long message: it splits it into texts of up to 160 characters', () => {
    const long: MessageContent = { ...base, paragraphs: [Array(120).fill('word').join(' ')] };
    const parts = smsParts(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(160);
    const joined = parts.join('\n');
    expect(joined).not.toContain('...');
    expect(joined).toContain('RSVP: https://example.com/rsvp/tok-123');
    expect(joined).toContain('Code: 2468');
    expect(joined.split(/\s+/).filter((w) => w === 'word')).toHaveLength(120);
  });

  it('folds French text to GSM-7 instead of switching to UCS-2', () => {
    const fr: MessageContent = {
      ...base,
      language: 'FR',
      heading: '🌸 Baby shower de Eddy « & » Nana 🌸',
      paragraphs: ['Rendez-vous à la salle des fêtes, côté forêt.'],
    };
    const body = smsBody(fr);
    expect(isGsm7(body)).toBe(true);
    expect(body).toContain('Baby shower de Eddy & Nana');
    expect(body).toContain('Rendez-vous à la salle des fetes, coté foret.');
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

  it('sends a long message as several texts, in order', async () => {
    createMock.mockResolvedValue({ sid: 'SM1' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const long: MessageContent = { ...base, paragraphs: [Array(120).fill('word').join(' ')] };
    const parts = smsParts(long);
    expect(await sendSms('+15145551234', long)).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(parts.length);
    expect(createMock.mock.calls.map((c) => c[0].body)).toEqual(parts);
  });

  it('stops after a failed part so later parts never arrive alone', async () => {
    createMock.mockResolvedValueOnce({ sid: 'SM1' }).mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const long: MessageContent = { ...base, paragraphs: [Array(120).fill('word').join(' ')] };
    expect(await sendSms('+15145551234', long)).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(2);
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
