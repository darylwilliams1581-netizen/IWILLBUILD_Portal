/**
 * scripts/stripe-tier-audit.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * READ-ONLY Stripe tier-mapping audit.
 *
 * Verifies:
 *   1. Each canonical secret contains a price_ ID (not prod_)
 *   2. Each price belongs to the expected Stripe product
 *   3. Each price has the expected AUD monthly amount
 *   4. No secret values are logged in full
 *
 * Usage:
 *   node scripts/stripe-tier-audit.mjs
 *
 * Requires STRIPE_SECRET_KEY in environment (loaded via config.json by the
 * Airo secrets adapter, or from process.env in this script context).
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load secrets from config.json (same source as getSecret()) ────────────────
function loadSecrets() {
  const configPath = join(__dirname, '..', 'config.json');
  try {
    const raw = readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    return cfg.secrets ?? cfg ?? {};
  } catch {
    // Fall back to process.env
    return process.env;
  }
}

const secrets = loadSecrets();

function getSecret(name) {
  return secrets[name] ?? process.env[name] ?? null;
}

// ── Expected tier mapping ─────────────────────────────────────────────────────
const EXPECTED = [
  {
    tier:       'solo',
    secretName: 'STRIPE_SOLO_PRICE_ID',
    productId:  'prod_Um96FWv1VKySaq',
    amountAud:  1900,   // cents
    interval:   'month',
    label:      'Solo — A$19/month',
  },
  {
    tier:       'team',
    secretName: 'STRIPE_TEAM_PRICE_ID',
    productId:  'prod_Um98SnCHxGYemx',
    amountAud:  7900,
    interval:   'month',
    label:      'Team — A$79/month',
  },
  {
    tier:       'business',
    secretName: 'STRIPE_BUSINESS_PRICE_ID',
    productId:  'prod_Um9AM2tcuUBfQo',
    amountAud:  14900,
    interval:   'month',
    label:      'Business — A$149/month (Stripe product named "Pro")',
  },
];

// ── Stripe API helper (no SDK — raw fetch, read-only) ─────────────────────────
const STRIPE_KEY = getSecret('STRIPE_SECRET_KEY');

if (!STRIPE_KEY) {
  console.error('FATAL: STRIPE_SECRET_KEY not found in config.json or process.env');
  process.exit(1);
}

// Mask: show only first 8 chars + "…"
function mask(val) {
  if (!val) return '(null)';
  return val.slice(0, 8) + '…';
}

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe API ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Run audit ─────────────────────────────────────────────────────────────────
const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';

let allPassed = true;
const findings = [];

function record(ok, label, detail) {
  const icon = ok ? PASS : FAIL;
  findings.push(`  ${icon} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) allPassed = false;
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  STRIPE TIER-MAPPING AUDIT  (read-only)');
console.log('══════════════════════════════════════════════════════════════════\n');

for (const expected of EXPECTED) {
  const { tier, secretName, productId, amountAud, interval, label } = expected;
  console.log(`── ${label}`);

  const priceId = getSecret(secretName);

  // Check 1: secret is present
  if (!priceId) {
    record(false, `${secretName} is set`, 'SECRET MISSING');
    findings.push(`  ${FAIL} Cannot verify further — secret not configured`);
    console.log(findings.slice(-2).join('\n'));
    findings.length = 0;
    allPassed = false;
    continue;
  }

  record(true, `${secretName} is set`, `value starts with ${mask(priceId)}`);

  // Check 2: starts with price_
  const isPrice = priceId.startsWith('price_');
  record(isPrice, `${secretName} starts with price_`,
    isPrice ? priceId.slice(0, 14) + '…' : `Got "${priceId.slice(0, 12)}…" — expected price_, got ${priceId.startsWith('prod_') ? 'prod_ (product ID!)' : 'unknown prefix'}`);

  if (!isPrice) {
    console.log(findings.join('\n'));
    findings.length = 0;
    allPassed = false;
    continue;
  }

  // Check 3+4: fetch price from Stripe and verify product + amount
  try {
    const price = await stripeGet(`/prices/${priceId}?expand[]=product`);

    // Product match
    const actualProductId = typeof price.product === 'string' ? price.product : price.product?.id;
    const productMatch = actualProductId === productId;
    const productName = typeof price.product === 'object' ? price.product?.name : '(not expanded)';
    record(productMatch, `Price belongs to product ${productId}`,
      productMatch
        ? `product name: "${productName}"`
        : `Got product ${actualProductId} ("${productName}") — expected ${productId}`);

    // Currency
    const currencyMatch = price.currency === 'aud';
    record(currencyMatch, `Price currency is AUD`,
      currencyMatch ? 'aud' : `Got "${price.currency}"`);

    // Amount
    const amountMatch = price.unit_amount === amountAud;
    record(amountMatch, `Price amount is ${amountAud} cents (A$${(amountAud / 100).toFixed(2)})`,
      amountMatch
        ? `${price.unit_amount} cents`
        : `Got ${price.unit_amount} cents (A$${(price.unit_amount / 100).toFixed(2)})`);

    // Interval
    const intervalMatch = price.recurring?.interval === interval;
    record(intervalMatch, `Price interval is ${interval}ly`,
      intervalMatch ? price.recurring?.interval : `Got "${price.recurring?.interval}"`);

    // Active
    const activeMatch = price.active === true;
    record(activeMatch, `Price is active`,
      activeMatch ? 'active' : 'INACTIVE — price is archived or disabled');

  } catch (err) {
    record(false, `Stripe API lookup for ${priceId}`, err.message);
    allPassed = false;
  }

  console.log(findings.join('\n'));
  findings.length = 0;
  console.log('');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════════════');
if (allPassed) {
  console.log(`${PASS} ALL CHECKS PASSED — tier mapping is correct`);
} else {
  console.log(`${FAIL} ONE OR MORE CHECKS FAILED — see findings above`);
}
console.log('══════════════════════════════════════════════════════════════════\n');

process.exit(allPassed ? 0 : 1);
