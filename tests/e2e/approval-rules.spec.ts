import { type Browser, expect, test, type TestInfo } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { linkInTextMessage, signIn } from './emulators';

async function openAsClient(browser: Browser, testInfo: TestInfo, text: string) {
  const context = await browser.newContext({ ...testInfo.project.use, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(await linkInTextMessage(text));
  return { context, page };
}

test('a couple requires both approvals; an ÄTA is approved only when both have said yes', async ({
  page,
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now() % 100000}`;
  const projectTitle = `Altan Lindqvist ${suffix}`;

  // Staff create a project and invite both of them.
  await signIn(page, 'erik@eklind.example');
  await page.getByRole('link', { name: 'Nytt projekt' }).click();
  await page.getByLabel('Projektnamn').fill(projectTitle);
  await page.getByRole('button', { name: 'Skapa projekt' }).click();
  await expect(page).toHaveURL(/\/people$/);
  const invite = async (name: string, phone: string) => {
    const dialog = page.getByRole('dialog', { name: 'Bjud in en kund' });
    if (!(await dialog.isVisible()))
      await page.getByRole('button', { name: 'Bjud in kund' }).click();
    await dialog.getByLabel('Namn').fill(name);
    await dialog.getByLabel('Mobilnummer').fill(phone);
    await dialog.getByRole('button', { name: 'Skicka inbjudan' }).click();
    await expect(page.getByText(`Inbjudan till ${name} är skickad.`)).toBeVisible();
  };
  await invite('Sara Lindqvist', '070-174 06 70');
  await invite('Per Lindqvist', '070-174 06 71');

  // Sara asks for both of them to approve.
  const sara = await openAsClient(
    browser,
    testInfo,
    `Hej Sara! Ek & Lind Snickeri delar uppdateringar om ${projectTitle}`,
  );
  await expect(sara.page.getByRole('heading', { level: 1, name: projectTitle })).toBeVisible();
  await sara.page.goto('/c/settings');
  const ours = sara.page.locator('section').filter({ hasText: projectTitle });
  await ours.getByLabel('Alla måste godkänna').check();
  await expect(sara.page.getByText('Regeln är sparad.', { exact: false })).toBeVisible();
  await expectNoAxeViolations(sara.page);

  // Staff see the change in the feed, then send an extra.
  const projectUrl = page.url().replace(/\/people$/, '');
  await page.goto(projectUrl);
  await expect(
    page.getByText(/Sara Lindqvist ändrade så att alla kunder måste godkänna/),
  ).toBeVisible();
  await page.goto(`${projectUrl}/decisions`);
  await page.getByRole('button', { name: 'Nytt beslut' }).click();
  const editor = page.getByRole('dialog', { name: 'Nytt beslut' });
  await editor.getByLabel('Rubrik').fill('Extra trappsteg');
  await editor.getByLabel('Pris inklusive moms (kr)').fill('3 200');
  await editor.getByRole('button', { name: 'Skicka till kunden' }).click();
  await expect(page.getByText('Beslutet är skickat till kunden.')).toBeVisible();

  // Sara approves: the card waits for Per.
  await sara.page.goto(sara.page.url().replace('/c/settings', '/c'));
  await sara.page.getByRole('link', { name: new RegExp(projectTitle) }).click();
  await sara.page.getByRole('link', { name: 'Beslut' }).click();
  const saraCard = sara.page.locator('sl-decision-card').filter({ hasText: 'Extra trappsteg' });
  await expect(saraCard.getByText('Alla måste godkänna. Väntar på Sara, Per.')).toBeVisible();
  await saraCard.getByRole('button', { name: 'Godkänn' }).click();
  await expect(saraCard.getByText('Du har godkänt. Väntar på Per.')).toBeVisible();
  await expect(saraCard.getByRole('button', { name: 'Godkänn' })).toHaveCount(0);
  const staffCard = page.locator('sl-decision-card').filter({ hasText: 'Extra trappsteg' });
  await expect(staffCard.getByText('Sara har godkänt. Väntar på Per.')).toBeVisible();

  // Per approves: now it's approved, by both.
  const per = await openAsClient(
    browser,
    testInfo,
    `Hej Per! Ek & Lind Snickeri delar uppdateringar om ${projectTitle}`,
  );
  await per.page.getByRole('link', { name: 'Beslut' }).click();
  const perCard = per.page.locator('sl-decision-card').filter({ hasText: 'Extra trappsteg' });
  await expect(perCard.getByText('Sara har godkänt. Väntar på Per.')).toBeVisible();
  await perCard.getByRole('button', { name: 'Godkänn' }).click();
  await expect(perCard.getByText(/Godkänt av Sara Lindqvist & Per Lindqvist/)).toBeVisible();
  await expect(staffCard.getByText(/Godkänt av Sara Lindqvist & Per Lindqvist/)).toBeVisible();

  await sara.context.close();
  await per.context.close();
});
