/**
 * scripts/stripe-tier-audit.ts — READ-ONLY Stripe tier-mapping audit
 * Run via: npx tsx scripts/stripe-tier-audit.ts
 */
import { getSecret } from '#airo/secrets';

const EXPECTED = [
  {
    tier: 'solo',
    secretName: 'STRIPE_SOLO_PRICE_ID',
    productId: 'prod_Um96FWv1VKySaq',
    amountAud: 1900,
    label: 'Solo — A$19/month',
  },
  {
    tier: 'team',
    secretName: 'STRIPE_TEAM_PRICE_ID',
    productId: 'prod_Um98SnCHxGYemx',
    amountAud: 7900,
    label: 'Team — A$79/month',
  },
  {
    tier: 'business',
    secretName: 'STRIPE_BUSINESS_PRICE_ID',
    productId: 'prod_Um9AM2tcuUBfQo',
    amountAud: 14900,
    label: 'Business — A$149/month (Stripe product named "Pro")',
  },
];

const STRIPE_KEY = getSecret('STRIPE_SECRET_KEY') as string | null;
if (!STRIPE_KEY) {
  console.error('FATAL: STRIPE_SECRET_KEY not configured');
  process.exit(1);
}

function mask(v: string | null): string {
  return v ? v.slice(0, 8) + '…' : '(null)';
}

async function stripeGet(path: string): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  if (!r.ok) {
    throw new Error(`Stripe ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return r.json();
}

let allPassed = true;
const PASS = '✅';
const FAIL = '❌';

function rec(ok: boolean, label: string, detail?: string): void {
  console.log(`  ${ok ? PASS : FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) allPassed = false;
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  STRIPE TIER-MAPPING AUDIT  (read-only)');
console.log('══════════════════════════════════════════════════════════════════\n');

for (const { secretName, productId, amountAud, label } of EXPECTED) {
  console.log(`── ${label}`);
  const priceId = getSecret(secretName) as string | null;

  if (!priceId) {
    rec(false, `${secretName} is set`, 'SECRET MISSING');
    console.log('');
    continue;
  }
  rec(true, `${secretName} is set`, `starts with ${mask(priceId)}`);

  const isPrice = priceId.startsWith('price_');
  rec(
    isPrice,
    `${secretName} starts with price_`,
    isPrice
      ? priceId.slice(0, 14) + '…'
      : `Got "${priceId.slice(0, 12)}…" — ${priceId.startsWith('prod_') ? 'this is a prod_ product ID!' : 'unknown prefix'}`,
  );
  if (!isPrice) {
    console.log('');
    continue;
  }

  try {
    const price = await stripeGet(`/prices/${priceId}?expand[]=product`);
    const actualProductId =
      typeof price.product === 'string' ? price.product : price.product?.id;
    const productName =
      typeof price.product === 'object' ? price.product?.name : '?';

    rec(
      actualProductId === productId,
      `Belongs to product ${productId}`,
      actualProductId === productId
        ? `"${productName}"`
        : `Got ${actualProductId} ("${productName}")`,
    );
    rec(price.currency === 'aud', `Currency is AUD`, price.currency);
    rec(
      price.unit_amount === amountAud,
      `Amount is ${amountAud}¢ (A$${(amountAud / 100).toFixed(2)})`,
      `Got ${price.unit_amount}¢ (A$${(price.unit_amount / 100).toFixed(2)})`,
    );
    rec(
      price.recurring?.interval === 'month',
      `Interval is monthly`,
      price.recurring?.interval,
    );
    rec(price.active === true, `Price is active`, price.active ? 'yes' : 'INACTIVE');
  } catch (e: any) {
    rec(false, `Stripe API lookup for ${priceId}`, e.message);
  }
  console.log('');
}

console.log('══════════════════════════════════════════════════════════════════');
console.log(
  allPassed ? `${PASS} ALL CHECKS PASSED` : `${FAIL} ONE OR MORE CHECKS FAILED`,
);
console.log('══════════════════════════════════════════════════════════════════\n');
process.exit(allPassed ? 0 : 1);
