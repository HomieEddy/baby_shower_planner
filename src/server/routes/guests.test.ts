import { describe, it, expect, vi, beforeEach } from 'vitest';

// The route only needs to hand the parsed body to addGuest; these stubs keep
// the HTTP/db layers out of the test.
const h = vi.hoisted(() => ({
  addGuest: vi.fn(async () => ({ guest: { id: 'g1', name: 'Grandma' }, magic_token: 'tok', invite_message: '' })),
}));

vi.mock('../../db/service', () => ({
  addGuest: h.addGuest,
  batchImportGuests: vi.fn(),
  deleteGuest: vi.fn(),
  getAllGuests: vi.fn(),
  getGuestByCode: vi.fn(),
  getGuestById: vi.fn(),
  getUniversalInviteMessage: vi.fn(),
  inviteMessageFor: vi.fn(),
  removeGuestAttendee: vi.fn(),
  setApproval: vi.fn(),
  updateGuest: vi.fn(),
}));

vi.mock('../http', async () => {
  const { errorMessage, errorStatus } = await import('../../lib/errors');
  const write = (res: { statusCode?: number; body?: unknown }, statusCode: number, data: unknown) => {
    res.statusCode = statusCode;
    res.body = data;
    return true;
  };
  return {
    parseJson: async (req: { body: unknown }) => req.body,
    rateLimit: () => ({ allowed: true }),
    sendJson: (res: { statusCode?: number; body?: unknown }, statusCode: number, data: unknown) =>
      write(res, statusCode, data),
    sendError: (res: { statusCode?: number; body?: unknown }, code: string, message?: string) =>
      write(res, errorStatus(code as never), { error: code, message: message ?? errorMessage(code as never) }),
  };
});

import { handleGuestRoutes } from './guests';

const post = (body: unknown) => {
  const res: { statusCode?: number; body?: any } = {};
  const ctx = {
    req: { method: 'POST', body } as any,
    res: res as any,
    url: new URL('http://localhost/api/guests'),
    ip: '127.0.0.1',
    requireAdmin: () => {},
  } as any;
  return handleGuestRoutes(ctx).then(() => res);
};

beforeEach(() => h.addGuest.mockClear());

describe('POST /api/guests', () => {
  it('registers a going guest with no contact, no channel, and its party names', async () => {
    const res = await post({ name: 'Grandma', email: '', delivery_channel: 'email', going: true, attendee_names: ['Grandpa'] });
    expect(res.statusCode).toBe(200);
    expect(h.addGuest).toHaveBeenCalledWith(expect.objectContaining({
      delivery_channel: 'none',
      rsvp_status: 'Attending',
      attendee_names: ['Grandpa'],
    }));
  });

  it('still requires email for a normal email invitation', async () => {
    const res = await post({ name: 'Guest', email: '', delivery_channel: 'email' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('EMAIL_REQUIRED');
    expect(res.body.message).toBe('Email address is required');
    expect(h.addGuest).not.toHaveBeenCalled();
  });

  it('validates the party list against the domain shape at the seam', async () => {
    const tooMany = await post({
      name: 'Grandma', delivery_channel: 'none', going: true,
      attendee_names: Array.from({ length: 21 }, (_, i) => `Guest ${i}`),
    });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.body.error).toBe('INVALID_PAYLOAD');
    expect(h.addGuest).not.toHaveBeenCalled();

    // Anything that is not a member object used to reach PocketBase untouched.
    const malformed = await post({
      name: 'Grandma', delivery_channel: 'none', going: true,
      attendee_details: ['not-a-member'],
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body.error).toBe('INVALID_PAYLOAD');
    expect(h.addGuest).not.toHaveBeenCalled();
  });

  it('passes the validated party through to addGuest', async () => {
    const res = await post({
      name: 'Grandma', delivery_channel: 'none', going: true,
      attendee_names: ['Grandpa'],
      attendee_details: [{ name: 'Grandpa', dietary: 'Vegan' }],
    });
    expect(res.statusCode).toBe(200);
    expect(h.addGuest).toHaveBeenCalledWith(expect.objectContaining({
      attendee_names: ['Grandpa'],
      attendee_details: [{ name: 'Grandpa', dietary: 'Vegan' }],
    }));
  });
});
