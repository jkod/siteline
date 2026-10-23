# Staging runbook

How to bring up `siteline-staging` for the pilot (PRD section 14). Everything here is done once,
by hand, in this order. Production follows the same steps later, deployed from CI rather than a
laptop.

Before you start, decide the product name (PRD section 16). The domain, Firebase project names
and email sender all depend on it.

## 1. Accounts

| Service | What you need | Used for |
| --- | --- | --- |
| Domain | A domain for the app, such as `app.<name>.se`, with DNS you control | Every link in texts and emails (`APP_URL`), Firebase Hosting, the email sender |
| Firebase | Project `siteline-staging` on the Blaze plan | Everything |
| Email | An SMTP provider with EU processing and a data processing agreement (for example Brevo, Mailjet, Scaleway or Amazon SES in an EU region) | All email |
| 46elks | An account with API credentials | Text messages |
| Stripe | An account in test mode | Plans and billing |

## 2. Firebase project

1. Create the project `siteline-staging` and switch it to the Blaze plan. Add a budget alert
   (Google Cloud Billing → Budgets), for example at 500 kr a month.
2. Firestore: create the database in `europe-north1`, Native mode.
3. Storage: create the default bucket in `europe-north1`.
4. Authentication:
   - Sign-in methods: turn on **Email link (passwordless)** and **Google**.
   - Settings → Authorized domains: add your app domain.
5. Hosting: add your custom domain and follow the DNS steps.
6. Project settings → Your apps → add a **Web app**. Copy its config into
   `web/src/environments/environment.staging.ts` (`apiKey`, `authDomain`, `storageBucket`,
   `appId`, `messagingSenderId`).
7. Google Cloud console, IAM, for the service account the functions run as (the default compute
   service account, `<number>-compute@developer.gserviceaccount.com`), grant:
   - **Service Account Token Creator**: client sign-in links create custom tokens.
   - **Vertex AI User**: voice drafts.
8. Turn on the **Vertex AI API** (Gemini, EU endpoint).

## 3. App Check

App Check is enforced in the callable functions as soon as they're deployed, so set it up first.

1. Google Cloud console → reCAPTCHA Enterprise: create a **website key** for your app domain.
2. Firebase console → App Check: register the web app with that key.
3. Put the site key in `appCheckSiteKey` in `environment.staging.ts`.
4. To test a local build against staging, set `appCheckDebug: true`, open the app, copy the debug
   token from the browser console, and add it under App Check → Manage debug tokens. Don't ship a
   build with `appCheckDebug: true`.
5. Once requests show as verified in App Check → Metrics, enforce App Check for Firestore and
   Storage too.

## 4. Web push

Firebase console → Project settings → Cloud Messaging → **Web Push certificates** → Generate key
pair. Put the public key in `vapidKey` in `environment.staging.ts`.

## 5. Email

1. At your provider, verify the sending domain and add its SPF and DKIM records to DNS.
2. Store the SMTP URL as a secret (step 7), in the form
   `smtps://<user>:<password>@<host>:465`.
3. Set `EMAIL_FROM` in `functions/.env.siteline-staging`, such as `Siteline <hej@<domain>>`.

## 6. Stripe (test mode)

1. Create the plans, prices and the 25% VAT rate:

   ```sh
   STRIPE_SECRET_KEY=sk_test_… npm run stripe:setup
   ```

   Copy the printed `STRIPE_PRICES` and `STRIPE_TAX_RATE` into `functions/.env.siteline-staging`.

2. Settings → Billing → **Customer portal**: allow updating payment methods, viewing invoices,
   cancelling, and switching between the four Siteline products. Turn on tax ID collection.
3. After the first deploy (step 8), Developers → **Webhooks** → add an endpoint with the
   `stripeWebhook` URL from the deploy output, listening to:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `invoice.paid`, `invoice.payment_failed`

   Copy its signing secret for step 7, then deploy the functions again.

## 7. Secrets and settings

Secrets go in Secret Manager; the CLI asks for each value:

```sh
firebase functions:secrets:set ELKS_USERNAME --project staging
firebase functions:secrets:set ELKS_PASSWORD --project staging
firebase functions:secrets:set SMTP_URL --project staging
firebase functions:secrets:set STRIPE_SECRET_KEY --project staging
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project staging
```

Plain settings go in `functions/.env.siteline-staging`: `APP_URL` (your app's address),
`EMAIL_FROM`, `STRIPE_PRICES` and `STRIPE_TAX_RATE`.

## 8. Deploy

From `apps/siteline`, with the tests green:

```sh
npm run deploy:staging
```

This deploys the security rules, indexes (including the TTL policies), Storage rules, the
functions with their schedules, and Hosting. Hosting builds the web app with the staging
configuration (`scripts/build-hosting.mjs`). Index builds can take a few minutes after the first
deploy.

Give a design partner Team for free (PRD F10):

```sh
GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> GCLOUD_PROJECT=siteline-staging \
  npm run comp -- <company ID or org number> 6
```

## 9. Smoke test

Run through this after each deploy that changes functions or rules. Use your own phone and email.

- [ ] Sign in as staff with an email link and with Google; create a company and a project.
- [ ] Invite yourself as a client by mobile number: the text arrives, and the link opens the
      project on your phone.
- [ ] Post an update with a photo; ask a question as the client; the staff email arrives.
- [ ] Send an extra-work decision; approve it as the client; the record shows on the card.
- [ ] Record a voice update: a draft comes back within about 15 seconds (PRD F5).
- [ ] Turn on notifications in Mitt konto; ask a question as the client; the push arrives.
- [ ] Sign out as the client, then sign in again by mobile number at `/login/client`.
- [ ] Subscribe to Solo with Stripe's test card `4242 4242 4242 4242`; the plan changes in the
      app within a minute. Change plan and cancel in the customer portal.
- [ ] Create the handover pack; download it as the client.
- [ ] Prova Siteline (`/try`) works, and nothing is sent from the sandbox.

For the full subscription lifecycle (PRD F10), the Stripe CLI can replay events:
`stripe trigger invoice.payment_failed`, and so on.
