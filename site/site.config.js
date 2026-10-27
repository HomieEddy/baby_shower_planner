// Operator values for the marketing site. Every link a visitor can act on
// comes from here, so going live is an edit to this file and nothing else.
//
// The prices must match src/lib/pricing.ts (§5.2) and the prices written in
// the pages; src/lib/site.test.ts fails the build when they drift.

export const SITE_CONFIG = {
  // One-time prices, CAD.
  priceBasicCad: 29,
  pricePremiumCad: 69,

  // Stripe Payment Links, one per tier (§16.5). Replace with the real links
  // from the Stripe dashboard. Each link collects the slug and the event date
  // as custom fields, and its success page is /thanks.html (or /fr/merci.html).
  checkoutBasicUrl: 'https://buy.stripe.com/replace-basic-link',
  checkoutPremiumUrl: 'https://buy.stripe.com/replace-premium-link',

  // The public read-only demo event (docs/PROVISIONING.md, "The demo").
  demoUrl: 'https://demo.example.com',

  // Where questions and refund requests go.
  contactEmail: 'hello@example.com',
};
