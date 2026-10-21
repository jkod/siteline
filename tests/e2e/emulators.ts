import { expect, type Page } from '@playwright/test';

const AUTH = 'http://127.0.0.1:9099';
const PROJECT_ID = 'demo-siteline';

/** The newest email sign-in link the Auth emulator generated for an address. */
export async function latestSignInLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
    const body = (await response.json()) as {
      oobCodes?: { email: string; oobLink: string; requestType: string }[];
    };
    const link = (body.oobCodes ?? [])
      .filter((code) => code.email === email && code.requestType === 'EMAIL_SIGNIN')
      .at(-1)?.oobLink;
    if (link) return link;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in link for ${email}`);
}

/** Asks for a sign-in link on the login page and waits until it has been sent. */
export async function requestSignInLink(page: Page, email: string): Promise<string> {
  await page.getByLabel('E-postadress').fill(email);
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click();
  await expect(page.getByRole('heading', { name: 'Kolla din inkorg' })).toBeVisible();
  return latestSignInLink(email);
}
