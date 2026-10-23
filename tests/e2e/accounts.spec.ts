import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { linksInTextMessages, newLinkInTextMessage } from './emulators';

const SIGN_IN_TEXT = 'Din inloggningslänk till Siteline';

test('a client signs in with their mobile number and switches between firms', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Är du kund? Logga in här' }).click();
  await expect(page).toHaveURL(/\/login\/client$/);
  await expectNoAxeViolations(page);
  await page.getByLabel('Mobilnummer eller e-post').fill('070-174 06 05');
  const seen = await linksInTextMessages(SIGN_IN_TEXT);
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click();
  await expect(page.getByRole('heading', { name: 'Kolla din telefon eller e-post' })).toBeVisible();

  await page.goto(await newLinkInTextMessage(SIGN_IN_TEXT, seen));
  await expect(page).toHaveURL(/\/c$/);
  await expect(page.getByRole('heading', { name: 'Hej Anna!' })).toBeVisible();

  // The firm's name in the top bar switches to the other firm's project.
  await page.getByRole('link', { name: /Köksrenovering Lindqvist/ }).click();
  const toggle = page.getByRole('button', { name: 'Ek & Lind Snickeri, byt projekt' });
  await toggle.click();
  const menu = page.getByRole('navigation', { name: 'Dina projekt' });
  await expect(menu.getByRole('link', { name: /Köksrenovering Lindqvist/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(toggle).toBeFocused();

  await toggle.click();
  await menu.getByRole('link', { name: /Matte med Elsa/ }).click();
  await expect(page).toHaveURL(/\/c\/matte-elsa$/);
  await expect(page.getByRole('button', { name: 'Berg Mattehjälp, byt projekt' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Matte med Elsa' })).toBeVisible();
});

test('a sign-in link is used once', async ({ page, browser }) => {
  await page.goto('/login/client');
  await page.getByLabel('Mobilnummer eller e-post').fill('0701740605');
  const seen = await linksInTextMessages(SIGN_IN_TEXT);
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click();
  await expect(page.getByRole('heading', { name: 'Kolla din telefon eller e-post' })).toBeVisible();
  const link = await newLinkInTextMessage(SIGN_IN_TEXT, seen);
  await page.goto(link);
  await expect(page).toHaveURL(/\/c$/);
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(link);
  await expect(second).toHaveURL(/\/link-expired$/);
  await expect(second.getByRole('link', { name: /Logga in med ditt mobilnummer/ })).toBeVisible();
  await other.close();
});

test('a firm tries Siteline in a sandbox where nothing reaches real people', async ({ page }) => {
  await page.goto('/try');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: /Jag driver ett företag/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Du provar Siteline med påhittade projekt.')).toBeVisible();
  await page
    .getByRole('link', { name: /Köksrenovering Lindqvist/ })
    .last()
    .click();
  await expect(page.getByText('Bänkskivan levereras').first()).toBeVisible();
  await expect(page.getByText(/Extra uttag vid fönstret/).first()).toBeVisible();

  await page.getByRole('link', { name: 'Personer' }).click();
  await page.getByRole('button', { name: 'Bjud in kund' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bjud in en kund' });
  await dialog.getByLabel('Namn').fill('Riktig Person');
  await dialog.getByLabel('Mobilnummer').fill('070-174 06 50');
  await dialog.getByRole('button', { name: 'Skicka inbjudan' }).click();
  await expect(page.getByText(/I provläget kan du inte bjuda in/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Avsluta provet' }).first().click();
  await expect(page).toHaveURL(/\/try$/);
});

test('a client tries Siteline with projects from two firms', async ({ page }) => {
  await page.goto('/try');
  await page.getByRole('button', { name: /Jag är kund/ }).click();
  await expect(page).toHaveURL(/\/c$/);
  await expect(page.getByText('Du provar Siteline med påhittade projekt.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Köksrenovering Lindqvist/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Matte med Elsa/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('link', { name: /Matte med Elsa/ }).click();
  await expect(page.getByText(/Öva på sidan 42/).first()).toBeVisible();
});
