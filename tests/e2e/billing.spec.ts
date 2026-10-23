import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { signIn } from './emulators';

test('an owner subscribes, a payment fails and is fixed, then they cancel (F10)', async ({
  page,
}, testInfo) => {
  await signIn(page, `owner-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.getByLabel('Företagsnamn').fill('Gröna Händer');
  await page.getByLabel('Ditt namn').fill('Lo Gran');
  await page.getByLabel('Organisationsnummer').fill('556016-0680');
  await page.getByRole('button', { name: 'Fortsätt' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ditt första projekt' })).toBeVisible();

  await page.goto('/app/settings/billing');
  await expect(page.getByRole('heading', { level: 2, name: 'Gratis' })).toBeVisible();
  await page.getByText('Årsvis (två månader gratis)').click();
  const solo = page.locator('li.plan').filter({ hasText: 'Solo' });
  await expect(solo.getByText('2 990 kr')).toBeVisible();
  await expectNoAxeViolations(page);
  await solo.getByRole('button', { name: 'Välj Solo' }).click();

  // The emulator's stand-in for Stripe Checkout.
  await expect(page).toHaveURL(/\/dev\/billing\?checkout=1&plan=solo&interval=year/);
  await page.getByRole('button', { name: 'Betala' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/billing\?checkout=done/);
  await expect(page.getByText('Tack! Abonnemanget är igång.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Solo' })).toBeVisible();
  await expect(solo.getByText('Ert abonnemang')).toBeVisible();
  await expect(page.getByText('5 aktiva projekt').first()).toBeVisible();

  await page.goto('/dev/billing');
  await page.getByRole('button', { name: 'Betalningen misslyckas' }).click();
  await expect(page.getByText('Händelsen är skickad.')).toBeVisible();
  await page.goto('/app/settings/billing');
  await expect(page.getByRole('alert')).toContainText('Den senaste betalningen gick inte igenom');

  await page.goto('/dev/billing');
  await page.getByRole('button', { name: 'Säg upp' }).click();
  await expect(page.getByText('Händelsen är skickad.')).toBeVisible();
  await page.goto('/app/settings/billing');
  await expect(page.getByRole('heading', { level: 2, name: 'Gratis' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Välj Solo' })).toBeVisible();
});
