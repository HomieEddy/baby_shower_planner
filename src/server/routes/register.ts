// Public self-registration via the universal link. Registrations land as
// pending until a host approves them in the admin.

import type { RouteCtx } from '../http';
import { parseJson, rateLimit, sendJson } from '../http';
import { getUniversalInviteMessage, registerGuest } from '../../db/service';
import type { RegisterGuestPayload } from '../../types';

export async function handleRegisterRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url, ip } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  // Universal invitation message for the host to copy/share.
  if (pathname === '/api/register/message' && method === 'GET') {
    const lang = url.searchParams.get('lang') === 'EN' ? 'EN' : 'FR';
    return sendJson(res, 200, { message: await getUniversalInviteMessage(lang) });
  }

  if (pathname === '/api/register' && method === 'POST') {
    // Public write endpoint: keep a tight per-IP budget on top of the global one.
    const attempt = rateLimit(`register:${ip}`, 5, 60_000);
    if (!attempt.allowed) return sendJson(res, 429, { error: 'RATE_LIMITED', message: 'Too many registrations. Try again later.' });

    const body = await parseJson(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'NAME_REQUIRED', message: 'Your name is required' });

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'INVALID_EMAIL', message: 'Invalid email address' });
    }

    const names = Array.isArray(body.attendee_names)
      ? body.attendee_names.filter((n: unknown): n is string => typeof n === 'string' && n.trim() !== '')
      : [];
    if (names.length > 20) return sendJson(res, 400, { error: 'PARTY_TOO_LARGE', message: 'Party size cannot exceed 20' });

    const payload: RegisterGuestPayload = {
      name,
      email,
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      language_pref: body.language_pref === 'EN' ? 'EN' : 'FR',
      attendee_names: names,
      attendee_details: Array.isArray(body.attendee_details) ? body.attendee_details : undefined,
      dietary_restrictions: typeof body.dietary_restrictions === 'string' ? body.dietary_restrictions : '',
    };
    const refId = typeof body.ref === 'string' && body.ref.trim() ? body.ref.trim() : undefined;

    const result = await registerGuest(payload, refId);
    return sendJson(res, 200, { guest: result.guest, already_registered: result.already_registered });
  }

  return false;
}
