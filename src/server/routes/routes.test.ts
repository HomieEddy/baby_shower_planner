import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type http from 'node:http';
import { HttpError } from '../http';
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
  const stubs = Object.fromEntries(Object.keys(actual).map((key) => [key, vi.fn(async () => ({}))]));
  // The one stub whose shape the handler reads.
  stubs.selfCheckIn = vi.fn(async () => ({ ok: true, guest: {} }));
  return stubs;
});

vi.mock('../../db/settings', () => ({ getSettingsOrDefaults: vi.fn(async () => ({})) }));

import { handleSystemRoutes } from './system';
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

const call = async (method: string, pathname: string, body?: unknown) => {
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
    adminOnly: h.adminOnly,
    requireAdmin: h.requireAdmin,
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
  it('answers health, capabilities and the register message', async () => {
    expect(await call('GET', '/api/health')).toMatchObject({ statusCode: 200 });
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
    vi.mocked(service.getSettings).mockResolvedValueOnce({ babyName: 'Lou', hostEmail: 'h@x.com', hostPhone: '555' } as never);
    const res = await call('GET', '/api/settings');
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.settings).toMatchObject({ babyName: 'Lou' });
    expect(res.body.settings).not.toHaveProperty('hostEmail');
    expect(res.body.settings).not.toHaveProperty('hostPhone');
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
