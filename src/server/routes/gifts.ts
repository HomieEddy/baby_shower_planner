// Gift log CRUD, thank-you drafting/sending.

import type { RouteCtx } from '../http';
import { parseJson, sendError, sendJson } from '../http';
import { GiftLogSchema } from '../../lib/validation';
import { DomainError } from '../../lib/errors';
import { getSettingsOrDefaults } from '../../db/settings';
import { addGift, deleteGift, getGiftById, getGifts, toggleGiftThankYou } from '../../db/service';

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
    const settings = await getSettingsOrDefaults();
    // Dynamic import avoids a static gifts <-> thankyou cycle (thankyou reads gifts).
    const { generateThankYouDraft } = await import('../../db/thankyou');
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
      const { sendGiftThankYou } = await import('../../db/thankyou');
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
