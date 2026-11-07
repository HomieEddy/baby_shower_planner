import { describe, it, expect, vi, beforeEach } from 'vitest';

// Guest-owned wish edits: the reservation code is the only credential, and the
// attached photo can be kept (omitted), replaced, or cleared ('').
const h = vi.hoisted(() => ({
  guestLock: vi.fn(async (): Promise<{ opensAt?: string; closesAt?: string } | null> => null),
  getGuestbookEntry: vi.fn(),
  updateGuestbookEntry: vi.fn(),
  addGuestbookEntry: vi.fn(),
  countGuestbookEntriesForTable: vi.fn(async () => 0),
  getTableAccessByCode: vi.fn(),
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
  addGuestbookEntry: h.addGuestbookEntry,
  countGuestbookEntriesForTable: h.countGuestbookEntriesForTable,
  getTableAccessByCode: h.getTableAccessByCode,
  isApproved: () => true,
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

const post = (body: unknown) => {
  const res: { statusCode?: number; body?: any } = {};
  const ctx = {
    req: { method: 'POST', body } as any,
    res: res as any,
    url: new URL('http://localhost/api/guestbook'),
    ip: '127.0.0.1',
    adminOnly: () => false,
    requireAdmin: () => {},
    guestLock: h.guestLock,
  } as any;
  return handleGuestbookRoutes(ctx).then(() => res);
};

describe('POST /api/guestbook from a table QR code', () => {
  const wish = { reservation_code: '1234', guest_name: 'Nadia', message: 'Congrats!' };
  const alice = { id: 'g1', code: '1234', name: 'Alice' };

  beforeEach(() => {
    h.addGuestbookEntry.mockReset();
    h.getTableAccessByCode.mockReset();
  });

  it('refuses a party seated at another table', async () => {
    h.getTableAccessByCode.mockResolvedValueOnce({
      guest: alice,
      access: { ok: false, reason: 'WRONG_TABLE', assignedTable: { id: 'A', name: 'Table 1' } },
    });
    await expect(post({ ...wish, table_id: 'B', table_name: 'Table 2' })).rejects.toMatchObject({
      code: 'WRONG_TABLE',
      extra: { assignedTable: { id: 'A', name: 'Table 1' } },
    });
    expect(h.addGuestbookEntry).not.toHaveBeenCalled();
  });

  it('refuses a party that has not checked in', async () => {
    h.getTableAccessByCode.mockResolvedValueOnce({ guest: alice, access: { ok: false, reason: 'NOT_CHECKED_IN' } });
    await expect(post({ ...wish, table_id: 'A' })).rejects.toMatchObject({ code: 'NOT_CHECKED_IN' });
    expect(h.addGuestbookEntry).not.toHaveBeenCalled();
  });

  it('files the wish under the real table name, not the one the client sent', async () => {
    h.getTableAccessByCode.mockResolvedValueOnce({
      guest: alice,
      access: { ok: true, table: { id: 'A', name: 'Table 1' } },
    });
    h.addGuestbookEntry.mockResolvedValueOnce({ id: 'w1' });
    const res = await post({ ...wish, table_id: 'A', table_name: 'Some other table' });
    expect(res.statusCode).toBe(200);
    expect(h.countGuestbookEntriesForTable).toHaveBeenCalledWith('Table 1');
    expect(h.addGuestbookEntry).toHaveBeenCalledWith(expect.objectContaining({ table_name: 'Table 1', table_id: 'A' }));
  });
});
