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

vi.mock('../http', () => ({
  parseJson: async (req: { body: unknown }) => req.body,
  rateLimit: () => ({ allowed: true }),
  sendJson: (res: { statusCode?: number; body?: unknown }, statusCode: number, data: unknown) => {
    res.statusCode = statusCode;
    res.body = data;
    return true;
  },
}));

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
  it('registers a going guest with no contact and no delivery channel', async () => {
    const res = await post({ name: 'Grandma', email: '', delivery_channel: 'email', going: true });
    expect(res.statusCode).toBe(200);
    expect(h.addGuest).toHaveBeenCalledWith(expect.objectContaining({
      delivery_channel: 'none',
      rsvp_status: 'Attending',
    }));
  });

  it('still requires email for a normal email invitation', async () => {
    const res = await post({ name: 'Guest', email: '', delivery_channel: 'email' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Email address is required');
    expect(h.addGuest).not.toHaveBeenCalled();
  });
});
