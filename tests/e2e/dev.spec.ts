import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';

test('the dev outbox shows the seeded invite text', async ({ page }) => {
  await page.goto('/dev/outbox');
  await expect(page.getByText(/Hej Anna! Ek & Lind Snickeri delar uppdateringar/)).toBeVisible();
});

test.describe('component gallery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/ui');
    await expect(page.getByRole('heading', { level: 1, name: 'Komponenter' })).toBeVisible();
  });

  test('passes axe', async ({ page }) => {
    await expectNoAxeViolations(page);
  });

  test('formats money in Swedish and English', async ({ page }) => {
    await expect(page.getByText(/Pris: 6\s500\skr/)).toBeVisible();
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByText(/Price: SEK\s6,500/)).toBeVisible();
  });

  test('tabs follow the ARIA pattern and arrow keys', async ({ page }) => {
    const feed = page.getByRole('tab', { name: 'Flöde' });
    await expect(feed).toHaveAttribute('aria-selected', 'true');
    await feed.focus();
    await page.keyboard.press('ArrowRight');
    const decisions = page.getByRole('tab', { name: 'Beslut' });
    await expect(decisions).toBeFocused();
    await expect(decisions).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('Inget att besluta just nu.');
  });

  test('the dialog traps focus, closes on Escape and returns focus', async ({ page }) => {
    const opener = page.getByRole('button', { name: 'Öppna dialog' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Dra tillbaka beslutet?' });
    await expect(dialog).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.getByText('Du avbröt.')).toBeVisible();
  });

  test('error toasts are announced and stay until dismissed', async ({ page }) => {
    await page.getByRole('button', { name: 'Visa fel' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Något gick fel' });
    await expect(alert).toBeVisible();
    await alert.getByRole('button', { name: 'Stäng' }).click();
    await expect(alert).toHaveCount(0);
  });
});
