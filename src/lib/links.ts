// App URL construction in one place. Every outbound link (invite, reminder,
// alert, table, thank-you) resolves through here.

const appUrl = () => process.env.APP_URL || 'http://localhost:3025';

export const rsvpUrl = (magicToken: string): string => `${appUrl()}/rsvp/${magicToken}`;

export const registerUrl = (refId?: string): string =>
  refId ? `${appUrl()}/register?ref=${encodeURIComponent(refId)}` : `${appUrl()}/register`;

// Google Maps search link for a venue or address (no API key needed).
// Plain spaces as '+' keeps the link short; commas and accents are not encoded.
// The text is folded to GSM-7 and stripped of URL-breaking characters.
export const mapsUrl = (query: string): string =>
  `https://maps.google.com/?q=${query.replace(/[&#?%\s]+/g, '+')}`;

export const findMyTableUrl = (magicToken: string): string =>
  `${appUrl()}/find-my-table?guest=${magicToken}`;
