// Gift log CRUD + the HTTP handler for /api/gifts (kept in one module).
import type { GiftLog, EventSettings } from '../types';
import { fromRecord, pb } from './client';
import { getSettings } from './settings';
import { GiftLogSchema } from '../lib/validation';
import { DomainError } from '../lib/errors';
import type { RouteCtx } from '../server/http';
import { parseJson, sendError, sendJson } from '../server/http';

export async function getGifts(): Promise<GiftLog[]> {
  const records = await pb.collection('gifts').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<GiftLog>(r));
}

export async function addGift(payload: Omit<GiftLog, 'id' | 'created_at' | 'thank_you_sent'>): Promise<GiftLog> {
  const r = await pb.collection('gifts').create({
    guest_name: payload.guest_name, guest_id: payload.guest_id || '',
    gift_description: payload.gift_description, category: payload.category || 'Other',
    thank_you_sent: false, created_at: new Date().toISOString(),
  });
  return fromRecord<GiftLog>(r);
}

export async function toggleGiftThankYou(id: string): Promise<GiftLog | undefined> {
  try {
    const r = await pb.collection('gifts').getOne(id);
    const now = new Date().toISOString().split('T')[0];
    const updated = await pb.collection('gifts').update(id, {
      thank_you_sent: !r.thank_you_sent,
      thank_you_date: !r.thank_you_sent ? now : null,
    });
    return fromRecord<GiftLog>(updated);
  } catch { return undefined; }
}

export async function deleteGift(id: string): Promise<void> {
  await pb.collection('gifts').delete(id);
}

export async function getGiftById(id: string): Promise<GiftLog> {
  const r = await pb.collection('gifts').getOne(id);
  return fromRecord<GiftLog>(r);
}

// ─── HTTP handler ──────────────────────────────────────────────────

export async function handleGiftRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url, requireAdmin } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/gifts') {
    requireAdmin();
    if (method === 'GET') {
      const gifts = await getGifts();
      return sendJson(res, 200, { gifts });
    }
    if (method === 'POST') {
      const body = await parseJson(req);
      const validation = GiftLogSchema.safeParse(body);
      if (!validation.success) {
        return sendError(res, 'INVALID_PAYLOAD', validation.error.issues[0]?.message);
      }
      const newGift = await addGift(validation.data);
      return sendJson(res, 200, { success: true, gift: newGift });
    }
  }

  if (!pathname.startsWith('/api/gifts/')) return false;

  const parts = pathname.replace('/api/gifts/', '').split('/');
  const id = parts[0];
  const action = parts[1];

  if (action === 'thankyou' && method === 'POST') {
    requireAdmin();
    const updated = await toggleGiftThankYou(id);
    return sendJson(res, 200, { success: true, gift: updated });
  }

  if (action === 'draft' && method === 'POST') {
    requireAdmin();
    const gift = await getGiftById(id);
    let settings: Partial<EventSettings> = {};
    try {
      settings = await getSettings();
    } catch { /* no event settings yet — fallback placeholders */ }
    // Dynamic import avoids a static gifts <-> thankyou cycle (thankyou reads gifts).
    const { generateThankYouDraft } = await import('./thankyou');
    const draft = await generateThankYouDraft(gift, settings);
    return sendJson(res, 200, { success: true, draft });
  }

  if (action === 'send-thankyou' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    const { channel, text } = body;
    if (!['email', 'text', 'both'].includes(channel)) {
      return sendError(res, 'INVALID_CHANNEL');
    }
    if (!text || !text.trim()) return sendError(res, 'MESSAGE_REQUIRED');
    try {
      const { sendGiftThankYou } = await import('./thankyou');
      const result = await sendGiftThankYou(id, channel, text.trim());
      return sendJson(res, 200, { success: true, ...result });
    } catch (err) {
      // GUEST_NOT_FOUND / NO_EMAIL / NO_PHONE propagate as DomainError (400);
      // an unexpected send failure is a 500.
      if (err instanceof DomainError) throw err;
      throw new DomainError('SEND_FAILED');
    }
  }

  if (method === 'DELETE') {
    requireAdmin();
    await deleteGift(id);
    return sendJson(res, 200, { success: true });
  }

  return false;
}