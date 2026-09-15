// Gift log CRUD, thank-you drafting/sending.

import { sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, parseOrFail, type Route } from '../route';
import { GiftLogSchema } from '../../lib/validation';
import { DomainError } from '../../lib/errors';
import { getSettingsOrDefaults } from '../../db/settings';
import { addGift, deleteGift, getGiftById, getGifts, toggleGiftThankYou } from '../../db/service';

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/gifts',
    admin: true,
    handler: async (_req, { res }) => sendJson(res, 200, { gifts: await getGifts() }),
  },

  {
    method: 'POST',
    path: '/api/gifts',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const data = parseOrFail(GiftLogSchema, body, res);
      if (!data) return true;
      const newGift = await addGift(data);
      return sendJson(res, 200, { success: true, gift: newGift });
    },
  },

  {
    method: 'POST',
    path: /^\/api\/gifts\/([^/]+)\/thankyou$/,
    admin: true,
    handler: async ({ params }, { res }) =>
      sendJson(res, 200, { success: true, gift: await toggleGiftThankYou(params[0]) }),
  },

  {
    method: 'POST',
    path: /^\/api\/gifts\/([^/]+)\/draft$/,
    admin: true,
    handler: async ({ params }, { res }) => {
      const gift = await getGiftById(params[0]);
      const settings = await getSettingsOrDefaults();
      // Dynamic import avoids a static gifts <-> thankyou cycle (thankyou reads gifts).
      const { generateThankYouDraft } = await import('../../db/thankyou');
      const draft = await generateThankYouDraft(gift, settings);
      return sendJson(res, 200, { success: true, draft });
    },
  },

  {
    method: 'POST',
    path: /^\/api\/gifts\/([^/]+)\/send-thankyou$/,
    admin: true,
    body: true,
    handler: async ({ body, params }, { res }) => {
      const { channel, text } = body;
      if (!['email', 'text', 'both'].includes(channel)) {
        return sendError(res, 'INVALID_CHANNEL');
      }
      if (!text || !text.trim()) return sendError(res, 'MESSAGE_REQUIRED');
      try {
        const { sendGiftThankYou } = await import('../../db/thankyou');
        const result = await sendGiftThankYou(params[0], channel, text.trim());
        return sendJson(res, 200, { success: true, ...result });
      } catch (err) {
        // GUEST_NOT_FOUND / NO_EMAIL / NO_PHONE propagate as DomainError (400);
        // an unexpected send failure is a 500.
        if (err instanceof DomainError) throw err;
        throw new DomainError('SEND_FAILED');
      }
    },
  },

  {
    method: 'DELETE',
    path: /^\/api\/gifts\/([^/]+)$/,
    admin: true,
    handler: async ({ params }, { res }) => {
      await deleteGift(params[0]);
      return sendJson(res, 200, { success: true });
    },
  },
];

export const handleGiftRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
