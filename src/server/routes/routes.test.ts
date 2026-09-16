import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type http from 'node:http';
import { adminGuard, HttpError } from '../http';
import type { RouteCtx } from '../http';

// Cross-module smoke test for the route seam: the real dispatcher and the real
// http helpers, with only the data layer stubbed. It pins path/method matching,
// the admin gate, the guest lock, body parsing and params for every module —
// the coverage the hand-written path ladders never had.

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  guestLock: vi.fn(async (): Promise<{ opensAt?: string } | null> => null),
  adminOnly: vi.fn(() => false),
}));

// Every data-layer export becomes a stub, so a new endpoint cannot pass this
// smoke test by accident of a missing mock.
vi.mock('../../db/service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const stubs: Record<string, unknown> = Object.fromEntries(Object.keys(actual).map((key) => [key, vi.fn(async () => ({}))]));
  // The stubs whose shape the handler reads.
  stubs.selfCheckIn = vi.fn(async () => ({ ok: true, guest: {} }));
  stubs.getFloorMap = vi.fn(async () => ({ id: 'm1', canvasWidth: 850, canvasHeight: 520, tables: [], landmarks: [], updatedAt: '' }));
  stubs.getGuestIdsForIdentity = vi.fn(async () => []);
  stubs.getRehearsalStatus = vi.fn(() => ({
    active: true,
    sample: { name: 'Rehearsal Guest', code: '4242', magic_token: 'tok-sample' },
    pendingToken: 'pend-token',
  }));
  stubs.getPublicRehearsalStatus = vi.fn(() => ({ active: true }));
  stubs.getAlerts = vi.fn(async () => [{
    id: 'a1', type: 'CUSTOM', title: 'Pool closed', message: 'Back at 4', active: true,
    target_audience: 'ALL', notified_guests_count: 7, created_at: '2026-01-01T00:00:00Z',
  }]);
  // The alert projection is pure: keep it real so the route assertions check the
  // actual guest shape.
  stubs.projectAlertForGuest = actual.projectAlertForGuest;
  // The floor-plan projection is pure: keep it real so the route assertions
  // check the actual guest shape, not a stubbed one.
  stubs.projectFloorMapForGuest = actual.projectFloorMapForGuest;
  return stubs;
});

vi.mock('../../db/settings', () => ({ getSettingsOrDefaults: vi.fn(async () => ({})) }));

import { handleSystemRoutes } from './system';
import { handleManifestRoutes } from './manifest';
import { handleRegisterRoutes } from './register';
import { handleGuestRoutes } from './guests';
import { handleRsvpRoutes } from './rsvp';
import { handleGuestbookRoutes } from './guestbook';
import { handlePhotoRoutes } from './photos';
import { handleSettingsRoutes } from './settings';
import { handleAlertRoutes } from './alerts';
import { handleFloorPlanRoutes } from './floorplan';
import { handleGiftRoutes } from './gifts';
import { handleAgendaRoutes } from './agenda';
import { handleCheckInRoutes } from './checkin';

const HANDLERS = [
  handleSystemRoutes,
  handleManifestRoutes,
  handleRegisterRoutes,
  handleGuestRoutes,
  handleRsvpRoutes,
  handleGuestbookRoutes,
  handlePhotoRoutes,
  handleSettingsRoutes,
  handleAlertRoutes,
  handleFloorPlanRoutes,
  handleGiftRoutes,
  handleAgendaRoutes,
  handleCheckInRoutes,
];

