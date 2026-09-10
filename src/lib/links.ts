// App URL construction in one place. Every outbound link (invite, reminder,
// alert, table, thank-you) resolves through here.

const appUrl = () => process.env.APP_URL || 'http://localhost:3025';

export const rsvpUrl = (magicToken: string): string => `${appUrl()}/rsvp/${magicToken}`;

export const registerUrl = (refId?: string): string =>
  refId ? `${appUrl()}/register?ref=${encodeURIComponent(refId)}` : `${appUrl()}/register`;

export const findMyTableUrl = (magicToken: string): string =>
  `${appUrl()}/find-my-table?guest=${magicToken}`;
