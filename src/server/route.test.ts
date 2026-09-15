import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type http from 'node:http';
import { z } from 'zod';
import { HttpError } from './http';

// The dispatcher is the one place every guard lives, so its behaviour is the
// contract: order, admin gate, guest lock, body parse, params, no-match.

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  guestLock: vi.fn(async (): Promise<{ opensAt?: string } | null> => null),
  handler: vi.fn(() => true),
  lockedHandler: vi.fn(() => true),
  adminHandler: vi.fn(() => true),
}));

import { handleRoutes, parseOrFail, type Route } from './route';
import type { RouteCtx } from './http';

// Minimal ServerResponse: writeHead + end are all sendJson/sendError use.
const makeRes = () => {
  const out: { statusCode?: number; body?: unknown } = {};
  const response = {
    writeHead: (statusCode: number) => { out.statusCode = statusCode; return response; },
    end: (payload?: string) => { out.body = payload ? JSON.parse(payload) : undefined; return response; },
  };
  return { out, response: response as unknown as http.ServerResponse };
};

// A request the real parseJson can consume.
const makeReq = (method: string, body: unknown) => {
  const req = new EventEmitter() as EventEmitter & http.IncomingMessage;
  (req as unknown as { method: string }).method = method;
  (req as unknown as { destroy: () => void }).destroy = () => {};
  setImmediate(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
};

const ctxFor = (method: string, pathname: string, body: unknown = undefined) => {
  const { out, response } = makeRes();
  const ctx = {
    req: makeReq(method, body),
    res: response,
    url: new URL(`http://localhost${pathname}`),
    ip: '127.0.0.1',
    adminOnly: () => true,
    requireAdmin: h.requireAdmin,
    guestLock: h.guestLock,
  } as unknown as RouteCtx;
  return { ctx, out };
};

beforeEach(() => {
  h.requireAdmin.mockReset();
  h.requireAdmin.mockImplementation(() => {});
  h.guestLock.mockReset();
  h.guestLock.mockResolvedValue(null);
  h.handler.mockClear();
  h.lockedHandler.mockClear();
  h.adminHandler.mockClear();
});

describe('handleRoutes', () => {
  const routes: Route[] = [
    { method: 'GET', path: '/api/health', handler: h.handler },
    { method: 'POST', path: '/api/things', admin: true, body: true, handler: h.adminHandler },
    { method: 'POST', path: '/api/public', lock: true, handler: h.lockedHandler },
    { method: 'DELETE', path: /^\/api\/things\/([^/]+)\/parts\/([^/]+)$/, admin: true, handler: h.handler },
  ];

  it('returns false when no description matches', async () => {
    const { ctx } = ctxFor('GET', '/api/nope');
    expect(await handleRoutes(routes, ctx)).toBe(false);
    expect(h.handler).not.toHaveBeenCalled();
  });

  it('applies the admin gate before the handler', async () => {
    h.requireAdmin.mockImplementation(() => { throw new HttpError(401, 'Unauthorized'); });
    const { ctx } = ctxFor('POST', '/api/things', { anything: true });
    await expect(handleRoutes(routes, ctx)).rejects.toMatchObject({ status: 401 });
    expect(h.adminHandler).not.toHaveBeenCalled();
  });

  it('answers the guest lock without running the handler', async () => {
    h.guestLock.mockResolvedValueOnce({ opensAt: '2026-08-01' });
    const { ctx, out } = ctxFor('POST', '/api/public');
    expect(await handleRoutes(routes, ctx)).toBe(true);
    expect(h.lockedHandler).not.toHaveBeenCalled();
    expect(out.statusCode).toBe(403);
    expect(out.body).toMatchObject({ error: 'GUEST_CONTENT_LOCKED' });
  });

  it('hands the handler a parsed body and the regex params', async () => {
    const { ctx } = ctxFor('POST', '/api/things', { name: 'Lou' });
    await handleRoutes(routes, ctx);
    expect(h.adminHandler).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: 'Lou' }, params: [] }),
      ctx
    );

    const { ctx: deleteCtx } = ctxFor('DELETE', '/api/things/abc/parts/7');
    await handleRoutes(routes, deleteCtx);
    expect(h.handler).toHaveBeenCalledWith(expect.objectContaining({ params: ['abc', '7'] }), deleteCtx);
  });

  it('gives a bodyless handler an empty body object', async () => {
    const { ctx } = ctxFor('GET', '/api/health');
    await handleRoutes(routes, ctx);
    expect(h.handler).toHaveBeenCalledWith(expect.objectContaining({ body: {} }), ctx);
  });

  it('stops at the first matching description', async () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const { ctx } = ctxFor('GET', '/api/dup');
    await handleRoutes(
      [
        { method: 'GET', path: '/api/dup', handler: first },
        { method: 'GET', path: '/api/dup', handler: second },
      ],
      ctx
    );
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});

describe('parseOrFail', () => {
  const schema = z.object({ name: z.string().min(1, 'Name is required') });

  it('returns the parsed data', () => {
    const { response } = makeRes();
    expect(parseOrFail(schema, { name: 'Lou' }, response)).toEqual({ name: 'Lou' });
  });

  it('writes the first issue as INVALID_PAYLOAD and returns null', () => {
    const { out, response } = makeRes();
    expect(parseOrFail(schema, { name: '' }, response)).toBeNull();
    expect(out.statusCode).toBe(400);
    expect(out.body).toEqual({ error: 'INVALID_PAYLOAD', message: 'Name is required' });
  });
});
