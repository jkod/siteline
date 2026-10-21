import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './a11y';
import { downloadStorageFile, linkInTextMessage, postMedia, signIn } from './emulators';
import { hasExif, jpegSize, withGpsExif } from './jpeg';

// M1 is done when: staff create a project and invite a client; the client opens the link from
// the dev outbox and asks a question; staff answer it (PRD section 14).
test('staff create a project and invite a client, who asks a question that staff answer', async ({
  page,
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now() % 100000}`;
  const projectTitle = `Badrum Ström ${suffix}`;
  const clientName = `Bo Ström ${suffix}`;

  // Staff: create the project; the invite dialog opens straight after.
  await signIn(page, 'erik@eklind.example');
  await page.getByRole('link', { name: 'Nytt projekt' }).click();
  await page.getByLabel('Projektnamn').fill(projectTitle);
  await page.getByLabel('Adress').fill('Hallvägen 2');
  await page.getByRole('button', { name: 'Skapa projekt' }).click();
  await expect(page).toHaveURL(/\/app\/projects\/[\w-]+\/people$/);
  const projectId = page.url().split('/projects/')[1]!.split('/')[0]!;

  const dialog = page.getByRole('dialog', { name: 'Bjud in en kund' });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await dialog.getByLabel('Namn').fill(clientName);
  await dialog.getByLabel('Mobilnummer').fill('070-174 06 40');
  await dialog.getByRole('button', { name: 'Skicka inbjudan' }).click();
  await expect(page.getByText(`Inbjudan till ${clientName} är skickad.`)).toBeVisible();
  await expect(page.getByText(/Inbjuden .*har inte öppnat än/)).toBeVisible();

  // Client: open the link from the dev outbox, with no account and nothing to install.
  const link = await linkInTextMessage(`uppdateringar om ${projectTitle} här:`);
  const clientContext = await browser.newContext({
    ...testInfo.project.use,
    reducedMotion: 'reduce',
  });
  const client = await clientContext.newPage();
  await client.goto(link);
  await expect(client).toHaveURL(new RegExp(`/c/${projectId}$`));
  await expect(client.getByRole('heading', { level: 1, name: projectTitle })).toBeVisible();
  await expect(client.getByText('Ek & Lind Snickeri').first()).toBeVisible();
  await expectNoAxeViolations(client);

  // The client asks a question; staff see it in real time with an unanswered badge.
  await client.getByLabel('Ställ en fråga').fill('När kommer kaklet?');
  await client.getByRole('button', { name: 'Skicka fråga' }).click();
  await expect(client.getByText('När kommer kaklet?')).toBeVisible();

  await page.goto(`/app/projects/${projectId}`);
  const question = page.locator('sl-post-card').filter({ hasText: 'När kommer kaklet?' });
  await expect(question.getByText('Obesvarad')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('1 obesvarad fråga').first()).toBeVisible();

  // Staff answer in the comments; the badge clears and the client sees the reply live.
  await question.getByRole('button', { name: 'Kommentera' }).click();
  await question.getByLabel('Skriv en kommentar').fill('Kaklet kommer på onsdag.');
  await question.getByRole('button', { name: 'Skicka' }).click();
  await expect(question.getByText('Obesvarad')).toHaveCount(0, { timeout: 5000 });

  const clientQuestion = client.locator('sl-post-card').filter({ hasText: 'När kommer kaklet?' });
  await expect(clientQuestion.getByRole('button', { name: '1 kommentar' })).toBeVisible({
    timeout: 5000,
  });
  await clientQuestion.getByRole('button', { name: '1 kommentar' }).click();
  await expect(clientQuestion.getByText('Kaklet kommer på onsdag.')).toBeVisible();

  // The People tab shows that the client has opened the project.
  await page.goto(`/app/projects/${projectId}/people`);
  await expect(page.getByText(/Öppnade senast/)).toBeVisible();
  await clientContext.close();
});

test('a photo update is resized, stripped of GPS and shows for staff and clients', async ({
  page,
}) => {
  // A 3000 px photo with GPS data in its Exif.
  const photoPage = await page.context().newPage();
  await photoPage.setViewportSize({ width: 3000, height: 2000 });
  await photoPage.setContent(
    '<body style="margin:0;background:linear-gradient(90deg,#9b7b5a,#127a69)"></body>',
  );
  const fixture = withGpsExif(
    await photoPage.screenshot({ type: 'jpeg', quality: 80, scale: 'css' }),
  );
  await photoPage.close();
  expect(hasExif(fixture)).toBe(true);
  expect(jpegSize(fixture).width).toBe(3000);

  await signIn(page, 'erik@eklind.example');
  await page.goto('/app/projects/lindqvist-kok');
  await page.getByLabel('Skriv en uppdatering').fill('Golvet är spacklat.');
  await page
    .locator('sl-composer input[type=file]')
    .setInputFiles({ name: 'golv.jpg', mimeType: 'image/jpeg', buffer: fixture });
  await page.getByRole('button', { name: 'Publicera' }).click();
  const post = page.locator('sl-post-card').filter({ hasText: 'Golvet är spacklat.' });
  await expect(post.getByRole('button', { name: /Öppna foto 1 av 1/ })).toBeVisible({
    timeout: 15_000,
  });

  const [path] = await postMedia('lindqvist-kok', 'Golvet är spacklat.');
  const stored = await downloadStorageFile(path!);
  expect(hasExif(stored)).toBe(false);
  const size = jpegSize(stored);
  expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(2560);
  const thumb = await downloadStorageFile(path!.replace('display.jpg', 'thumb.jpg'));
  expect(Math.max(jpegSize(thumb).width, jpegSize(thumb).height)).toBeLessThanOrEqual(640);

  // The full-screen viewer opens and closes with Escape.
  await post.getByRole('button', { name: /Öppna foto 1 av 1/ }).click();
  await expect(page.getByRole('dialog', { name: 'Foton' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Foton' })).toHaveCount(0);
});

test('onboarding: a new person sets up a company and a first project', async ({ page }) => {
  const email = `lisa-${Date.now()}@example.com`;
  await signIn(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Ditt företag' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByLabel('Företagsnamn').fill('Ström Måleri');
  await page.getByLabel('Ditt namn').fill('Lisa Ström');
  await page.getByLabel('Organisationsnummer').fill('556016-0681');
  await page.getByRole('button', { name: 'Fortsätt' }).click();
  await expect(page.getByText('Organisationsnumret stämmer inte.')).toBeVisible();
  await page.getByLabel('Organisationsnummer').fill('556016-0680');
  await page.getByRole('button', { name: 'Fortsätt' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Ditt första projekt' })).toBeVisible();
  await page.getByLabel('Projektnamn').fill('Målning Hallvägen');
  await page.getByRole('button', { name: 'Fortsätt' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bjud in din kund' })).toBeVisible();
  await page.getByRole('button', { name: 'Hoppa över så länge' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Målning Hallvägen' })).toBeVisible();
  await expect(page.getByText('Publicera din första uppdatering')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ström Måleri' })).toBeVisible();
});

test('the server blocks a project beyond the plan limit and the app offers an upgrade', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Uses the shared seed company once');
  // Berg Mattehjälp is on the Visits plan: one active project.
  await signIn(page, 'karin@bergmatte.example');
  await page.goto('/app/projects/new');
  await page.getByLabel('Projektnamn').fill('Läxhjälp Berg');
  await page.getByRole('button', { name: 'Skapa projekt' }).click();
  await expect(page).toHaveURL(/\/people$/);
  await page.goto('/app/projects/new');
  await page.getByLabel('Projektnamn').fill('Läxhjälp Berg 2');
  await page.getByRole('button', { name: 'Skapa projekt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ditt abonnemang är fullt' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Se abonnemang' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/billing$/);
  await expect(page.getByText('1 av 1 aktiva projekt')).toBeVisible();
});

test("a client's home shows every firm they use", async ({ page }) => {
  const link = await linkInTextMessage('Hej Anna! Ek & Lind Snickeri');
  await page.goto(link);
  await expect(page).toHaveURL(/\/c\/lindqvist-kok$/);
  await expect(page.getByText('Skåpstommarna är på plats.')).toBeVisible();
  await page.getByRole('link', { name: 'Alla projekt' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hej Anna!' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Köksrenovering Lindqvist/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Matte med Elsa/ })).toBeVisible();
  await expectNoAxeViolations(page);
});

test('an unknown link offers to request a new one', async ({ page }) => {
  await page.goto(`/p/${'x'.repeat(43)}`);
  await expect(page).toHaveURL(/\/link-expired$/);
  await page.getByRole('button', { name: 'Be om en ny länk' }).click();
  await expect(page.getByText('Vi har bett företaget skicka en ny länk till dig.')).toBeVisible();
});
