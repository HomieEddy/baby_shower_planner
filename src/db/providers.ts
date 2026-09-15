// Which outbound providers (Resend / Twilio) are configured. One source for the
// capabilities endpoint and the server-side send guards.

import { DomainError } from '../lib/errors';

export interface ProviderAvailability {
  email: boolean;
  sms: boolean;
}

export const providerAvailability = (): ProviderAvailability => ({
  email: !!process.env.RESEND_API_KEY,
  sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
});

// Throws PROVIDER_NOT_CONFIGURED when none of the requested delivery channels
// has a provider. A partial match passes (an unavailable channel is skipped).
// Channels use the notification vocabulary ('text' = SMS).
export function requireProvider(channels: Array<'email' | 'text'>): void {
  const p = providerAvailability();
  if (!channels.some((c) => (c === 'email' ? p.email : p.sms))) {
    throw new DomainError('PROVIDER_NOT_CONFIGURED');
  }
}
