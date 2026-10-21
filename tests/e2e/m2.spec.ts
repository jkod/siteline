import { expect, type Page, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { linkInTextMessage, signIn } from './emulators';

// M2 is done when: end-to-end tests for approve, decline and choose pass (PRD section 14).

const unique = (name: string) => `${name} ${Date.now() % 100000}`;

async function staffCreatesDecision(
  page: Page,
  fill: (dialog: ReturnType<Page['getByRole']>) => Promise<void>,
) {
  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/projects/lindqvist-kok/decisions');
  await page.getByRole('button', { name: 'Nytt beslut' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nytt beslut' });
  await fill(dialog);
  await dialog.getByRole('button', { name: 'Skicka till kunden' }).click();
  await expect(page.getByText('Beslutet är skickat till kunden.')).toBeVisible();
}

async function clientOpensDecisions(page: Page) {
  const context = await page
    .context()
    .browser()!
    .newContext({ ...test.info().project.use, reducedMotion: 'reduce' });
  const client = await context.newPage();
  await client.goto(await linkInTextMessage('Hej Anna! Ek & Lind Snickeri'));
  await expect(client).toHaveURL(/\/c\/lindqvist-kok$/);
  await client.getByRole('link', { name: 'Beslut' }).click();
  return { client, context };
}

test('a client approves extra work in writing and the staff see who and when', async ({ page }) => {
  const title = unique('Flytta element');
  await staffCreatesDecision(page, async (dialog) => {
    await dialog.getByLabel('Rubrik').fill(title);
    await dialog.getByLabel('Pris inklusive moms (kr)').fill('2 400');
  });
  await expect(
    page.locator('sl-decision-card').filter({ hasText: title }).getByText('2 400 kr'),
  ).toBeVisible();

  const { client, context } = await clientOpensDecisions(page);
  const card = client.locator('sl-decision-card').filter({ hasText: title });
  await expect(card.getByText('Tilläggsarbete')).toBeVisible();
  await expectNoAxeViolations(client);
  await card.getByRole('button', { name: 'Godkänn' }).click();
  await expect(client.getByText('Tack! Ditt svar är sparat.')).toBeVisible();
  await expect(card.getByText(/Godkänt av Anna Lindqvist/)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Godkänn' })).toHaveCount(0);

  // Staff see the outcome in real time; the card can no longer be changed.
  const staffCard = page.locator('sl-decision-card').filter({ hasText: title });
  await expect(staffCard.getByText(/Godkänt av Anna Lindqvist/)).toBeVisible({ timeout: 5000 });
  await expect(staffCard.getByRole('button', { name: 'Ändra' })).toHaveCount(0);
  await context.close();
});

test('a client declines with a reason', async ({ page }) => {
  const title = unique('Är fogfärg grå okej?');
  await staffCreatesDecision(page, async (dialog) => {
    await dialog.getByRole('button', { name: 'Godkännande' }).click();
    await dialog.getByLabel('Rubrik').fill(title);
  });

  const { client, context } = await clientOpensDecisions(page);
  const card = client.locator('sl-decision-card').filter({ hasText: title });
  await card.getByRole('button', { name: 'Avböj' }).click();
  const dialog = client.getByRole('dialog', { name: 'Avböj beslutet' });
  await dialog.getByLabel(/Varför/).fill('Vi vill hellre ha vit fog.');
  await dialog.getByRole('button', { name: 'Avböj' }).click();
  await expect(card.getByText(/Avböjt av Anna Lindqvist/)).toBeVisible();

  const staffCard = page.locator('sl-decision-card').filter({ hasText: title });
  await expect(staffCard.getByText('Vi vill hellre ha vit fog.')).toBeVisible({ timeout: 5000 });
  await context.close();
});

test('a client chooses between options and the price difference shows', async ({ page }) => {
  const title = unique('Välj bänkskiva');
  await staffCreatesDecision(page, async (dialog) => {
    await dialog.getByRole('button', { name: 'Val', exact: true }).click();
    await dialog.getByLabel('Rubrik').fill(title);
    await dialog.getByLabel('Alternativ 1', { exact: true }).fill('Ek');
    await dialog.getByLabel('Alternativ 2', { exact: true }).fill('Komposit');
    await dialog.getByLabel('Prisskillnad för alternativ 2').fill('3 500');
  });

  const { client, context } = await clientOpensDecisions(page);
  const card = client.locator('sl-decision-card').filter({ hasText: title });
  await expect(card.getByRole('button', { name: 'Välj' })).toBeDisabled();
  await card.getByLabel(/Komposit/).check();
  await card.getByRole('button', { name: 'Välj' }).click();
  await expect(card.getByText(/Valt av Anna Lindqvist/)).toBeVisible();
  await expect(card.getByText('+3 500 kr')).toBeVisible();
  await context.close();
});

test('a tutor adds a weekly client and reports a visit; the parent reads it and sees what to practise', async ({
  page,
  browser,
}, testInfo) => {
  const pupil = unique('Matte med Lo');
  const stockholmNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }),
  );
  // The visit is today at 23:45, and only visits still ahead are planned.
  test.skip(
    stockholmNow.getHours() * 60 + stockholmNow.getMinutes() >= 23 * 60 + 30,
    'Too close to midnight',
  );
  // Today's weekday in Stockholm, by the buttons' accessible names.
  const weekday = [
    'söndagar',
    'måndagar',
    'tisdagar',
    'onsdagar',
    'torsdagar',
    'fredagar',
    'lördagar',
  ][stockholmNow.getDay()]!;
  const phone = testInfo.project.name === 'mobile' ? '070-174 06 50' : '070-174 06 51';

  await signIn(page, 'karin@bergmatte.example');
  await page.goto('/app/clients/new');
  await page.getByLabel('Vad tjänsten gäller').fill(pupil);
  await page.getByLabel('Förälderns namn').fill('Sara Holm');
  await page.getByLabel('Mobilnummer').fill(phone);
  await page.getByRole('button', { name: weekday, exact: true }).click();
  await page.getByLabel('Starttid').fill('23:45');
  await page.getByRole('button', { name: 'Lägg till kund' }).click();
  await expect(page).toHaveURL(/\/visit$/);
  await expect(page.getByText(/Varje vecka på/)).toBeVisible();

  // Today's visit shows on the staff home with a Report button.
  await page.goto('/app');
  const strip = page.getByRole('region', { name: 'Idag' });
  const row = strip.getByRole('listitem').filter({ hasText: pupil });
  await row.getByRole('link', { name: 'Rapport' }).click();

  const report = page.getByRole('dialog', { name: /Rapport från besöket/ });
  await expect(report).toBeVisible();
  await expectNoAxeViolations(page);
  await report.getByLabel('Gick igenom dagens moment').check();
  await report.getByRole('button', { name: 'Bra' }).click();
  await report.getByLabel('Till föräldern').fill('Lo löste alla ekvationer själv.');
  await report.getByLabel('Öva till nästa gång').fill('Sidan 12, uppgift 1-5');
  await report.getByRole('button', { name: 'Lägg till' }).last().click();
  await report.getByRole('button', { name: 'Skicka rapport' }).click();
  await expect(page.getByText('Rapporten är skickad.')).toBeVisible();

  // The parent gets the link and the report straight away.
  const parentContext = await browser.newContext({
    ...testInfo.project.use,
    reducedMotion: 'reduce',
  });
  const parent = await parentContext.newPage();
  await parent.goto(await linkInTextMessage(`uppdateringar om ${pupil} här:`));
  const card = parent
    .locator('sl-post-card')
    .filter({ hasText: 'Lo löste alla ekvationer själv.' });
  await expect(card.getByText('Besöksrapport')).toBeVisible();
  await expect(card.getByText('Gick igenom dagens moment')).toBeVisible();
  await expect(card.getByText('Sidan 12, uppgift 1-5')).toBeVisible();
  await expect(parent.getByRole('link', { name: 'Besök' })).toBeVisible();
  await expect(parent.getByRole('link', { name: 'Överlämning' })).toHaveCount(0);

  // The practice item is on the parent's list for the next visit.
  await parent.getByRole('link', { name: 'Besök' }).click();
  await expect(parent.getByText('Sidan 12, uppgift 1-5')).toBeVisible();
  await expectNoAxeViolations(parent);
  await parentContext.close();
});

test('the next visit and its checklist: the client ticks their item, staff see who did it', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Ticks a shared seed item once');
  const context = await browser.newContext({ ...testInfo.project.use, reducedMotion: 'reduce' });
  const client = await context.newPage();
  await client.goto(await linkInTextMessage('Hej Anna! Ek & Lind Snickeri'));
  await client.getByRole('link', { name: 'Nästa besök' }).click();
  await expect(client.getByText('Vattnet är avstängt 09:00-11:00.')).toBeVisible();
  await expect(client.getByLabel('Ta med kakelfix och fogsvamp')).toBeDisabled();
  await client.getByLabel('Flytta bilen från uppfarten').check();
  await expect(client.getByText(/Klart av Anna Lindqvist/)).toBeVisible();

  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/projects/lindqvist-kok/visit');
  await expect(page.getByText(/Klart av Anna Lindqvist/)).toBeVisible();
  await expect(page.getByLabel('Ta med kakelfix och fogsvamp')).toBeEnabled();
  await context.close();
});
