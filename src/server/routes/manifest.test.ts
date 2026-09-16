import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  getSettingsOrUndefined: vi.fn(async (): Promise<Record<string, unknown> | undefined> => undefined),
}));

vi.mock('../../db/service', () => ({ getSettingsOrUndefined: h.getSettingsOrUndefined }));

import { handleManifestRoutes } from './manifest';

// Exercises the real dispatcher and the real sendJson, so the manifest's
// install-relevant content type is covered, not just the body.
const request = async () => {
  const out: { statusCode?: number; headers?: Record<string, string>; body?: any } = {};
  const res = {
    writeHead: (statusCode: number, headers: Record<string, string>) => {
      out.statusCode = statusCode;
      out.headers = headers;
      return res;
    },
    end: (payload: string) => {
      out.body = JSON.parse(payload);
      return res;
    },
  };
  const ctx = {
    req: { method: 'GET' } as any,
    res: res as any,
    url: new URL('http://localhost/api/manifest'),
    ip: '127.0.0.1',
    adminOnly: () => false,
    requireAdmin: () => {},
    guestLock: async () => null,
  } as any;
  await handleManifestRoutes(ctx);
  return out;
};

beforeEach(() => h.getSettingsOrUndefined.mockReset());

describe('GET /api/manifest', () => {
  it('carries the event name and its theme accent and background', async () => {
    h.getSettingsOrUndefined.mockResolvedValue({
      eventTitle: 'Sophie & Marc',
      themeId: 'lavender-dreams',
    });
    const res = await request();
    expect(res.statusCode).toBe(200);
    expect(res.headers!['Content-Type']).toBe('application/manifest+json');
    expect(res.body.name).toBe('Sophie & Marc');
    expect(res.body.theme_color).toBe('#8E6DCB');
    expect(res.body.background_color).toBe('#F6F4F9');
  });

  it('falls back to a neutral name and the default theme for an unseeded event', async () => {
    h.getSettingsOrUndefined.mockResolvedValue(undefined);
    const res = await request();
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Our Celebration');
    expect(res.body.theme_color).toBe('#D99A9A');
    expect(res.body.background_color).toBe('#FBF2F3');
  });
});
