import { expect, type Page, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { linkInTextMessage, signIn } from './emulators';

const unique = (text: string) => `${text} ${Date.now() % 100000}`;

/** Records a couple of seconds from the fake microphone, using the keyboard (tap to start and stop). */
async function record(page: Page) {
  const talk = page.getByRole('button', { name: 'Håll för att prata' });
  await talk.focus();
  await page.keyboard.press('Enter');
  const stop = page.getByRole('button', { name: /^Stoppa/ });
  await expect(stop).toHaveAttribute('aria-pressed', 'true');
  await expect(stop).toContainText('0:02');
  await page.keyboard.press('Enter');
}

test('staff talk an update; the draft is edited and confirmed before it is posted (F5)', async ({
  page,
}) => {
  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/projects/lindqvist-kok');
  const box = page.getByLabel('Skriv en uppdatering');

  // Thrown away: the box empties and nothing is posted.
  await record(page);
  await expect(box).toHaveValue(/Vi har satt upp skåpen i dag/);
  await page.getByRole('button', { name: 'Släng utkastet' }).click();
  await expect(box).toHaveValue('');

  // Kept: nothing is posted until the user publishes their edited draft.
  await record(page);
  await expect(page.getByText(/Utkast från din inspelning/)).toBeVisible();
  await expect(box).toHaveValue(
    'Vi har satt upp skåpen i dag. Bänkskivan kommer på måndag klockan 9.',
  );
  await expectNoAxeViolations(page);
  const text = unique('Vi har satt upp skåpen i dag. Bänkskivan kommer på måndag klockan 10.');
  await box.fill(text);
  await expect(page.locator('sl-post-card').filter({ hasText: text })).toHaveCount(0);
  await page.getByRole('button', { name: 'Publicera' }).click();
  await expect(page.locator('sl-post-card').filter({ hasText: text })).toBeVisible();
  await expect(page.getByText(/Utkast från din inspelning/)).toHaveCount(0);
});

test('staff see which clients have seen a recent post (F16)', async ({ page, browser }) => {
  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/projects/lindqvist-kok');
  const text = unique('Golvlisterna är uppe.');
  await page.getByLabel('Skriv en uppdatering').fill(text);
  await page.getByRole('button', { name: 'Publicera' }).click();
  const post = page.locator('sl-post-card').filter({ hasText: text });
  await expect(post).toBeVisible();
  await expect(post.locator('.seen')).toHaveCount(0);

  const client = await browser.newContext();
  const clientPage = await client.newPage();
  await clientPage.goto(await linkInTextMessage('Hej Anna! Ek & Lind Snickeri'));
  await expect(clientPage.getByText(text)).toBeVisible();
  await client.close();

  await expect(post.locator('.seen')).toHaveText(/^\s*Sedd av Anna \d\d:\d\d\s*$/, {
    timeout: 10_000,
  });
});

test('the Today list shows what needs doing, with links (F14)', async ({ page }) => {
  await signIn(page, 'erik@eklind.example');
  const todo = page.getByRole('region', { name: 'Att göra' });
  await expect(todo).toBeVisible();
  await expect(
    todo.getByRole('link', { name: /Köksrenovering Lindqvist.*obesvarad fråga/ }),
  ).toBeVisible();
  const visit = todo.getByRole('link', { name: /Besök i morgon 07:30, \d+ punkter? kvar/ });
  await expect(visit).toBeVisible();
  await expectNoAxeViolations(page);
  await visit.click();
  await expect(page).toHaveURL(/\/app\/projects\/lindqvist-kok\/visit$/);
});

test('a client invites a business, which signs up and is credited to the firm (F20)', async ({
  page,
  browser,
}, testInfo) => {
  // The phone's share sheet: capture what would be shared.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      value: async (data: ShareData) => {
        (window as unknown as { shared: ShareData }).shared = data;
      },
    });
  });
  await page.goto(await linkInTextMessage('Hej Anna! Ek & Lind Snickeri'));
  await expect(page.getByText('Bänkskivan levereras').first()).toBeVisible();
  await page.getByRole('link', { name: 'Alla projekt' }).click();
  const card = page.getByRole('region', { name: 'Får du annat gjort hemma?' });
  await expect(card).toBeVisible();
  await expectNoAxeViolations(page);
  await card.getByLabel('Vilken sorts företag?').selectOption('garden');
  await card.getByRole('button', { name: 'Dela inbjudan' }).click();
  const shared = await page.waitForFunction(
    () => (window as unknown as { shared?: ShareData }).shared,
  );
  const { text, url } = (await shared.jsonValue()) as ShareData;
  expect(text).toContain('Siteline');
  expect(url).toMatch(/^http:\/\/localhost:4300\/r\/[A-Za-z0-9]{10}$/);

  // The invited business: the page names Anna and nothing more.
  const business = await browser.newContext();
  const invited = await business.newPage();
  await invited.goto(url!);
  await expect(
    invited.getByRole('heading', { name: 'Anna bjuder in dig till Siteline' }),
  ).toBeVisible();
  await expect(invited.getByText(/rapport efter varje besök/)).toBeVisible();
  await expect(invited.getByText(/Lindqvist|070/)).toHaveCount(0);
  await expectNoAxeViolations(invited);
  await invited.getByRole('button', { name: 'Kom igång' }).click();
  await expect(invited).toHaveURL(/\/login$/);
  await signIn(invited, `lo-${testInfo.project.name}-${Date.now()}@example.com`);
  await expect(invited).toHaveURL(/\/onboarding$/);
  await invited.getByLabel('Företagsnamn').fill('Gröna Händer');
  await invited.getByLabel('Ditt namn').fill('Lo Gran');
  await invited.getByLabel('Organisationsnummer').fill('556016-0680');
  await invited.getByRole('button', { name: 'Fortsätt' }).click();
  await expect(
    invited.getByRole('heading', { level: 1, name: 'Ditt första projekt' }),
  ).toBeVisible();
  await business.close();

  // The firm sees it in billing settings.
  const firm = await browser.newContext();
  const firmPage = await firm.newPage();
  await signIn(firmPage, 'erik@eklind.example');
  await firmPage.goto('/app/settings/billing');
  await expect(firmPage.getByText(/Dina kunder har tagit med [1-9]\d* företag/)).toBeVisible();
  await firm.close();
});

test('privacy and terms pages exist, linked from sign-in', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Integritetspolicy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Integritetspolicy' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Utkast');
  await expectNoAxeViolations(page);
  await page.getByRole('link', { name: 'Villkor' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Villkor' })).toBeVisible();
  await expect(page).toHaveTitle('Villkor · Siteline');
});
