// The tier matrix: which plan buys which surface. One source for the UI, the
// server guard and the provisioner. Pure and client-safe — the env read lives
// in the server layer, not here.

export type Plan = 'Basic' | 'Premium';

// §6's matrix. Basic features are listed so the matrix is complete (they are
// always entitled); the Premium set is what the guard checks.
export type Feature =
  // Basic
  | 'guests'
  | 'csv'
  | 'rsvp'
  | 'guestPages'
  | 'theming'
  // Premium
  | 'comms'
  | 'catering'
  | 'seating'
  | 'escort'
  | 'dayOf'
  | 'guestbook'
  | 'photos'
  | 'gifts'
  | 'agenda'
  | 'alerts'
  | 'branding'
  | 'customDomain'
  | 'keepsake';

const PREMIUM_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  'comms',
  'catering',
  'seating',
  'escort',
  'dayOf',
  'guestbook',
  'photos',
  'gifts',
  'agenda',
  'alerts',
  'branding',
  'customDomain',
  'keepsake',
]);

// A deploy missing its plan is the cheaper tier, never the expensive one.
export const DEFAULT_PLAN: Plan = 'Basic';

export const isPremiumFeature = (feature: Feature): boolean => PREMIUM_FEATURES.has(feature);

export const resolvePlan = (value: unknown): Plan => (value === 'Premium' ? 'Premium' : DEFAULT_PLAN);

export const hasEntitlement = (plan: Plan, feature: Feature): boolean =>
  plan === 'Premium' || !isPremiumFeature(feature);
