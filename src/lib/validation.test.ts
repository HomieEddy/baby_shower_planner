import { describe, it, expect } from 'vitest';
import { GuestRsvpSchema, GuestImportSchema, GuestbookEntrySchema, GiftLogSchema } from './validation';

describe('GuestRsvpSchema', () => {
  it('accepts a valid attending RSVP', () => {
    const r = GuestRsvpSchema.safeParse({ rsvp_status: 'Attending', attending_party_size: 2, dietary_restrictions: 'Gluten-Free' });
    expect(r.success).toBe(true);
  });

  it('rejects unknown statuses', () => {
    const r = GuestRsvpSchema.safeParse({ rsvp_status: 'Maybe', attending_party_size: 1 });
    expect(r.success).toBe(false);
  });

  it('rejects party size above 20', () => {
    const r = GuestRsvpSchema.safeParse({ rsvp_status: 'Attending', attending_party_size: 21 });
    expect(r.success).toBe(false);
  });
});

describe('GuestImportSchema', () => {
  it('defaults delivery_channel and language', () => {
    const r = GuestImportSchema.safeParse({ name: 'Marie Curie' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.delivery_channel).toBe('email');
      expect(r.data.language_pref).toBe('FR');
      expect(r.data.max_party_size).toBe(1);
    }
  });

  it('accepts link-only channel', () => {
    const r = GuestImportSchema.safeParse({ name: 'Marie Curie', delivery_channel: 'none' });
    expect(r.success).toBe(true);
  });

  it('rejects missing name', () => {
    const r = GuestImportSchema.safeParse({ email: 'x@example.com' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const r = GuestImportSchema.safeParse({ name: 'N', email: 'not-an-email' });
    expect(r.success).toBe(false);
  });

  it('accepts empty email', () => {
    const r = GuestImportSchema.safeParse({ name: 'N', email: '' });
    expect(r.success).toBe(true);
  });
});

describe('GiftLogSchema', () => {
  it('accepts a gift with optional guest_id', () => {
    const r = GiftLogSchema.safeParse({ guest_name: 'Aunt', guest_id: 'abc123', gift_description: 'Quilt', category: 'Clothing' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.guest_id).toBe('abc123');
  });

  it('defaults category to Nursery', () => {
    const r = GiftLogSchema.safeParse({ guest_name: 'Aunt', gift_description: 'Quilt' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('Nursery');
  });

  it('rejects missing description', () => {
    const r = GiftLogSchema.safeParse({ guest_name: 'Aunt' });
    expect(r.success).toBe(false);
  });
});

describe('GuestbookEntrySchema', () => {
  it('requires name and message', () => {
    expect(GuestbookEntrySchema.safeParse({ guest_name: '', message: 'hi' }).success).toBe(false);
    expect(GuestbookEntrySchema.safeParse({ guest_name: 'N', message: '' }).success).toBe(false);
    expect(GuestbookEntrySchema.safeParse({ guest_name: 'N', message: 'hi' }).success).toBe(true);
  });
});
