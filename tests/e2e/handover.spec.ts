import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { linkInTextMessage, signIn } from './emulators';

const photo = {
  name: 'ror.jpg',
  mimeType: 'image/jpeg',
  buffer: readFileSync(new URL('../../functions/assets/photos/el-display.jpg', import.meta.url)),
};

test('from hidden work and a condition check-in to the handover pack, reminders and booking again', async ({
  page,
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name} ${Date.now() % 100000}`;
  const title = `Badrum Holm ${suffix}`;
  const clientName = `Sam Holm ${suffix}`;

  // Staff: a project with a client.
  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/projects/new');
  await page.getByLabel('Projektnamn').fill(title);
  await page.getByRole('button', { name: 'Skapa projekt' }).click();
  const invite = page.getByRole('dialog', { name: 'Bjud in en kund' });
  await invite.getByLabel('Namn').fill(clientName);
  await invite
    .getByLabel('Mobilnummer')
    .fill(testInfo.project.name === 'mobile' ? '070-174 06 90' : '070-174 06 91');
  await invite.getByRole('button', { name: 'Skicka inbjudan' }).click();
  await expect(page.getByText(`Inbjudan till ${clientName} är skickad.`)).toBeVisible();
  const projectUrl = page.url().replace(/\/people$/, '');

  // A hidden-work photo (F18).
  await page.goto(projectUrl);
  await page.getByLabel('Skriv en uppdatering').fill('Nya rör innan väggen stängs.');
  await page.locator('sl-composer input[type=file]').setInputFiles(photo);
  await page.getByRole('button', { name: 'Bild 1 visar dolt arbete' }).click();
  await expect(page.getByRole('button', { name: 'Bild 1 visar dolt arbete' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Publicera' }).click();
  const update = page.locator('sl-post-card').filter({ hasText: 'Nya rör innan väggen stängs.' });
  await expect(update.getByText('Dolt arbete')).toBeVisible({ timeout: 15_000 });

  // A condition check-in (F12).
  await page.getByRole('button', { name: 'Skick vid start' }).click();
  const condition = page.getByRole('dialog', { name: 'Dokumentera skicket' });
  await condition.locator('input[type=file]').setInputFiles(photo);
  await condition.getByLabel('Vad syns på bilden?').fill('Spricka i kakel');
  await condition.getByLabel(/Var\?/).fill('Duschväggen');
  await condition.getByRole('button', { name: 'Publicera' }).click();
  const report = page.locator('sl-post-card').filter({ hasText: 'Spricka i kakel · Duschväggen' });
  await expect(report.getByText('Väntar på att kunden bekräftar.')).toBeVisible({
    timeout: 15_000,
  });

  // The client acknowledges it.
  const context = await browser.newContext({ ...testInfo.project.use, reducedMotion: 'reduce' });
  const client = await context.newPage();
  await client.goto(await linkInTextMessage(`uppdateringar om ${title} här:`));
  const clientReport = client.locator('sl-post-card').filter({ hasText: 'Spricka i kakel' });
  await clientReport.getByRole('button', { name: 'Jag har sett bilderna' }).click();
  await expect(
    clientReport.getByText(new RegExp(`${clientName} bekräftade 1 bilder`)),
  ).toBeVisible();
  await expect(report.getByText(new RegExp(`${clientName} bekräftade`))).toBeVisible();

  // The handover pack (F9) and a reminder (F13).
  await page.goto(`${projectUrl}/handover`);
  await page.getByLabel('Vad som gjordes').fill('Badrummet är klart.');
  await page.getByRole('button', { name: 'Lägg till produkt' }).click();
  await page.getByLabel('Namn', { exact: true }).fill('Klinker');
  await page.getByLabel('Garanti (år)').fill('10');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Skapa överlämningspaket' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Skapa överlämningspaket' }).click();
  await expect(page.getByText('Version 1 av överlämningspaketet är klar.')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Version 1' })).toBeVisible();
  await page.getByLabel('Vad ska påminnas om?').fill('Rensa golvbrunnen');
  await page.getByLabel('Datum').fill('2030-05-01');
  await page.getByRole('button', { name: 'Lägg till påminnelse' }).click();
  await expect(page.getByText('Rensa golvbrunnen')).toBeVisible();

  // The client finds the pack and books again.
  await client.goto(client.url().replace(/\/c\/([\w-]+).*/, '/c/$1'));
  await expect(client.getByText('Överlämningspaketet är klart.')).toBeVisible();
  await client.getByRole('link', { name: 'Överlämning', exact: true }).click();
  await expect(client.getByRole('button', { name: 'Ladda ner överlämningspaketet' })).toBeVisible();
  await expect(client.getByText('Rensa golvbrunnen')).toBeVisible();
  await expectNoAxeViolations(client);
  await client.getByRole('button', { name: 'Boka Ek & Lind Snickeri igen' }).click();
  await client.getByRole('dialog').getByLabel('Meddelande').fill('I maj?');
  await client.getByRole('dialog').getByRole('button', { name: 'Skicka förfrågan' }).click();
  await expect(client.getByText('Förfrågan är skickad till Ek & Lind Snickeri.')).toBeVisible();
  await context.close();

  await page.goto('/app');
  await expect(
    page
      .getByRole('region', { name: 'Att göra' })
      .getByRole('link', { name: new RegExp(`${title}.*vill boka igen`) }),
  ).toBeVisible();
});
