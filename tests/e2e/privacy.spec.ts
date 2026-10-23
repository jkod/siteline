import { expect, type Page, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { linkInTextMessage, signIn } from './emulators';

async function newProject(page: Page, title: string) {
  await page.goto('/app/projects/new');
  await page.getByLabel('Projektnamn').fill(title);
  await page.getByRole('button', { name: 'Skapa projekt' }).click();
  await expect(page).toHaveURL(/\/people$/);
}

test('an owner deletes a project after typing its name (F11)', async ({ page }, testInfo) => {
  const title = `Radera mig ${testInfo.project.name} ${Date.now() % 100000}`;
  await signIn(page, 'erik@eklind.example');
  await newProject(page, title);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Radera projekt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Radera projektet?' });
  await expect(dialog.getByRole('button', { name: 'Ladda ner beslut (CSV)' })).toBeVisible();
  await expectNoAxeViolations(page);
  const confirm = dialog.getByRole('button', { name: 'Radera för alltid' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Skriv projektets namn/).fill(title);
  await confirm.click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Projektet är raderat.')).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
});

test('a client leaves a project from settings (F11)', async ({ page, browser }, testInfo) => {
  const suffix = `${testInfo.project.name} ${Date.now() % 100000}`;
  const title = `Lämna mig ${suffix}`;
  const name = `Kim Test ${suffix}`;
  await signIn(page, 'erik@eklind.example');
  await newProject(page, title);
  const invite = page.getByRole('dialog', { name: 'Bjud in en kund' });
  await invite.getByLabel('Namn').fill(name);
  await invite
    .getByLabel('Mobilnummer')
    .fill(testInfo.project.name === 'mobile' ? '070-174 06 80' : '070-174 06 81');
  await invite.getByRole('button', { name: 'Skicka inbjudan' }).click();
  await expect(page.getByText(`Inbjudan till ${name} är skickad.`)).toBeVisible();

  const context = await browser.newContext({ ...testInfo.project.use, reducedMotion: 'reduce' });
  const client = await context.newPage();
  await client.goto(await linkInTextMessage(`uppdateringar om ${title} här:`));
  await expect(client.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await client.goto('/c/settings');
  const card = client
    .locator('section')
    .filter({ has: client.getByRole('heading', { name: title }) });
  await card.getByRole('button', { name: 'Lämna projektet' }).click();
  await client.getByRole('dialog').getByRole('button', { name: 'Lämna projektet' }).click();
  await expect(client.getByText('Du har lämnat projektet.')).toBeVisible();
  await expect(client.getByRole('heading', { name: title })).toHaveCount(0);
  await client.goto('/c');
  await expect(client.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
  await context.close();
});
