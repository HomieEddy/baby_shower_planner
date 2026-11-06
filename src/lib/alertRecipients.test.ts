import { describe, it, expect } from 'vitest';
import { alertRecipients, alertCandidates, hasContactFor } from './alertRecipients';
import type { Guest } from '../types';

const g = (id: string, rsvp_status: string, extra: Partial<Guest> = {}) =>
  ({ id, name: id, rsvp_status, email: '', phone: '', ...extra } as unknown as Guest);

const guests = [
  g('a', 'Pending', { email: 'a@x.com' }),
  g('b', 'Attending', { phone: '5145550000' }),
  g('c', 'Declined', { email: 'c@x.com', phone: '5145551111' }),
  g('d', 'Attending', { email: 'd@x.com', phone: '5145552222' }),
];

describe('alertRecipients', () => {
  it('audience ALL skips declined guests', () => {
    expect(alertCandidates(guests, 'CUSTOM', 'ALL', []).map((x) => x.id)).toEqual(['a', 'b', 'd']);
  });

  it('CANCELLATION reaches declined guests too', () => {
    expect(alertCandidates(guests, 'CANCELLATION', 'ALL', []).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('channel filters by contact detail', () => {
    expect(alertRecipients(guests, 'CUSTOM', 'ALL', [], 'email').map((x) => x.id)).toEqual(['a', 'd']);
    expect(alertRecipients(guests, 'CUSTOM', 'ALL', [], 'text').map((x) => x.id)).toEqual(['b', 'd']);
    expect(alertRecipients(guests, 'CUSTOM', 'ALL', [], 'both').map((x) => x.id)).toEqual(['a', 'b', 'd']);
  });

  it('SELECTED uses exactly the picked guests, declined included', () => {
    expect(alertRecipients(guests, 'CUSTOM', 'SELECTED', ['c', 'b'], 'text').map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('hasContactFor respects the channel', () => {
    expect(hasContactFor(g('x', 'Pending', { phone: '1' }), 'email')).toBe(false);
    expect(hasContactFor(g('x', 'Pending', { phone: '1' }), 'both')).toBe(true);
  });
});
