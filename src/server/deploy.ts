// This deploy's own configuration: what it was provisioned as. Read from the
// environment, never from data the customer's admin token can write.

import { resolvePlan, type Plan } from '../lib/entitlements';

export const deployPlan = (): Plan => resolvePlan(process.env.PLAN);
