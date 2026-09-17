// The prices the product is sold at (§5.2): one-time, CAD. The marketing site's
// site/site.config.js carries the same numbers — they move together.

export const PRICE_BASIC_CAD = 29;
export const PRICE_PREMIUM_CAD = 69;
export const PRICE_UPGRADE_DELTA_CAD = PRICE_PREMIUM_CAD - PRICE_BASIC_CAD;

// The Stripe Payment Link for the Basic → Premium delta (§16.5). Operator value:
// replace with the real link from the Stripe dashboard.
export const UPGRADE_URL = 'https://buy.stripe.com/replace-upgrade-link';

export const priceLabel = (amount: number): string => `$${amount} CAD`;
