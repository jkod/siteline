import { expect, test } from '@playwright/test';

import { signIn } from './emulators';

test('the decision editor explains a price below labour and material, inside the dialog', async ({
  page,
}) => {
  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/projects/lindqvist-kok/decisions');
  const card = page.locator('sl-decision-card').filter({ hasText: 'Extra uttag vid fönstret' });
  await card.getByRole('button', { name: 'Ändra' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Pris inklusive moms (kr)').fill('1 500');
  await dialog
    .getByRole('button')
    .filter({ hasText: /Skicka/ })
    .first()
    .click();
  await expect(dialog.getByText('Arbete och material kan inte vara mer än priset.')).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Avbryt' }).click();
  await expect(card.getByText('1 800 kr')).toBeVisible();
});

test('an owner changes the language from their account, and it sticks', async ({ page }) => {
  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/settings/me');
  await page.getByRole('button', { name: 'English' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  await page.getByRole('button', { name: 'Svenska' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mitt konto' })).toBeVisible();
});

test('a failed save shows in the dialog and as a toast above it', async ({ page }) => {
  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/projects/lindqvist-kok/people');
  await page.getByRole('button', { name: 'Bjud in kund' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bjud in en kund' });
  await dialog.getByLabel('Namn').fill('Testa Fel');
  await dialog.getByLabel('Mobilnummer').fill('070-174 06 95');
  await page.route('**/inviteClient', (route) => route.abort());
  await dialog.getByRole('button', { name: 'Skicka inbjudan' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Något gick fel. Försök igen.');
  const toast = page.locator('sl-toaster .toast').filter({ hasText: 'Något gick fel' });
  await expect(toast).toBeVisible();
  const box = (await toast.boundingBox())!;
  const onTop = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('sl-toaster'),
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(onTop).toBe(true);
  await expect(dialog).toBeVisible();
});
