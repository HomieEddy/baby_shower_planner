import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PLAN,
  hasEntitlement,
  isPremiumFeature,
  resolvePlan,
  type Feature,
} from './entitlements';

// §6: everything gated as Premium today.
const PREMIUM: Feature[] = [
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
];

// §6: the Basic row. Always entitled — listed so the matrix is complete.
const BASIC: Feature[] = ['guests', 'csv', 'rsvp', 'guestPages', 'theming'];

describe('hasEntitlement', () => {
  it('refuses every Premium feature on Basic', () => {
    for (const feature of PREMIUM) {
      expect(hasEntitlement('Basic', feature), feature).toBe(false);
    }
  });

  it('grants every Premium feature on Premium', () => {
    for (const feature of PREMIUM) {
      expect(hasEntitlement('Premium', feature), feature).toBe(true);
    }
  });

  it('grants Basic features on either plan', () => {
    for (const feature of BASIC) {
      expect(hasEntitlement('Basic', feature), feature).toBe(true);
      expect(hasEntitlement('Premium', feature), feature).toBe(true);
    }
  });
});

describe('isPremiumFeature', () => {
  it('separates the two rows of the matrix', () => {
    expect(PREMIUM.every(isPremiumFeature)).toBe(true);
    expect(BASIC.some(isPremiumFeature)).toBe(false);
  });
});

describe('resolvePlan', () => {
  it('keeps Premium', () => {
    expect(resolvePlan('Premium')).toBe('Premium');
  });

  it('defaults to Basic for anything else — fail closed', () => {
    expect(DEFAULT_PLAN).toBe('Basic');
    for (const value of ['Basic', 'premium', 'Enterprise', '', undefined, null, 42, {}]) {
      expect(resolvePlan(value)).toBe('Basic');
    }
  });
});
