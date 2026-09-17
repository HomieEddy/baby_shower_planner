// This deploy's own configuration: what it was provisioned as. Read from the
// environment, never from data the customer's admin token can write.

import { resolvePlan, type Plan } from '../lib/entitlements';

export const deployPlan = (): Plan => resolvePlan(process.env.PLAN);

// The public demo deploy (§11): seeds its content once and is read-only for
// guests. A normal event never sets this.
export const isDemo = (): boolean => process.env.DEMO === 'true';
