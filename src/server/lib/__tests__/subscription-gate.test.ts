import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client.js', () => ({ db: {} }));

import { resolveCompanyStatus } from '../subscription-gate';

describe('resolveCompanyStatus', () => {
  it('keeps a complimentary company writable', () => {
    const info = resolveCompanyStatus({
      subscriptionStatus: 'complimentary',
      plan: 'company',
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    } as never);

    expect(info.status).toBe('complimentary');
    expect(info.isViewOnly).toBe(false);
  });
});
