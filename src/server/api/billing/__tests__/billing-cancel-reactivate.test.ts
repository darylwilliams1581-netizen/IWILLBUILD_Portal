/**
 * Billing cancel / reactivate hardening tests
 *
 * Covers all 8 checkpoint scenarios:
 *   1. Missing billing link → visible error, no DB change
 *   2. Ambiguous billing link (reconcile) → visible error, no DB change
 *   3. Stripe failure on cancel → DB unchanged, no email
 *   4. Successful cancel → Stripe updated first, then DB, then email
 *   5. Access remains available until period end after cancel
 *   6. Reactivation → Stripe updated first, then DB
 *   7. Idempotent cancel (already cancel_pending) → success, no second Stripe call
 *   8. Idempotent reactivate (already active) → success, no Stripe call
 *   + No second free trial after expiry/resubscription
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockStripeSubscriptionsUpdate = vi.fn();
const mockStripeSubscriptionsList = vi.fn();
const mockStripeCustomersCreate = vi.fn();
const mockStripeCheckoutSessionsCreate = vi.fn();

vi.mock('../../../lib/stripe-client.js', () => ({
  getStripe: vi.fn().mockResolvedValue({
    subscriptions: {
      update: mockStripeSubscriptionsUpdate,
      list: mockStripeSubscriptionsList,
    },
    customers: { create: mockStripeCustomersCreate },
    checkout: { sessions: { create: mockStripeCheckoutSessionsCreate } },
  }),
}));

const mockDbExecute = vi.fn();
const mockDbQueryCompanies = vi.fn();
const mockDbQueryProfiles = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock('../../../db/client.js', () => ({
  db: {
    execute: mockDbExecute,
    query: {
      companies: { findFirst: mockDbQueryCompanies },
      profiles: { findFirst: mockDbQueryProfiles },
    },
    update: mockDbUpdate,
  },
}));

vi.mock('../../../../lib/auth/auth.js', () => ({
  getAuth: vi.fn().mockReturnValue({
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'daryl.williams@energyq.com.au',
          name: 'Daryl Williams',
        },
      }),
    },
  }),
}));

vi.mock('../../../email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('#airo/secrets', () => ({
  getSecret: vi.fn().mockImplementation((key: string) => {
    if (key === 'STRIPE_SECRET_KEY') return 'sk_test_mock';
    if (key === 'STRIPE_SOLO_PRICE_ID') return 'price_solo_test';
    if (key === 'STRIPE_TEAM_PRICE_ID') return 'price_team_test';
    if (key === 'STRIPE_BUSINESS_PRICE_ID') return 'price_business_test';
    return null;
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return { body, headers } as any;
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null as unknown,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockImplementation(function (this: typeof res, body: unknown) {
      this._body = body;
      return this;
    }),
  };
  // Make status().json() work
  res.status.mockImplementation((code: number) => {
    res._status = code;
    return res;
  });
  return res;
}

const PERIOD_END_UNIX = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days from now
const PERIOD_END_DATE = new Date(PERIOD_END_UNIX * 1000);

function mockActiveCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    name: 'WILLIAMS CONSTRUCTIONS NQ',
    stripeCustomerId: 'cus_test_123',
    stripeSubscriptionId: 'sub_test_456',
    subscriptionStatus: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    plan: 'solo',
    ...overrides,
  };
}

function mockOwnerProfile() {
  return { userId: 'user-1', companyId: 5, role: 'owner' };
}

// ── Import handlers after mocks are set up ────────────────────────────────────

// We import dynamically inside tests to ensure mocks are in place

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cancel-subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQueryProfiles.mockResolvedValue(mockOwnerProfile());
    mockDbExecute.mockResolvedValue([[], []]);
  });

  it('1. Missing stripe_subscription_id → 422 billing_link_missing, DB not touched', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ stripeSubscriptionId: null })
    );

    const { default: handler } = await import('../cancel-subscription/POST.js');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(422);
    expect((res._body as any).error).toBe('billing_link_missing');
    // DB execute should NOT have been called (no UPDATE)
    expect(mockDbExecute).not.toHaveBeenCalled();
    // Stripe should NOT have been called
    expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it('3. Stripe throws on cancel → DB unchanged, no email sent', async () => {
    mockDbQueryCompanies.mockResolvedValue(mockActiveCompany());
    mockStripeSubscriptionsUpdate.mockRejectedValue(new Error('Stripe network error'));

    const { sendEmail } = await import('../../../email.js');
    const { default: handler } = await import('../cancel-subscription/POST.js');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(502);
    expect((res._body as any).error).toBe('stripe_error');
    // DB must NOT have been updated
    expect(mockDbExecute).not.toHaveBeenCalled();
    // Email must NOT have been sent
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('4. Successful cancel → Stripe called first, then DB written, then email queued', async () => {
    mockDbQueryCompanies.mockResolvedValue(mockActiveCompany());
    mockStripeSubscriptionsUpdate.mockResolvedValue({
      id: 'sub_test_456',
      cancel_at_period_end: true,
      current_period_end: PERIOD_END_UNIX,
    });

    const { sendEmail } = await import('../../../email.js');
    const { default: handler } = await import('../cancel-subscription/POST.js');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    // Stripe called with cancel_at_period_end: true
    expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith('sub_test_456', {
      cancel_at_period_end: true,
    });

    // DB written after Stripe
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    const sqlCall = mockDbExecute.mock.calls[0][0];
    // The SQL should contain cancel_pending
    expect(JSON.stringify(sqlCall)).toContain('cancel_pending');

    // Response is success
    expect((res._body as any).ok).toBe(true);
    expect((res._body as any).cancelAtPeriodEnd).toBe(true);

    // Email was queued (fire-and-forget — sendEmail called)
    // Give the void promise a tick to fire
    await new Promise((r) => setTimeout(r, 10));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const emailCall = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(emailCall.to).toBe('daryl.williams@energyq.com.au');
    expect(emailCall.subject).toContain('cancelled');
  });

  it('5. Access remains available: response includes currentPeriodEnd in the future', async () => {
    mockDbQueryCompanies.mockResolvedValue(mockActiveCompany());
    mockStripeSubscriptionsUpdate.mockResolvedValue({
      id: 'sub_test_456',
      cancel_at_period_end: true,
      current_period_end: PERIOD_END_UNIX,
    });

    const { default: handler } = await import('../cancel-subscription/POST.js');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = res._body as any;
    expect(body.currentPeriodEnd).toBeTruthy();
    const periodEnd = new Date(body.currentPeriodEnd);
    expect(periodEnd.getTime()).toBe(PERIOD_END_DATE.getTime());
    // Period end must be in the future
    expect(periodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  it('7. Idempotent cancel (already cancel_pending) → success, Stripe NOT called again', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({
        subscriptionStatus: 'cancel_pending',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: PERIOD_END_DATE,
      })
    );

    const { default: handler } = await import('../cancel-subscription/POST.js');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect((res._body as any).ok).toBe(true);
    expect((res._body as any).alreadyCancelled).toBe(true);
    // Stripe must NOT be called again
    expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
    // DB must NOT be touched
    expect(mockDbExecute).not.toHaveBeenCalled();
  });
});

describe('reactivate-subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQueryProfiles.mockResolvedValue(mockOwnerProfile());
    mockDbExecute.mockResolvedValue([[], []]);
  });

  it('1. Missing stripe_subscription_id → 422 billing_link_missing, DB not touched', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ stripeSubscriptionId: null, subscriptionStatus: 'cancel_pending', cancelAtPeriodEnd: true })
    );

    const { default: handler } = await import('../reactivate-subscription/POST.js');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(422);
    expect((res._body as any).error).toBe('billing_link_missing');
    expect(mockDbExecute).not.toHaveBeenCalled();
    expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it('3. Stripe throws on reactivate → DB unchanged', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ subscriptionStatus: 'cancel_pending', cancelAtPeriodEnd: true })
    );
    mockStripeSubscriptionsUpdate.mockRejectedValue(new Error('Stripe timeout'));

    const { default: handler } = await import('../reactivate-subscription/POST.js');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(502);
    expect((res._body as any).error).toBe('stripe_error');
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it('6. Successful reactivation → Stripe called first, then DB restored to active', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ subscriptionStatus: 'cancel_pending', cancelAtPeriodEnd: true })
    );
    mockStripeSubscriptionsUpdate.mockResolvedValue({
      id: 'sub_test_456',
      cancel_at_period_end: false,
      current_period_end: PERIOD_END_UNIX,
    });

    const { default: handler } = await import('../reactivate-subscription/POST.js');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    // Stripe called with cancel_at_period_end: false
    expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith('sub_test_456', {
      cancel_at_period_end: false,
    });

    // DB written after Stripe
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    const sqlCall = mockDbExecute.mock.calls[0][0];
    expect(JSON.stringify(sqlCall)).toContain('active');
    expect(JSON.stringify(sqlCall)).toContain('cancel_at_period_end');

    expect((res._body as any).ok).toBe(true);
  });

  it('8. Idempotent reactivate (already active) → success, Stripe NOT called', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ subscriptionStatus: 'active', cancelAtPeriodEnd: false })
    );

    const { default: handler } = await import('../reactivate-subscription/POST.js');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect((res._body as any).ok).toBe(true);
    expect((res._body as any).alreadyActive).toBe(true);
    expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
    expect(mockDbExecute).not.toHaveBeenCalled();
  });
});

describe('billing-reconcile (company 2 → company 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // platform_role check returns developer, subsequent execute calls return empty
    mockDbExecute
      .mockResolvedValueOnce([[{ platform_role: 'developer' }], []])
      .mockResolvedValue([[], []]);
  });

  it('2. No active subscription found → 422 no_active_subscription, DB not touched', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ id: 5, stripeCustomerId: 'cus_test_123', stripeSubscriptionId: null })
    );
    mockStripeSubscriptionsList.mockResolvedValue({ data: [] });

    const { default: handler } = await import('../../../api/developer/billing-reconcile/POST.js');
    const req = makeReq({ targetCompanyId: 5, dryRun: false });
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(422);
    expect((res._body as any).error).toBe('no_active_subscription');
    // DB execute was called once (for platform_role check) but NOT for UPDATE
    const updateCalls = mockDbExecute.mock.calls.filter(
      (c: unknown[]) => JSON.stringify(c[0]).includes('UPDATE companies')
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('2b. Multiple active subscriptions → 422 ambiguous, DB not touched', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ id: 5, stripeCustomerId: 'cus_test_123', stripeSubscriptionId: null })
    );
    mockStripeSubscriptionsList.mockResolvedValue({
      data: [
        { id: 'sub_a', status: 'active', cancel_at_period_end: false, current_period_end: PERIOD_END_UNIX, metadata: {} },
        { id: 'sub_b', status: 'active', cancel_at_period_end: false, current_period_end: PERIOD_END_UNIX, metadata: {} },
      ],
    });

    const { default: handler } = await import('../../../api/developer/billing-reconcile/POST.js');
    const req = makeReq({ targetCompanyId: 5, dryRun: false });
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(422);
    expect((res._body as any).error).toBe('ambiguous_subscriptions');
    const updateCalls = mockDbExecute.mock.calls.filter(
      (c: unknown[]) => JSON.stringify(c[0]).includes('UPDATE companies')
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('Dry run → returns report, no DB UPDATE committed', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ id: 5, stripeCustomerId: 'cus_test_123', stripeSubscriptionId: null })
    );
    mockStripeSubscriptionsList.mockResolvedValue({
      data: [
        { id: 'sub_real_456', status: 'active', cancel_at_period_end: false, current_period_end: PERIOD_END_UNIX, metadata: { plan: 'solo' } },
      ],
    });

    const { default: handler } = await import('../../../api/developer/billing-reconcile/POST.js');
    const req = makeReq({ targetCompanyId: 5, dryRun: true });
    const res = makeRes();
    await handler(req, res);

    expect((res._body as any).dryRun).toBe(true);
    expect((res._body as any).committed).toBe(false);
    const updateCalls = mockDbExecute.mock.calls.filter(
      (c: unknown[]) => JSON.stringify(c[0]).includes('UPDATE companies')
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('Commit → writes stripe IDs to target company', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ id: 5, stripeCustomerId: 'cus_test_123', stripeSubscriptionId: null })
    );
    mockStripeSubscriptionsList.mockResolvedValue({
      data: [
        { id: 'sub_real_456', status: 'active', cancel_at_period_end: false, current_period_end: PERIOD_END_UNIX, metadata: { plan: 'solo' } },
      ],
    });
    // beforeEach already sets up platform_role mock; additional execute calls are the UPDATE
    mockDbExecute
      .mockResolvedValueOnce([[{ platform_role: 'developer' }], []])
      .mockResolvedValue([[], []]);

    const { default: handler } = await import('../../../api/developer/billing-reconcile/POST.js');
    const req = makeReq({ targetCompanyId: 5, dryRun: false });
    const res = makeRes();
    await handler(req, res);

    expect((res._body as any).committed).toBe(true);
    const updateCalls = mockDbExecute.mock.calls.filter(
      (c: unknown[]) => JSON.stringify(c[0]).includes('UPDATE companies')
    );
    expect(updateCalls.length).toBeGreaterThan(0);
    const updateSql = JSON.stringify(updateCalls[0][0]);
    expect(updateSql).toContain('sub_real_456');
    expect(updateSql).toContain('cus_test_123');
  });
});

describe('create-checkout: no second free trial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQueryProfiles.mockResolvedValue(mockOwnerProfile());
    // db.update().set().where() chain
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockDbUpdate.mockReturnValue({ set: mockSet });
    // email check: no prior paid subs by default
    mockDbExecute.mockResolvedValue([[{ cnt: 0 }], []]);
  });

  it('Company with prior subscription (cancelled status) → trial_period_days: 0 passed to Stripe', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ subscriptionStatus: 'cancelled', stripeCustomerId: 'cus_test_123' })
    );
    // Stripe customer already has a prior subscription on record
    mockStripeSubscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_old', status: 'canceled' }],
    });
    mockStripeCheckoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/test' });

    const { default: handler } = await import('../../subscription/create-checkout/POST.js');
    const req = makeReq({ plan: 'solo' });
    const res = makeRes();
    await handler(req, res);

    // Debug: log what the handler returned if Stripe wasn't called
    if (mockStripeCheckoutSessionsCreate.mock.calls.length === 0) {
      console.log('checkout response body:', JSON.stringify(res._body));
    }

    expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockStripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(callArgs.subscription_data?.trial_period_days).toBe(0);
  });

  it('Brand new company (trial status, no prior subs) → no trial_period_days override', async () => {
    mockDbQueryCompanies.mockResolvedValue(
      mockActiveCompany({ subscriptionStatus: 'trial', stripeCustomerId: 'cus_new_999' })
    );
    // No prior subscriptions on Stripe
    mockStripeSubscriptionsList.mockResolvedValue({ data: [] });
    // No prior paid subs on this email in DB
    mockDbExecute.mockResolvedValue([[{ cnt: 0 }], []]);
    mockStripeCheckoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/test' });

    const { default: handler } = await import('../../subscription/create-checkout/POST.js');
    const req = makeReq({ plan: 'solo' });
    const res = makeRes();
    await handler(req, res);

    expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockStripeCheckoutSessionsCreate.mock.calls[0][0];
    // trial_period_days should NOT be set (or should be undefined)
    expect(callArgs.subscription_data?.trial_period_days).toBeUndefined();
  });
});
