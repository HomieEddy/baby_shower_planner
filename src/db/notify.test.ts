import { describe, it, expect, vi } from 'vitest';
import type { Guest } from '../types';
import { composeInvitation } from '../lib/compose';
import { notifyChannels, notifyGuest, type NotifyDeps } from './notify';

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Alice',
  email: 'alice@example.com',
  phone: '+15550000',
  delivery_channel: 'both',
  code: '2468',
  max_party_size: 2,
  rsvp_status: 'Pending',
  attending_party_size: 0,
  dietary_restrictions: '',
  language_pref: 'EN',
  magic_token: 'tok-123',
  token_used: false,
  created_at: '',
  ...over,
});

const content = composeInvitation(guest(), {});

const deps = (email = true, sms = true): NotifyDeps => ({
  email: vi.fn(async () => email),
  sms: vi.fn(async () => sms),
});

describe('notifyGuest', () => {
  it('sends on both channels and reports them', async () => {
    const d = deps();
    const result = await notifyGuest(guest({ delivery_channel: 'both' }), content, d);
    expect(result).toEqual({ sent: ['email', 'text'], failed: [] });
    expect(d.email).toHaveBeenCalledOnce();
    expect(d.sms).toHaveBeenCalledOnce();
  });

  it('sends only email for an email-channel guest', async () => {
    const d = deps();
    const result = await notifyGuest(guest({ delivery_channel: 'email' }), content, d);
    expect(result.sent).toEqual(['email']);
    expect(d.sms).not.toHaveBeenCalled();
  });

  it('does nothing for a link-only guest', async () => {
    const d = deps();
    const result = await notifyGuest(guest({ delivery_channel: 'none' }), content, d);
    expect(result).toEqual({ sent: [], failed: [] });
    expect(d.email).not.toHaveBeenCalled();
    expect(d.sms).not.toHaveBeenCalled();
  });

  it('reports a failed channel without failing the other', async () => {
    const d = deps(false, true);
    const result = await notifyGuest(guest({ delivery_channel: 'both' }), content, d);
    expect(result.sent).toEqual(['text']);
    expect(result.failed).toEqual(['email']);
  });

  it('skips a channel with no address rather than reporting a failure', async () => {
    const d = deps();
    const result = await notifyGuest(guest({ delivery_channel: 'text', phone: undefined }), content, d);
    expect(result).toEqual({ sent: [], failed: [] });
    expect(d.sms).not.toHaveBeenCalled();
  });
});

describe('notifyChannels', () => {
  it('honours the explicit channel list over delivery_channel', async () => {
    const d = deps();
    const result = await notifyChannels(guest({ delivery_channel: 'none' }), content, ['text'], d);
    expect(result.sent).toEqual(['text']);
    expect(d.email).not.toHaveBeenCalled();
  });
});
