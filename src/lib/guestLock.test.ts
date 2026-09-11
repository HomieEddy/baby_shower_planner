import { describe, it, expect } from 'vitest';
import { readGuestLock } from './guestLock';

const res = (status: number, body: unknown): Response =>
  ({ status, json: async () => body }) as unknown as Response;

describe('readGuestLock', () => {
  it('returns the window for a GUEST_CONTENT_LOCKED 403', async () => {
    const lock = await readGuestLock(res(403, { error: 'GUEST_CONTENT_LOCKED', opensAt: '2026-01-01', closesAt: '2026-01-02' }));
    expect(lock).toEqual({ opensAt: '2026-01-01', closesAt: '2026-01-02' });
  });

  it('returns an empty window when the lock carries no dates', async () => {
    const lock = await readGuestLock(res(403, { error: 'GUEST_CONTENT_LOCKED' }));
    expect(lock).toEqual({ opensAt: undefined, closesAt: undefined });
  });

  it('returns null for a different 403', async () => {
    expect(await readGuestLock(res(403, { error: 'FORBIDDEN' }))).toBeNull();
  });

  it('returns null for a non-403 response', async () => {
    expect(await readGuestLock(res(200, {}))).toBeNull();
  });

  it('returns null when the body is not JSON', async () => {
    const bad = { status: 403, json: async () => { throw new Error('bad body'); } } as unknown as Response;
    expect(await readGuestLock(bad)).toBeNull();
  });
});
