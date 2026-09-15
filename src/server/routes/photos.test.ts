import { describe, it, expect, vi, beforeEach } from 'vitest';

// /api/upload is the raw disk-write step of the two-step photo upload. The
// gate is the thing under test: the guest content window must apply before a
// single byte hits disk, and a per-IP budget must bound orphaned files.
const h = vi.hoisted(() => ({
  guestLock: vi.fn(async (): Promise<{ opensAt?: string; closesAt?: string } | null> => null),
  rateLimit: vi.fn((): { allowed: boolean; retryAfter: number } => ({ allowed: true, retryAfter: 0 })),
  writes: [] as string[],
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
    rateLimit: h.rateLimit,
    sendJson: (res: { statusCode?: number; body?: unknown }, statusCode: number, data: unknown) =>
      write(res, statusCode, data),
    sendError: (res: { statusCode?: number; body?: unknown }, code: string, message?: string) =>
      write(res, errorStatus(code as never), { error: code, message: message ?? errorMessage(code as never) }),
    sendGuestLocked: (res: { statusCode?: number; body?: unknown }, lock: { opensAt?: string }) =>
      write(res, 403, { error: 'GUEST_CONTENT_LOCKED', message: errorMessage('GUEST_CONTENT_LOCKED'), opensAt: lock.opensAt }),
  };
});

vi.mock('../../db/service', () => ({
  addPhotosBatch: vi.fn(),
  deletePhoto: vi.fn(),
  getAllPhotos: vi.fn(),
  getGuestByCode: vi.fn(),
  getGuestPhotoUsage: vi.fn(),
  setPhotoVisibility: vi.fn(),
}));

vi.mock('../uploadFiles', () => ({
  getUploadFilePath: (name: string) => {
    h.writes.push(name);
    return name;
  },
  removeUploadFiles: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, default: { ...actual, writeFileSync: vi.fn() } };
});

import { handlePhotoRoutes } from './photos';

const upload = (body: unknown = { photo_base64: 'data:image/jpeg;base64,AAAA' }) => {
  const res: { statusCode?: number; body?: any } = {};
  const ctx = {
    req: { method: 'POST', body } as any,
    res: res as any,
    url: new URL('http://localhost/api/upload'),
    ip: '127.0.0.1',
    adminOnly: () => false,
    requireAdmin: () => {},
    guestLock: h.guestLock,
  } as any;
  return handlePhotoRoutes(ctx).then(() => res);
};

beforeEach(() => {
  h.guestLock.mockClear();
  h.rateLimit.mockClear();
  h.rateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  h.writes.length = 0;
});

describe('POST /api/upload', () => {
  it('refuses the disk write outside the guest content window', async () => {
    h.guestLock.mockResolvedValueOnce({ opensAt: '2026-08-01', closesAt: '2026-09-01' });
    const res = await upload();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('GUEST_CONTENT_LOCKED');
    expect(h.writes).toEqual([]);
  });

  it('rate limits the write per IP so orphans cannot fill the disk', async () => {
    h.rateLimit.mockReturnValueOnce({ allowed: false, retryAfter: 30 });
    const res = await upload();
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('RATE_LIMITED');
    expect(h.writes).toEqual([]);
  });

  it('writes the file and returns its URL when the window is open', async () => {
    const res = await upload();
    expect(res.statusCode).toBe(200);
    expect(res.body.photo_url).toMatch(/^\/uploads\/photo-\d+-\d+\.jpg$/);
    expect(h.writes).toHaveLength(1);
  });

  it('rejects a body that is not a base64 data URL', async () => {
    const res = await upload({ photo_base64: 'nope' });
    expect(res.statusCode).toBe(400);
    expect(h.writes).toEqual([]);
  });
});
