import { registerPlugin } from '@capacitor/core';
import { isNative } from '@/lib/capacitor-plugins';

export const APPLE_COMPANY_MONTHLY_ID = 'com.iwillbuild.portal.company.monthly';

export interface AppleProduct {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  currencyCode?: string;
  storefrontCountryCode?: string;
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
  jws?: string;
}

interface IWBStorePlugin {
  getProduct(): Promise<AppleProduct>;
  purchase(): Promise<PurchaseResult>;
  restore(): Promise<RestoreResult>;
  manage(): Promise<void>;
}

const IWBStore = registerPlugin<IWBStorePlugin>('IWBStore');

export function appleStoreAvailable(): boolean {
  return isNative();
}

export async function getAppleProduct(): Promise<AppleProduct> {
  return IWBStore.getProduct();
}

export async function purchaseAppleSubscription(): Promise<PurchaseResult> {
  const result = await IWBStore.purchase();
  if (result.status === 'purchased' && result.jws) {
    await confirmAppleTransaction(result.jws);
  }
  return result;
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
    body: JSON.stringify({ jws, productId: APPLE_COMPANY_MONTHLY_ID }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'The App Store payment succeeded, but the company record was not updated.');
  }
}
