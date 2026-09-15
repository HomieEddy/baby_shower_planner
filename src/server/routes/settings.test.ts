import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  updateSettings: vi.fn(async (payload: unknown) => payload),
  getSettings: vi.fn(async () => ({ babyName: 'Bébé' })),
}));

vi.mock('../../db/service', () => ({
  getSettings: h.getSettings,
  updateSettings: h.updateSettings,
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
    sendJson: (res: { statusCode?: number; body?: unknown }, statusCode: number, data: unknown) => write(res, statusCode, data),
    sendError: (res: { statusCode?: number; body?: unknown }, code: string, message?: string) =>
      write(res, errorStatus(code as never), { error: code, message: message ?? errorMessage(code as never) }),
  };
});

import { handleSettingsRoutes } from './settings';

const post = (body: unknown) => {
  const res: { statusCode?: number; body?: any } = {};
  const ctx = {
    req: { method: 'POST', body } as any,
    res: res as any,
    url: new URL('http://localhost/api/settings'),
    ip: '127.0.0.1',
    adminOnly: () => true,
    requireAdmin: () => {},
  } as any;
  return handleSettingsRoutes(ctx).then(() => res);
};

beforeEach(() => h.updateSettings.mockClear());

describe('POST /api/settings', () => {
  it('passes host settings through', async () => {
    const res = await post({ babyName: 'Lou', venueName: 'Salle', schedule: [] });
    expect(res.statusCode).toBe(200);
    expect(h.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ babyName: 'Lou', venueName: 'Salle' }));
  });

  it('rejects a key the domain does not define instead of storing it', async () => {
    const res = await post({ babyName: 'Lou', is_admin: true });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_PAYLOAD');
    expect(res.body.message).toBe('Unknown setting: is_admin');
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it('still validates the reminder fields it owns', async () => {
    const res = await post({ hostEmail: 'not-an-email' });
    expect(res.statusCode).toBe(400);
    expect(h.updateSettings).not.toHaveBeenCalled();
  });
});
