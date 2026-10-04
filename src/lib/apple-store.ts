import { registerPlugin } from '@capacitor/core';
import { isNative } from '@/lib/capacitor-plugins';

export const APPLE_COMPANY_MONTHLY_ID = 'com.iwillbuild.portal.company.monthly';

export interface AppleProduct {
  id: string;
  seatCount: number;
  displayName: string;
  description: string;
  displayPrice: string;
  subscribed: boolean;
}

interface PurchaseResult {
  status: 'purchased' | 'cancelled' | 'pending';
  transactionId?: string;
  productId?: string;
  jws?: string;
}

interface RestoreResult {
  subscribed: boolean;
  productId?: string;
  jws?: string;
}

interface IWBStorePlugin {
  getProducts(): Promise<{ products: AppleProduct[] }>;
  purchase(options: { productId: string }): Promise<PurchaseResult>;
  restore(): Promise<RestoreResult>;
  manage(): Promise<void>;
}

const IWBStore = registerPlugin<IWBStorePlugin>('IWBStore');

export function appleStoreAvailable(): boolean {
  return isNative();
}

export async function getAppleProducts(): Promise<AppleProduct[]> {
  const result = await IWBStore.getProducts();
  return result.products;
}

export async function purchaseAppleSubscription(productId: string): Promise<PurchaseResult> {
  // Apple may charge as soon as the StoreKit sheet is confirmed. Check the
  // company's server-side billing eligibility before opening that sheet.
  await assertAppleSubscriptionEligible();
  const result = await IWBStore.purchase({ productId });
  if (result.status === 'purchased' && result.jws) {
    await confirmAppleTransaction(result.jws);
  }
  return result;
}

interface SubscriptionEligibilityResponse {
  eligible?: unknown;
  error?: string;
  message?: string;
  managementMessage?: string;
}

async function assertAppleSubscriptionEligible(): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/subscription/eligibility', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('Could not check subscription eligibility. Please try again before purchasing.');
  }

  const body = await response.json().catch(() => ({})) as SubscriptionEligibilityResponse;
  if (!response.ok || body.eligible !== true) {
    throw new Error(
      body.managementMessage || body.message || body.error ||
      'This company cannot start an Apple subscription right now. Check its current billing provider or try again.',
    );
  }
}

export async function restoreAppleSubscription(): Promise<RestoreResult> {
  const result = await IWBStore.restore();
  if (result.subscribed && result.jws) {
    await confirmAppleTransaction(result.jws);
  }
  return result;
}

export async function manageAppleSubscription(): Promise<void> {
  await IWBStore.manage();
}

async function confirmAppleTransaction(jws: string): Promise<void> {
  const response = await fetch('/api/billing/apple/confirm', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jws }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'The App Store payment succeeded, but the company record was not updated.');
  }
}
