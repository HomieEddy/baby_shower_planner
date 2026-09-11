// Guest content window (guestbook + photo upload): the client-side read of the
// GUEST_CONTENT_LOCKED response. One decoder for every lock site.

import { decodeApiError } from './errors';

export interface GuestContentLockInfo {
  opensAt?: string;
  closesAt?: string;
}

// Returns the lock window when `res` is a GUEST_CONTENT_LOCKED 403, else null.
// Consumes the response body, so callers must not re-read it.
export async function readGuestLock(res: Response): Promise<GuestContentLockInfo | null> {
  if (res.status !== 403) return null;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (decodeApiError(data, res.status).code !== 'GUEST_CONTENT_LOCKED') return null;
  return {
    opensAt: typeof data.opensAt === 'string' ? data.opensAt : undefined,
    closesAt: typeof data.closesAt === 'string' ? data.closesAt : undefined,
  };
}
