import { defineSecret, defineString } from 'firebase-functions/params';

/** True when running in the Firebase Emulator Suite. */
export const isEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';

/** Options shared by every callable: App Check is enforced outside the emulator (PRD section 10). */
export const callableOptions = {
  enforceAppCheck: !isEmulator,
};

/**
 * The web app's origin, used in every link we send. Set per project in functions/.env.<projectId>;
 * the app domain isn't chosen yet, so .env holds a placeholder.
 */
export const appUrl = defineString('APP_URL');

export const elksUsername = defineSecret('ELKS_USERNAME');
export const elksPassword = defineSecret('ELKS_PASSWORD');
/** The email provider's SMTP URL, such as smtps://user:password@smtp.example.eu:465. */
export const smtpUrl = defineSecret('SMTP_URL');
/** The sender of every email, such as "Siteline <hej@example.se>". */
export const emailFrom = defineString('EMAIL_FROM', { default: 'Siteline <no-reply@example.com>' });

export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
/** Stripe price IDs as JSON, keyed plan_interval ({"solo_month": "price_…"}). */
export const stripePrices = defineString('STRIPE_PRICES', { default: '{}' });
/** The 25% Swedish VAT tax rate in Stripe. */
export const stripeTaxRate = defineString('STRIPE_TAX_RATE', { default: '' });
export const billingSecrets = isEmulator ? [] : [stripeSecretKey, stripeWebhookSecret];

/** Secrets for functions that deliver messages. The emulator uses the dev senders instead. */
export const messagingSecrets = isEmulator ? [] : [elksUsername, elksPassword, smtpUrl];
