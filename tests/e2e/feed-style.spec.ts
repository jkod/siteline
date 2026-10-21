import { expect, type Locator, type Page, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { linkInTextMessage, signIn } from './emulators';

const toChat = /^Nyast överst, byt/;
const toFeed = /^Nyast nederst, byt/;

/** The position of a post in the feed list, from the top. */
async function indexOf(page: Page, text: string): Promise<number> {
  const items = await page.locator('sl-feed ul.list > li').allInnerTexts();
  return items.findIndex((t) => t.includes(text));
}

/** The composer is inside the viewport and, on phones, above the fixed tab bar. */
async function expectPinned(page: Page, composer: Locator) {
  const box = (await composer.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.y).toBeGreaterThan(viewport.height / 3);
  const tabs = page.getByRole('navigation', { name: 'Projektets delar' });
  const tabBox = await tabs.boundingBox();
  if (tabBox && tabBox.y > viewport.height / 2)
    expect(box.y + box.height).toBeLessThanOrEqual(tabBox.y + 1);
}

test('a client switches to chat order: newest last, composer pinned, and the choice is remembered', async ({
  page,
}, testInfo) => {
  await page.goto(await linkInTextMessage('Hej Anna! Ek & Lind Snickeri'));
  await expect(page.getByText('Bänkskivan levereras').first()).toBeVisible();
  const composer = page.locator('sl-feed .dock sl-composer');

  // Each browser project signs in as the same client, so start from the default order.
  const reset = page.getByRole('button', { name: toFeed });
  if (await reset.isVisible()) {
    await reset.click();
    await expect(page.getByRole('button', { name: toChat })).toBeVisible();
  }

  // Newest first by default.
  expect(await indexOf(page, 'Bänkskivan levereras')).toBeLessThan(
    await indexOf(page, 'Skåpstommarna är på plats'),
  );
  await expectPinned(page, composer);

  await page.getByRole('button', { name: toChat }).click();
  await expect(page.getByRole('button', { name: toFeed })).toBeVisible();
  expect(await indexOf(page, 'Skåpstommarna är på plats')).toBeLessThan(
    await indexOf(page, 'Bänkskivan levereras'),
  );
  await expectPinned(page, composer);
  await expectNoAxeViolations(page);

  // Scrolled to the top, the composer is still pinned at the bottom.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectPinned(page, composer);

  // A new question lands at the bottom, by the composer.
  const question = `Kommer ni på fredag? ${testInfo.project.name} ${Date.now() % 10000}`;
  await page.getByLabel('Ställ en fråga').fill(question);
  await page.getByRole('button', { name: 'Skicka fråga' }).click();
  const last = page.locator('sl-feed ul.list > li').last();
  await expect(last).toContainText(question);
  await expect(page.locator('sl-feed li.pending')).toHaveCount(0);
  await expect(last).toBeInViewport();

  // Delete the question again, so later tests still see the seeded unanswered count.
  await last.getByRole('button', { name: 'Ta bort' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ta bort' }).click();
  await expect(last).toContainText('Borttaget av författaren');

  // The choice is saved on the profile.
  await page.reload();
  await expect(page.getByRole('button', { name: toFeed })).toBeVisible();
  await page.getByRole('button', { name: toFeed }).click();
  await expect(page.getByRole('button', { name: toChat })).toBeVisible();
  expect(await indexOf(page, 'Bänkskivan levereras')).toBeLessThan(
    await indexOf(page, 'Skåpstommarna är på plats'),
  );
});

test('the top bar hides while scrolling toward older posts and returns at once the other way', async ({
  page,
}) => {
  await page.goto(await linkInTextMessage('Hej Anna! Ek & Lind Snickeri'));
  await expect(page.getByText('Bänkskivan levereras').first()).toBeVisible();
  const bar = page.locator('header.brand');
  const shown = async () => ((await bar.boundingBox())?.y ?? -1) >= 0;
  const scrollBy = (dy: number) => page.evaluate((y) => window.scrollBy(0, y), dy);

  // Newest first: older posts are further down.
  await page.evaluate(() => window.scrollTo(0, 0));
  await scrollBy(400);
  await expect.poll(shown).toBe(false);
  await scrollBy(-40);
  await expect.poll(shown).toBe(true);
  await scrollBy(40);
  await expect.poll(shown).toBe(false);
  // Keyboard focus brings it back.
  await bar.getByRole('link', { name: 'Alla projekt' }).focus();
  await expect.poll(shown).toBe(true);

  // Chat order: older posts are up, so it's the other way round.
  await page.getByRole('button', { name: toChat }).click();
  await expect(page.getByRole('button', { name: toFeed })).toBeVisible();
  await scrollBy(-400);
  await expect.poll(shown).toBe(false);
  await scrollBy(40);
  await expect.poll(shown).toBe(true);
  // At the very top it always shows.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(shown).toBe(true);

  await page.getByRole('button', { name: toFeed }).click();
  await expect(page.getByRole('button', { name: toChat })).toBeVisible();
});

test('on wide screens the project tabs float at the top, with the project name, and slide away while scrolling', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/projects/lindqvist-kok');
  await expect(page.getByText('Bänkskivan levereras').first()).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Projektets delar' });
  const top = async () => Math.round((await tabs.boundingBox())?.y ?? -999);
  const name = page.locator('.toolbar-title');
  await page.mouse.move(700, 400);

  // At first the tabs sit under the project header, without the name.
  expect(await top()).toBeGreaterThan(100);
  await expect(name).toBeHidden();

  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 120);
  await expect.poll(top).toBeLessThan(0);
  await page.mouse.wheel(0, -120);
  await expect.poll(top).toBeGreaterThanOrEqual(0);
  await expect.poll(top).toBeLessThan(20);
  await expect(name).toBeVisible();
  await expect(name).toHaveText('Köksrenovering Lindqvist');
  await expectNoAxeViolations(page);
});