// `guard` lets a test drive the real admin gate (adminGuard) through the
// dispatcher instead of the default stubs, which is how "unset denies" is pinned.
const call = async (
  method: string,
  pathname: string,
  body?: unknown,
  guard?: { adminOnly: () => boolean; requireAdmin: () => void }
) => {
  const out: { statusCode?: number; body?: any } = {};
  const response = {
    writeHead: (statusCode: number) => { out.statusCode = statusCode; return response; },
    end: (payload?: string) => { out.body = payload ? JSON.parse(payload) : undefined; return response; },
  };
  const req = new EventEmitter() as EventEmitter & http.IncomingMessage;
  (req as unknown as { method: string }).method = method;
  (req as unknown as { destroy: () => void }).destroy = () => {};
  setImmediate(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  const ctx = {
    req,
    res: response as unknown as http.ServerResponse,
    url: new URL(`http://localhost${pathname}`),
    ip: '127.0.0.1',
    adminOnly: guard?.adminOnly ?? h.adminOnly,
    requireAdmin: guard?.requireAdmin ?? h.requireAdmin,
    guestLock: h.guestLock,
  } as RouteCtx;

  try {
    for (const handler of HANDLERS) {
      if (await handler(ctx)) return out;
    }
  } catch (err) {
    // What server.ts does with a thrown guard failure.
    if (err instanceof HttpError) return { statusCode: err.status, body: { error: err.message } };
    throw err;
  }
  return { ...out, statusCode: 404, body: { error: 'ENDPOINT_NOT_FOUND' } };
};

beforeEach(() => {
  h.requireAdmin.mockReset();
  h.requireAdmin.mockImplementation(() => {});
  h.guestLock.mockReset();
  h.guestLock.mockResolvedValue(null);
  h.adminOnly.mockReset();
  h.adminOnly.mockReturnValue(false);
});

describe('public routes', () => {
  it('answers health, capabilities, the manifest and the register message', async () => {
    expect(await call('GET', '/api/health')).toMatchObject({ statusCode: 200 });
    expect(await call('GET', '/api/manifest')).toMatchObject({ statusCode: 200 });
    expect(await call('GET', '/api/capabilities')).toMatchObject({ statusCode: 200 });
    expect(await call('GET', '/api/register/message')).toMatchObject({ statusCode: 200 });
  });

  it('answers the seating roster and floor plan', async () => {
    expect(await call('GET', '/api/floorplan')).toMatchObject({ statusCode: 200 });
    expect(await call('GET', '/api/floorplan/roster?code=1234')).toMatchObject({ statusCode: 200 });
  });

  it('answers the gift-free guest surfaces', async () => {
    expect(await call('GET', '/api/settings')).toMatchObject({ statusCode: 200 });
    expect(await call('GET', '/api/guestbook')).toMatchObject({ statusCode: 200 });
    expect(await call('GET', '/api/photos')).toMatchObject({ statusCode: 200 });
    expect(await call('GET', '/api/alerts')).toMatchObject({ statusCode: 200 });
  });

  it('locks guest content behind the content window', async () => {
    h.guestLock.mockResolvedValue({ opensAt: '2026-08-01' });
    for (const [method, path] of [['GET', '/api/guestbook'], ['POST', '/api/guestbook'], ['GET', '/api/photos'], ['POST', '/api/upload']]) {
      const res = await call(method, path);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('GUEST_CONTENT_LOCKED');
    }
  });

  it('404s a path no module claims, and a method it does not serve', async () => {
    expect(await call('GET', '/api/nope')).toMatchObject({ statusCode: 404, body: { error: 'ENDPOINT_NOT_FOUND' } });
    expect(await call('DELETE', '/api/health')).toMatchObject({ statusCode: 404 });
  });
});

describe('admin routes are gated', () => {
  const adminOnlyCases: Array<[string, string]> = [
    ['GET', '/api/guests'],
    ['POST', '/api/guests'],
    ['GET', '/api/guests/universal-message'],
    ['GET', '/api/guests/abc/invite-message'],
    ['PUT', '/api/guests/abc'],
    ['DELETE', '/api/guests/abc'],
    ['POST', '/api/guests/abc/approve'],
    ['POST', '/api/guests/abc/remove-attendee'],
    ['POST', '/api/guests/batch-import'],
    ['GET', '/api/gifts'],
    ['POST', '/api/gifts'],
    ['POST', '/api/gifts/abc/thankyou'],
    ['DELETE', '/api/gifts/abc'],
    ['GET', '/api/agenda'],
    ['POST', '/api/agenda/reorder'],
    ['PATCH', '/api/agenda/abc'],
    ['DELETE', '/api/agenda/abc'],
    ['POST', '/api/check-in'],
    ['POST', '/api/check-in/undo'],
    ['GET', '/api/check-in/stats'],
    ['PATCH', '/api/guestbook/abc'],
    ['DELETE', '/api/guestbook/abc'],
    ['PATCH', '/api/photos/abc'],
    ['DELETE', '/api/photos/abc'],
    ['POST', '/api/floorplan'],
    ['POST', '/api/floorplan/share-email'],
    ['POST', '/api/alerts'],
    ['DELETE', '/api/alerts/abc'],
    ['POST', '/api/wipe-data'],
    ['POST', '/api/rehearsal/start'],
    ['POST', '/api/send-invitations'],
    ['POST', '/api/send-reminders'],
  ];

  it('asks for the admin token on every admin endpoint', async () => {
    h.requireAdmin.mockImplementation(() => { throw new HttpError(401, 'Unauthorized'); });
    for (const [method, path] of adminOnlyCases) {
      const res = await call(method, path, {});
      expect(`${method} ${path} → ${res.statusCode}`).toBe(`${method} ${path} → 401`);
    }
  });

  it('serves them once the token is accepted (handler-level status, not the gate)', async () => {
    for (const [method, path] of adminOnlyCases) {
      const res = await call(method, path, {});
      expect(`${method} ${path} → ${res.statusCode}`).not.toMatch(/→ (401|403|404)$/);
    }
  });

  it('keeps the public self-service check-in ungated', async () => {
    const res = await call('POST', '/api/check-in/self', { code: '1234', name: 'Alice' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('keeps GET /api/settings public but hides the host contact details', async () => {
    const service = await import('../../db/service');
    vi.mocked(service.getSettingsOrUndefined).mockResolvedValueOnce({ babyName: 'Lou', hostEmail: 'h@x.com', hostPhone: '555' } as never);
    const res = await call('GET', '/api/settings');
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.settings).toMatchObject({ babyName: 'Lou' });
    expect(res.body.settings).not.toHaveProperty('hostEmail');
    expect(res.body.settings).not.toHaveProperty('hostPhone');
  });
});

describe('the floor plan read is a projection for guests', () => {
  const SAMPLE_MAP = {
    id: 'm1',
    canvasWidth: 850,
    canvasHeight: 520,
    roomShape: 'rectangle',
    tables: [
      {
        id: 't1', name: 'Table 1', shape: 'circle', x: 0, y: 0, width: 100, height: 100, capacity: 4,
        assignedGuestIds: ['g1', 'g2'],
        seats: [
          { guestId: 'g1', attendeeIndex: 0 },
          { guestId: 'g2', attendeeIndex: 0 },
          null,
          null,
        ],
      },
    ],
    landmarks: [{ id: 'l1', name: 'Bar', type: 'bar', x: 1, y: 2, width: 3, height: 4 }],
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const guest = () => adminGuard(undefined, undefined, '198.51.100.9');

  it('blanks guest identities but keeps geometry, names and occupancy for a non-admin', async () => {
    const service = await import('../../db/service');
    vi.mocked(service.getFloorMap).mockResolvedValueOnce(SAMPLE_MAP as never);
    const res = await call('GET', '/api/floorplan', undefined, guest());
    const map = res.body.floorMap;
    expect(map.tables[0].seats).toEqual([
      { guestId: '', attendeeIndex: 0 },
      { guestId: '', attendeeIndex: 0 },
      null,
      null,
    ]);
    expect(map.tables[0]).toMatchObject({ id: 't1', name: 'Table 1', capacity: 4 });
    expect(map.tables[0].assignedGuestIds).toEqual([]);
    expect(map.landmarks).toEqual(SAMPLE_MAP.landmarks);
    expect(map.tables[0].seats.filter(Boolean)).toHaveLength(2);
  });

  it('keeps the requester party when the read identifies them by code', async () => {
    const service = await import('../../db/service');
    vi.mocked(service.getFloorMap).mockResolvedValueOnce(SAMPLE_MAP as never);
    vi.mocked(service.getGuestIdsForIdentity).mockResolvedValueOnce(['g1'] as never);
    const res = await call('GET', '/api/floorplan?code=1234', undefined, guest());
    expect(res.body.floorMap.tables[0].seats[0]).toEqual({ guestId: 'g1', attendeeIndex: 0 });
    expect(res.body.floorMap.tables[0].seats[1]).toEqual({ guestId: '', attendeeIndex: 0 });
    expect(res.body.floorMap.tables[0].assignedGuestIds).toEqual(['g1']);
    expect(vi.mocked(service.getGuestIdsForIdentity)).toHaveBeenCalledWith(undefined, '1234');
  });

  it('keeps the requester party when the read identifies them by magic token', async () => {
    const service = await import('../../db/service');
    vi.mocked(service.getFloorMap).mockResolvedValueOnce(SAMPLE_MAP as never);
    vi.mocked(service.getGuestIdsForIdentity).mockResolvedValueOnce(['g2'] as never);
    const res = await call('GET', '/api/floorplan?guest=tok-alice', undefined, guest());
    expect(res.body.floorMap.tables[0].seats[0]).toEqual({ guestId: '', attendeeIndex: 0 });
    expect(res.body.floorMap.tables[0].seats[1]).toEqual({ guestId: 'g2', attendeeIndex: 0 });
    expect(vi.mocked(service.getGuestIdsForIdentity)).toHaveBeenCalledWith('tok-alice', undefined);
  });

  it('returns the stored plan unchanged to an admin', async () => {
    const service = await import('../../db/service');
    vi.mocked(service.getFloorMap).mockResolvedValueOnce(SAMPLE_MAP as never);
    vi.mocked(service.getGuestIdsForIdentity).mockClear();
    const admin = adminGuard('correct-token-value', 'correct-token-value', '198.51.100.9');
    const res = await call('GET', '/api/floorplan', undefined, admin);
    expect(res.body.floorMap).toEqual(SAMPLE_MAP);
    expect(vi.mocked(service.getGuestIdsForIdentity)).not.toHaveBeenCalled();
  });
});

describe('the alerts read is a projection for guests', () => {
  const at = (token: string | undefined) => adminGuard(token, token, '198.51.100.9');

  it('drops the host delivery counter for a non-admin but keeps the guest fields', async () => {
    const res = await call('GET', '/api/alerts', undefined, at(undefined));
    expect(res.statusCode).toBe(200);
    const alert = res.body.alerts[0];
    expect(alert).not.toHaveProperty('notified_guests_count');
    expect(alert).toMatchObject({
      id: 'a1',
      type: 'CUSTOM',
      title: 'Pool closed',
      message: 'Back at 4',
      active: true,
      target_audience: 'ALL',
      created_at: '2026-01-01T00:00:00Z',
    });
  });

  it('returns the full records to an admin', async () => {
    const res = await call('GET', '/api/alerts', undefined, at('correct-token-value'));
    expect(res.statusCode).toBe(200);
    expect(res.body.alerts[0].notified_guests_count).toBe(7);
  });
});

describe('the rehearsal status read is split by audience', () => {
  const at = (token: string | undefined) => adminGuard(token, token, '198.51.100.9');

  it('returns only { active } to a non-admin', async () => {
    const res = await call('GET', '/api/rehearsal', undefined, at(undefined));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ active: true });
  });

  it('returns the full status, tokens included, to an admin', async () => {
    const res = await call('GET', '/api/rehearsal', undefined, at('correct-token-value'));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ active: true, pendingToken: 'pend-token' });
    expect(res.body.sample).toEqual({ name: 'Rehearsal Guest', code: '4242', magic_token: 'tok-sample' });
  });
});

describe('the admin gate is closed when the secret is absent', () => {
  const at = (header: unknown, token: string | undefined) => adminGuard(header, token, '198.51.100.7');

  it('401s an admin route with ADMIN_TOKEN unset, with or without a header', async () => {
    expect((await call('GET', '/api/guests', undefined, at(undefined, undefined))).statusCode).toBe(401);
    expect((await call('GET', '/api/guests', undefined, at('anything', undefined))).statusCode).toBe(401);
    expect((await call('GET', '/api/guests', undefined, at('anything', ''))).statusCode).toBe(401);
  });

  it('200s with the correct token and 401s with a wrong one', async () => {
    expect((await call('GET', '/api/guests', undefined, at('correct-token-value', 'correct-token-value'))).statusCode).toBe(200);
    expect((await call('GET', '/api/guests', undefined, at('wrong-token-value', 'correct-token-value'))).statusCode).toBe(401);
  });
});

describe('path params and bodies', () => {
  it('reads a guest id out of the path', async () => {
    const service = await import('../../db/service');
    const removeAttendee = vi.mocked(service.removeGuestAttendee);
    removeAttendee.mockResolvedValueOnce({ deleted: false, guest: {} } as never);
    await call('POST', '/api/guests/g-42/remove-attendee', { index: 1 });
    expect(removeAttendee).toHaveBeenCalledWith('g-42', 1, undefined);
  });

  it('reads both id and action from a gift path', async () => {
    const service = await import('../../db/service');
    const toggle = vi.mocked(service.toggleGiftThankYou);
    await call('POST', '/api/gifts/gift-7/thankyou');
    expect(toggle).toHaveBeenCalledWith('gift-7');
  });

  it('rejects a body the schema refuses with one error shape', async () => {
    const res = await call('POST', '/api/gifts', { gift_description: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_PAYLOAD');
  });

  it('rejects an unknown settings key', async () => {
    const res = await call('POST', '/api/settings', { babyName: 'Lou', bogus: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Unknown setting: bogus');
  });
});
