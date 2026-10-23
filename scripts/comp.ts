/**
 * Gives a design partner Team features for free (PRD F10, section 16): sets compedUntil some
 * months ahead. Runs against the emulators by default, or a real project with credentials:
 *
 *   npm run comp -- <companyId or org number> [months=6]
 *   GOOGLE_APPLICATION_CREDENTIALS=… GCLOUD_PROJECT=siteline-staging npm run comp -- 556016-0680
 */
import { Timestamp } from 'firebase-admin/firestore';

async function main(): Promise<void> {
  const [who, monthsArg = '6'] = process.argv.slice(2);
  if (!who) throw new Error('Usage: npm run comp -- <companyId or org number> [months]');
  const months = Number(monthsArg);
  if (!Number.isInteger(months) || months < 0 || months > 24)
    throw new Error('Months must be a whole number from 0 (end now) to 24.');

  if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
    process.env['GCLOUD_PROJECT'] ??= 'demo-siteline';
    process.env['FIRESTORE_EMULATOR_HOST'] ??= '127.0.0.1:8080';
  }
  const { db } = await import('../functions/src/lib/admin');
  const byId = await db.doc(`companies/${who}`).get();
  const company = byId.exists
    ? byId
    : (await db.collection('companies').where('orgNumber', '==', who).limit(1).get()).docs[0];
  if (!company?.exists) throw new Error(`No company with ID or org number ${who}.`);

  const until = new Date();
  until.setMonth(until.getMonth() + months);
  await company.ref.update({ compedUntil: months === 0 ? null : Timestamp.fromDate(until) });
  console.log(
    months === 0
      ? `${company.get('name')}: free period ended.`
      : `${company.get('name')}: Team features free until ${until.toISOString().slice(0, 10)}.`,
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
