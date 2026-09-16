import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  updateSettings: vi.fn(async (payload: unknown) => payload),
  getSettingsOrUndefined: vi.fn(async (): Promise<Record<string, unknown> | undefined> => ({ babyName: 'Bébé' })),
}));

vi.mock('../../db/service', () => ({
  getSettingsOrUndefined: h.getSettingsOrUndefined,
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

// The only request facts the handler reads are the method and, for a read,
// whether the caller is the host.
const request = (method: 'GET' | 'POST', { body, admin = false }: { body?: unknown; admin?: boolean } = {}) => {
  const res: { statusCode?: number; body?: any } = {};
  const ctx = {
    req: { method, body } as any,
    res: res as any,
    url: new URL('http://localhost/api/settings'),
    ip: '127.0.0.1',
    adminOnly: () => admin,
    requireAdmin: () => {},
  } as any;
  return handleSettingsRoutes(ctx).then(() => res);
};

beforeEach(() => h.updateSettings.mockClear());

describe('GET /api/settings', () => {
  const row = { eventTitle: 'Sophie & Marc', babyName: 'Lou', hostEmail: 'h@x.com', hostPhone: '555' };
  beforeEach(() => h.getSettingsOrUndefined.mockReset());

  it('reports an unseeded event as no settings instead of failing', async () => {
    h.getSettingsOrUndefined.mockResolvedValue(undefined);
    const res = await request('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ settings: null });
  });

  it('hides the host contact details from guests', async () => {
    h.getSettingsOrUndefined.mockResolvedValue({ ...row });
    const res = await request('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body.settings).toMatchObject({ eventTitle: 'Sophie & Marc', babyName: 'Lou' });
    expect(res.body.settings).not.toHaveProperty('hostEmail');
    expect(res.body.settings).not.toHaveProperty('hostPhone');
  });

  it('keeps the host contact details for the host', async () => {
    h.getSettingsOrUndefined.mockResolvedValue({ ...row });
    const res = await request('GET', { admin: true });
    expect(res.body.settings).toMatchObject(row);
  });
});

describe('POST /api/settings', () => {
  it('passes host settings through', async () => {
    const res = await request('POST', { body: { eventTitle: 'Sophie & Marc', babyName: 'Lou', venueName: 'Salle', schedule: [] } });
    expect(res.statusCode).toBe(200);
    expect(h.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ eventTitle: 'Sophie & Marc', babyName: 'Lou', venueName: 'Salle' })
    );
  });

  it('rejects a key the domain does not define instead of storing it', async () => {
    const res = await request('POST', { body: { babyName: 'Lou', is_admin: true } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_PAYLOAD');
    expect(res.body.message).toBe('Unknown setting: is_admin');
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it('still validates the reminder fields it owns', async () => {
    const res = await request('POST', { body: { hostEmail: 'not-an-email' } });
    expect(res.statusCode).toBe(400);
    expect(h.updateSettings).not.toHaveBeenCalled();
  });
});
