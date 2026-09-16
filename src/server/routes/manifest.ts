// The web app manifest, built per request from the event's own settings: the
// installed name and colours are the event's, never the product's. An unseeded
// event gets the neutral event fallback and the default theme.

import { sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, type Route } from '../route';
import { getSettingsOrUndefined } from '../../db/service';
import { eventDisplayName } from '../../lib/eventName';
import { getThemeById } from '../../themePresets';
import { translations } from '../../translations';
import type { EventSettings } from '../../types';

export const MANIFEST_PATH = '/api/manifest';

export function buildManifest(settings: EventSettings | undefined) {
  const theme = getThemeById(settings?.themeId, settings?.customTheme);
  const name = eventDisplayName(settings, translations.EN.eventFallbackTitle);
  return {
    name,
    start_url: '/',
    display: 'standalone',
    theme_color: theme.accent,
    background_color: theme.bg,
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: MANIFEST_PATH,
    // The manifest dodges the bot block and the rate limit (server.ts), so an
    // unauthenticated caller can read the settings row without throttle.
    // ponytail: public event identity, cheap local read; add a short-TTL cache
    // here if the endpoint is ever hammered.
    handler: async (_req, { res }) =>
      sendJson(res, 200, buildManifest(await getSettingsOrUndefined()), 'application/manifest+json'),
  },
];

export const handleManifestRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
