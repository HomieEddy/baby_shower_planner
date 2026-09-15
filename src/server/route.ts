// The route seam: one description per endpoint, and one place that applies the
// guards. Handlers only see a parsed body, path params and the query string, so
// an endpoint cannot forget its admin gate, its guest-content lock, or the
// INVALID_PAYLOAD shape for a failed schema.

import type http from 'node:http';
import type { z } from 'zod';
import { parseJson, sendError, sendGuestLocked } from './http';
import type { RouteCtx } from './http';

export interface RouteRequest {
  // Parsed JSON body (`{}` when the handler declares no body).
  body: any;
  // Regex capture groups, in order.
  params: string[];
  query: URLSearchParams;
}

export interface Route {
  method: http.IncomingMessage['method'] | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  // Exact path, or a regex whose capture groups become `params`.
  path: string | RegExp;
  // Admin token required before the handler runs.
  admin?: boolean;
  // Guest content window applies (admins bypass it inside ctx.guestLock).
  lock?: boolean;
  // Parse the JSON body before the handler runs.
  body?: boolean;
  handler: (req: RouteRequest, ctx: RouteCtx) => Promise<boolean> | boolean;
}

// Routes in order; the first matching description wins (same precedence the
// hand-written path ladders had). Returns false when nothing matched, which
// server.ts turns into ENDPOINT_NOT_FOUND.
export async function handleRoutes(routes: Route[], ctx: RouteCtx): Promise<boolean> {
  const method = ctx.req.method || 'GET';
  const pathname = ctx.url.pathname;

  for (const route of routes) {
    if (route.method !== method) continue;

    let params: string[] = [];
    if (typeof route.path === 'string') {
      if (route.path !== pathname) continue;
    } else {
      const match = pathname.match(route.path);
      if (!match) continue;
      params = match.slice(1);
    }

    if (route.admin) ctx.requireAdmin();
    if (route.lock) {
      const locked = await ctx.guestLock();
      if (locked) return sendGuestLocked(ctx.res, locked);
    }

    const body = route.body ? await parseJson(ctx.req) : {};
    return await route.handler({ body, params, query: ctx.url.searchParams }, ctx);
  }

  return false;
}

// Validate with a schema or answer INVALID_PAYLOAD (the first issue's message,
// the one error shape every route used to repeat). Returns null once the
// response has been written, so callers `return true`.
export function parseOrFail<T>(schema: z.ZodType<T>, input: unknown, res: http.ServerResponse): T | null {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    sendError(res, 'INVALID_PAYLOAD', parsed.error.issues[0]?.message);
    return null;
  }
  return parsed.data;
}
