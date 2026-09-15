import { describe, it, expect, afterEach } from 'vitest';
import { sendEmail } from './email';
import { sendSms } from './sms';
import type { MessageContent } from './compose';

const content: MessageContent = {
  kind: 'invitation',
  language: 'EN',
  subject: 'Hi',
  heading: 'Hi',
  rows: [],
  paragraphs: [],
};

const KEYS = ['RESEND_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe('transport config guards', () => {
  it('returns false (no throw, no send) when Resend is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail('guest@example.com', content)).toBe(false);
  });

  it('returns false (no throw, no send) when Twilio is not configured', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
    expect(await sendSms('+15550000', content)).toBe(false);
  });
});
