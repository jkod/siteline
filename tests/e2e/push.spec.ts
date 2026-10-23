import { expect, test } from '@playwright/test';

import { linkInTextMessage, pushMessages, signIn } from './emulators';

test('staff turn on notifications and hear about a client question by push', async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/settings/me');
  const notifications = page.getByRole('region', { name: 'Aviseringar' });
  await notifications.getByRole('button', { name: 'Slå på aviseringar' }).click();
  await expect(notifications.getByText('Aviseringar är på i den här webbläsaren.')).toBeVisible();
  await page.reload();
  await expect(notifications.getByText('Aviseringar är på i den här webbläsaren.')).toBeVisible();

  const question = `Hur går det med listerna? ${testInfo.project.name} ${Date.now() % 100000}`;
  const context = await browser.newContext({ ...testInfo.project.use });
  const client = await context.newPage();
  await client.goto(await linkInTextMessage('Hej Anna! Ek & Lind Snickeri'));
  await client.getByLabel('Ställ en fråga').fill(question);
  await client.getByRole('button', { name: 'Skicka fråga' }).click();
  const post = client.locator('sl-post-card').filter({ hasText: question });
  await expect(post).toBeVisible();
  // Deleted again, so later tests still see the seeded unanswered count.
  await post.getByRole('button', { name: 'Ta bort' }).click();
  await client.getByRole('dialog').getByRole('button', { name: 'Ta bort' }).click();
  await expect(post).toHaveCount(0);
  await context.close();

  await expect
    .poll(
      async () =>
        (await pushMessages()).some((m) => m.link.includes('/app/projects/lindqvist-kok?post=')),
      {
        timeout: 15_000,
      },
    )
    .toBe(true);

  // Turned off again, so other tests start from a clean slate.
  await notifications.getByRole('button', { name: 'Stäng av' }).click();
  await expect(notifications.getByRole('button', { name: 'Slå på aviseringar' })).toBeVisible();
});
