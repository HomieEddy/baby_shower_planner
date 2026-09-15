import { describe, it, expect, vi, beforeEach } from 'vitest';

// Guest-owned wish edits: the reservation code is the only credential, and the
// attached photo can be kept (omitted), replaced, or cleared ('').
const h = vi.hoisted(() => ({
  guestLock: vi.fn(async (): Promise<{ opensAt?: string; closesAt?: string } | null> => null),
  getGuestbookEntry: vi.fn(),
  updateGuestbookEntry: vi.fn(),
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
    rateLimit: () => ({ allowed: true, retryAfter: 0 }),
    sendJson: (res: { statusCode?: number; body?: unknown }, statusCode: number, data: unknown) =>
      write(res, statusCode, data),
    sendError: (res: { statusCode?: number; body?: unknown }, code: string, message?: string) =>
      write(res, errorStatus(code as never), { error: code, message: message ?? errorMessage(code as never) }),
    sendGuestLocked: (res: { statusCode?: number; body?: unknown }, lock: { opensAt?: string }) =>
      write(res, 403, { error: 'GUEST_CONTENT_LOCKED', message: errorMessage('GUEST_CONTENT_LOCKED'), opensAt: lock.opensAt }),
  };
});

vi.mock('../../db/service', () => ({
  addGuestbookEntry: vi.fn(),
  countGuestbookEntriesForTable: vi.fn(),
  deleteGuestbookEntry: vi.fn(),
  getAllGuestbookEntries: vi.fn(),
  getGuestbookEntriesByCode: vi.fn(),
  getGuestbookEntry: h.getGuestbookEntry,
  getGuestByCode: vi.fn(),
  setGuestbookEntryVisibility: vi.fn(),
  updateGuestbookEntry: h.updateGuestbookEntry,
}));

import { handleGuestbookRoutes } from './guestbook';

const existing = {
  id: 'wish1',
  reservation_code: '1234',
  guest_name: 'Nadia',
  message: 'Congrats!',
  photo_url: '/uploads/old.jpg',
  created_at: '2026-01-01T00:00:00.000Z',
};

const patch = (id: string, body: unknown) => {
  const res: { statusCode?: number; body?: any } = {};
  const ctx = {
    req: { method: 'PATCH', body } as any,
    res: res as any,
    url: new URL(`http://localhost/api/guestbook/mine/${id}`),
    ip: '127.0.0.1',
    adminOnly: () => false,
    requireAdmin: () => {},
    guestLock: h.guestLock,
  } as any;
  return handleGuestbookRoutes(ctx).then(() => res);
};

beforeEach(() => {
  h.guestLock.mockClear();
  h.getGuestbookEntry.mockReset();
  h.updateGuestbookEntry.mockReset();
});

describe('PATCH /api/guestbook/mine/:id', () => {
  it('rejects a mismatched reservation code', async () => {
    h.getGuestbookEntry.mockResolvedValueOnce(existing);
    const res = await patch('wish1', { reservation_code: '9999', guest_name: 'Nadia', message: 'Hi' });
    expect(res.statusCode).toBe(404);
    expect(h.updateGuestbookEntry).not.toHaveBeenCalled();
  });

  it('keeps the existing photo when photo_url is omitted', async () => {
    h.getGuestbookEntry.mockResolvedValueOnce(existing);
    h.updateGuestbookEntry.mockResolvedValueOnce({ ...existing, guest_name: 'Nadia B.' });
    const res = await patch('wish1', { reservation_code: '1234', guest_name: 'Nadia B.', message: 'Congrats!' });
    expect(res.statusCode).toBe(200);
    expect(h.updateGuestbookEntry).toHaveBeenCalledWith(
      'wish1',
      expect.objectContaining({ photo_url: '/uploads/old.jpg' })
    );
  });

  it('clears the photo when photo_url is an empty string', async () => {
    h.getGuestbookEntry.mockResolvedValueOnce(existing);
    h.updateGuestbookEntry.mockResolvedValueOnce({ ...existing, photo_url: '' });
    const res = await patch('wish1', { reservation_code: '1234', guest_name: 'Nadia', message: 'Congrats!', photo_url: '' });
    expect(res.statusCode).toBe(200);
    expect(h.updateGuestbookEntry).toHaveBeenCalledWith('wish1', expect.objectContaining({ photo_url: '' }));
  });

  it('rejects a photo URL outside our uploads dir', async () => {
    h.getGuestbookEntry.mockResolvedValueOnce(existing);
    const res = await patch('wish1', {
      reservation_code: '1234', guest_name: 'Nadia', message: 'Congrats!', photo_url: 'https://evil.example/x.jpg',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_PHOTO_URL');
    expect(h.updateGuestbookEntry).not.toHaveBeenCalled();
  });
});
