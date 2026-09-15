import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type http from 'node:http';

// The security primitives have no test of their own in the suite, so the
// request-boundary behaviour (rate limiting, client IP, origin check, secret
// validation, body parsing) is pinned here.

const loadHttp = async (env: Record<string, string | undefined> = {}) => {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string);
  return import('./http');
};

// Minimal stand-in for the request stream parseJson consumes.
const fakeReq = (chunks: (string | Buffer)[]) => {
  const req = new EventEmitter() as EventEmitter & http.IncomingMessage;
  (req as unknown as { destroy: () => void }).destroy = vi.fn();
  setImmediate(() => {
    for (const chunk of chunks) req.emit('data', Buffer.from(chunk));
    req.emit('end');
  });
  return req;
};

const reqWith = (headers: Record<string, string | undefined>, remoteAddress = '10.0.0.1') =>
  ({ headers, socket: { remoteAddress } }) as unknown as http.IncomingMessage;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('rateLimit', () => {
  it('allows up to the limit inside the window, then blocks with a retry hint', async () => {
    vi.useFakeTimers();
    const { rateLimit } = await loadHttp();
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('ip:a', 3, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit('ip:a', 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);

    // Window expiry resets the bucket.
    vi.advanceTimersByTime(60_001);
    expect(rateLimit('ip:a', 3, 60_000).allowed).toBe(true);
    vi.useRealTimers();
  });

  it('keeps separate buckets per key', async () => {
    const { rateLimit } = await loadHttp();
    expect(rateLimit('ip:b', 1, 60_000).allowed).toBe(true);
    expect(rateLimit('ip:b', 1, 60_000).allowed).toBe(false);
    expect(rateLimit('ip:c', 1, 60_000).allowed).toBe(true);
  });
});

describe('clientIp', () => {
  it('uses the first X-Forwarded-For hop when the proxy is trusted', async () => {
    const { clientIp } = await loadHttp();
    expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18' }))).toBe('203.0.113.9');
  });

  it('ignores the forwarded header when TRUST_PROXY=false', async () => {
    const { clientIp } = await loadHttp({ TRUST_PROXY: 'false' });
    expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.9' }))).toBe('10.0.0.1');
  });

  it('falls back to the socket when no header is present', async () => {
    const { clientIp } = await loadHttp();
    expect(clientIp(reqWith({}))).toBe('10.0.0.1');
  });
});

describe('originMatchesHost', () => {
  it('passes a non-browser request (no Origin) and a same-origin one', async () => {
    const { originMatchesHost } = await loadHttp();
    expect(originMatchesHost(reqWith({ host: 'app.test' }))).toBe(true);
    expect(originMatchesHost(reqWith({ host: 'app.test', origin: 'https://app.test' }))).toBe(true);
  });

  it('rejects a cross-site Origin and a malformed one', async () => {
    const { originMatchesHost } = await loadHttp();
    expect(originMatchesHost(reqWith({ host: 'app.test', origin: 'https://evil.test' }))).toBe(false);
    expect(originMatchesHost(reqWith({ host: 'app.test', origin: 'not a url' }))).toBe(false);
  });

  it('accepts the APP_URL origin behind a proxy', async () => {
    const { originMatchesHost } = await loadHttp({ APP_URL: 'https://shower.example' });
    expect(originMatchesHost(reqWith({ host: 'internal.railway', origin: 'https://shower.example' }))).toBe(true);
  });
});

describe('validateSecrets', () => {
  it('refuses to start in production with known-weak secrets', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { validateSecrets } = await loadHttp({
      NODE_ENV: 'production',
      ADMIN_TOKEN: 'babyshower-admin-2026',
      PB_ADMIN_EMAIL: 'a@b.c',
      PB_ADMIN_PASSWORD: 'changeme123',
      POCKETBASE_URL: 'http://pb:8090',
    });
    validateSecrets();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('only warns outside production', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { validateSecrets } = await loadHttp({ NODE_ENV: 'development', ADMIN_TOKEN: 'short' });
    validateSecrets();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe('parseJson', () => {
  it('parses a JSON body and treats an empty body as {}', async () => {
    const { parseJson } = await loadHttp();
    expect(await parseJson(fakeReq(['{"a":1}']))).toEqual({ a: 1 });
    expect(await parseJson(fakeReq([]))).toEqual({});
  });

  it('rejects malformed JSON with a 400', async () => {
    const { parseJson } = await loadHttp();
    await expect(parseJson(fakeReq(['{oops']))).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a body over MAX_BODY_BYTES with a 413 and destroys the request', async () => {
    const { parseJson } = await loadHttp({ MAX_BODY_BYTES: '10' });
    const req = fakeReq(['x'.repeat(50)]);
    await expect(parseJson(req)).rejects.toMatchObject({ status: 413 });
    expect((req as unknown as { destroy: () => void }).destroy).toHaveBeenCalled();
  });
});
