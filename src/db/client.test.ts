import { describe, it, expect, vi, afterEach } from 'vitest';
import { findFirstOrUndefined, isNotFound, pb } from './client';

// The seam contract: a missing record is data (undefined), a broken db is an
// error. Callers rely on the difference (a magic link must not look invalid
// because PocketBase is down), so it is tested directly.

describe('isNotFound', () => {
  it('is true only for a 404-shaped failure', () => {
    expect(isNotFound({ status: 404 })).toBe(true);
    expect(isNotFound({ status: 500 })).toBe(false);
    expect(isNotFound(new Error('The requested resource was not found.'))).toBe(false);
    expect(isNotFound(null)).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
    expect(isNotFound('404')).toBe(false);
  });
});

describe('findFirstOrUndefined', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the record, undefined on 404, and rethrows a real failure', async () => {
    const getFirstListItem = vi
      .fn()
      .mockResolvedValueOnce({ id: 'g1', name: 'Alice' })
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { status: 404 }))
      .mockRejectedValueOnce(Object.assign(new Error('connection refused'), { status: 500 }));
    vi.spyOn(pb, 'collection').mockReturnValue({ getFirstListItem } as never);

    expect(await findFirstOrUndefined('guests', 'name="Alice"')).toEqual({ id: 'g1', name: 'Alice' });
    expect(await findFirstOrUndefined('guests', 'name="Nobody"')).toBeUndefined();
    await expect(findFirstOrUndefined('guests', 'name="X"')).rejects.toThrow('connection refused');
  });
});
