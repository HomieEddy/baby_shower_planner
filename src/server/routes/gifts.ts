// Gift log CRUD plus AI thank-you draft + delivery.

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
import { GiftLogSchema } from '../../lib/validation';
import {
  addGift,
  deleteGift,
  generateThankYouDraft,
  getGiftById,
  getGifts,
  getSettings,
  sendGiftThankYou,
  toggleGiftThankYou,
} from '../../db/service';
import type { EventSettings } from '../../types';

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
        return sendJson(res, 400, { error: validation.error.issues[0]?.message || 'Invalid gift payload' });
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
    const draft = await generateThankYouDraft(gift, settings);
    return sendJson(res, 200, { success: true, draft });
  }

  if (action === 'send-thankyou' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    const { channel, text } = body;
    if (!['email', 'text', 'both'].includes(channel)) {
      return sendJson(res, 400, { error: 'Invalid delivery channel' });
    }
    if (!text || !text.trim()) return sendJson(res, 400, { error: 'Thank-you message is required' });
    try {
      const result = await sendGiftThankYou(id, channel, text.trim());
      return sendJson(res, 200, { success: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SEND_FAILED';
      if (message === 'GUEST_NOT_FOUND' || message === 'NO_EMAIL' || message === 'NO_PHONE') {
        return sendJson(res, 400, { error: message });
      }
      return sendJson(res, 500, { error: 'SEND_FAILED' });
    }
  }

  if (method === 'DELETE') {
    requireAdmin();
    await deleteGift(id);
    return sendJson(res, 200, { success: true });
  }

  return false;
}