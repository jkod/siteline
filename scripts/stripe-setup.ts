/**
 * Creates Siteline's plans in Stripe (PRD F10): a product per paid plan, a monthly and a yearly
 * price (two months free), and the 25% Swedish VAT rate. Safe to run again: prices are found by
 * their lookup keys. Prints the settings for functions/.env.<project>.
 *
 *   STRIPE_SECRET_KEY=sk_test_… npm run stripe:setup
 *
 * A live key is refused unless --live is given.
 */
import Stripe from 'stripe';

import { type BillingInterval, PAID_PLANS, planPriceOre } from '../shared/src/plans';

const NAMES: Record<(typeof PAID_PLANS)[number], string> = {
  visits: 'Siteline Besök',
  solo: 'Siteline Solo',
  team: 'Siteline Team',
  pro: 'Siteline Pro',
};

async function main(): Promise<void> {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key)
    throw new Error('Set STRIPE_SECRET_KEY to a Stripe secret key (sk_test_… for staging).');
  if (key.startsWith('sk_live_') && !process.argv.includes('--live')) {
    throw new Error('That is a live key. Pass --live if you really mean production.');
  }
  const stripe = new Stripe(key);

  const rates = await stripe.taxRates.list({ active: true, limit: 100 });
  const vat =
    rates.data.find((r) => r.metadata?.['siteline'] === 'vat25') ??
    (await stripe.taxRates.create({
      display_name: 'Moms',
      percentage: 25,
      inclusive: false,
      country: 'SE',
      jurisdiction: 'SE',
      description: 'Svensk moms 25 %',
      metadata: { siteline: 'vat25' },
    }));

  const products = await stripe.products.list({ active: true, limit: 100 });
  const prices: Record<string, string> = {};
  for (const plan of PAID_PLANS) {
    const product =
      products.data.find((p) => p.metadata['siteline_plan'] === plan) ??
      (await stripe.products.create({ name: NAMES[plan], metadata: { siteline_plan: plan } }));
    for (const interval of ['month', 'year'] as BillingInterval[]) {
      const lookup = `siteline_${plan}_${interval}`;
      const existing = (await stripe.prices.list({ lookup_keys: [lookup], active: true })).data[0];
      const amount = planPriceOre(plan, interval);
      const price =
        existing && existing.unit_amount === amount
          ? existing
          : await stripe.prices.create({
              product: product.id,
              currency: 'sek',
              unit_amount: amount,
              recurring: { interval },
              tax_behavior: 'exclusive',
              lookup_key: lookup,
              transfer_lookup_key: true,
            });
      prices[`${plan}_${interval}`] = price.id;
    }
  }

  console.log('Add these to functions/.env.<project>:\n');
  console.log(`STRIPE_PRICES=${JSON.stringify(prices)}`);
  console.log(`STRIPE_TAX_RATE=${vat.id}`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
