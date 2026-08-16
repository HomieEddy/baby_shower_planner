// Guest admin CRUD, reservation-code resolution, invite-message preview and
// batch import.

import type { RouteCtx } from '../http';
import { parseJson, rateLimit, sendJson } from '../http';
import { EditGuestSchema } from '../../lib/validation';
import {
  addGuest,
  batchImportGuests,
  deleteGuest,
  getAllGuests,
  getGuestByCode,
  getGuestById,
  inviteMessageFor,
  updateGuest,
} from '../../db/service';

export async function handleGuestRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url, ip, requireAdmin } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  // Resolve a 4-digit reservation code to the guest's magic token (guest
  // portal login). Tightly rate limited: the code space is only 10k.
  if (pathname === '/api/guest/resolve' && method === 'GET') {
    const code = (url.searchParams.get('code') || '').trim();
    if (!/^\d{4}$/.test(code)) return sendJson(res, 400, { error: 'INVALID_CODE', message: 'Reservation code must be 4 digits' });
    const attempt = rateLimit(`code-resolve:${ip}`, 10, 60_000);
    if (!attempt.allowed) return sendJson(res, 429, { error: 'Too many attempts. Try again later.' });
    const guest = await getGuestByCode(code);
    if (!guest) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Reservation code not found' });
    return sendJson(res, 200, { magic_token: guest.magic_token });
  }

  if (pathname === '/api/guests') {
    requireAdmin();
    if (method === 'GET') {
      const guests = await getAllGuests();
      return sendJson(res, 200, { guests });
    }
    if (method === 'POST') {
      const body = await parseJson(req);
      const { name, email, phone, delivery_channel, max_party_size, language_pref } = body;
      const channel = delivery_channel || 'none';
      if (!name || !name.trim()) return sendJson(res, 400, { error: 'Guest name is required' });
      if ((channel === 'email' || channel === 'both') && (!email || !email.trim())) return sendJson(res, 400, { error: 'Email address is required' });
      if ((channel === 'text' || channel === 'both') && (!phone || !phone.trim())) return sendJson(res, 400, { error: 'Phone number is required' });
      if (!['email', 'text', 'both', 'none'].includes(channel)) return sendJson(res, 400, { error: 'Invalid delivery channel' });

      const result = await addGuest({
        name: name.trim(), email: email?.trim() || '', phone: phone?.trim() || '',
        delivery_channel: channel, max_party_size: Number(max_party_size) || 1,
        language_pref: language_pref === 'EN' ? 'EN' : 'FR',
      });
      return sendJson(res, 200, result);
    }
  }

  if (pathname.startsWith('/api/guests/') && pathname !== '/api/guests/batch-import') {
    if (method === 'GET' && pathname.endsWith('/invite-message')) {
      requireAdmin();
      const id = pathname.replace('/api/guests/', '').replace('/invite-message', '');
      const guest = await getGuestById(id);
      return sendJson(res, 200, { message: await inviteMessageFor(guest) });
    }
    const id = pathname.replace('/api/guests/', '');
    requireAdmin();
    if (method === 'PUT') {
      const body = await parseJson(req);
      const validation = EditGuestSchema.partial().safeParse(body);
      if (!validation.success) {
        return sendJson(res, 400, { error: validation.error.issues[0]?.message || 'Invalid guest payload' });
      }
      const guest = await updateGuest(id, validation.data);
      return sendJson(res, 200, { guest });
    }
    if (method === 'DELETE') {
      await deleteGuest(id);
      return sendJson(res, 200, { success: true });
    }
  }

  if (pathname === '/api/guests/batch-import' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    if (!Array.isArray(body.guests) || body.guests.length === 0) {
      return sendJson(res, 400, { error: 'Array of guest objects is required' });
    }
    const result = await batchImportGuests(body.guests);
    return sendJson(res, 200, { success: true, count: result.count, imported: result.imported });
  }

  return false;
}