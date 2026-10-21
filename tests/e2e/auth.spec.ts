import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { requestSignInLink } from './emulators';

test.describe('sign-in', () => {
  test('the login page is in Swedish by default, accessible, and switches to English', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Logga in' })).toBeVisible();
    await expect(page).toHaveTitle('Logga in · Siteline');
    await expect(page.locator('html')).toHaveAttribute('lang', 'sv');
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveTitle('Sign in · Siteline');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('shows a validation error for an invalid email', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-postadress').fill('inte-en-adress');
    await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click();
    await expect(page.getByText('Skriv en giltig e-postadress.')).toBeVisible();
    await expect(page.getByLabel('E-postadress')).toHaveAttribute('aria-invalid', 'true');
  });

  test('a seeded owner signs in with an email link and lands in the staff app', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.goto(await requestSignInLink(page, 'erik@eklind.example'));
    await expect(page).toHaveURL(/\/app$/);
    // The company name comes from Firestore, under the staff rules.
    await expect(page.getByRole('link', { name: 'Ek & Lind Snickeri' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Företag' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Logga ut' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('crew do not see the company settings link and are sent back from manager pages', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.goto(await requestSignInLink(page, 'omar@eklind.example'));
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('link', { name: 'Företag' })).toHaveCount(0);

    await page.goto('/app/settings/company');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('a new person lands in onboarding', async ({ page }) => {
    const email = `ny-${Date.now()}@example.com`;
    await page.goto('/login');
    await page.goto(await requestSignInLink(page, email));
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText(`Inloggad som ${email}`)).toBeVisible();
  });

  test('a link opened in another browser asks for the email first', async ({ page, browser }) => {
    const email = `annan-${Date.now()}@example.com`;
    await page.goto('/login');
    const link = await requestSignInLink(page, email);

    const other = await browser.newPage();
    await other.goto(link);
    await expect(other.getByRole('heading', { name: 'Bekräfta din e-postadress' })).toBeVisible();
    await other.getByLabel('E-postadress').fill(email);
    await other.getByRole('button', { name: 'Logga in' }).click();
    await expect(other).toHaveURL(/\/onboarding$/);
    await other.close();
  });

  test('the return URL survives the email link', async ({ page }) => {
    const email = 'karin@bergmatte.example';
    await page.goto('/app/settings/me');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fapp%2Fsettings%2Fme$/);
    await page.goto(await requestSignInLink(page, email));
    await expect(page).toHaveURL(/\/app\/settings\/me$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mitt konto' })).toBeVisible();
  });
});

test.describe('guards', () => {
  test('the root sends signed-out people to the login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the client view without a session shows the link page', async ({ page }) => {
    await page.goto('/c');
    await expect(page).toHaveURL(/\/link-expired$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Länken fungerar inte längre');
  });
});
