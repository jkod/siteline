import { expect, type Page } from '@playwright/test';

// The test emulators from firebase.test.json (project demo-siteline-test).
export const PROJECT_ID = 'demo-siteline-test';
const AUTH = 'http://127.0.0.1:9189';
const FIRESTORE = `http://127.0.0.1:8180/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const STORAGE = 'http://127.0.0.1:9289';
// `Bearer owner` bypasses security rules in the emulators.
const OWNER = { Authorization: 'Bearer owner' };

async function poll<T>(
  read: () => Promise<T | undefined>,
  what: string,
  attempts = 40,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** The newest email sign-in link the Auth emulator generated for an address. */
export function latestSignInLink(email: string): Promise<string> {
  return poll(async () => {
    const response = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
    const body = (await response.json()) as {
      oobCodes?: { email: string; oobLink: string; requestType: string }[];
    };
    return (body.oobCodes ?? [])
      .filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN')
      .at(-1)?.oobLink;
  }, `a sign-in link for ${email}`);
}

/** Asks for a sign-in link on the login page and waits until it has been sent. */
export async function requestSignInLink(page: Page, email: string): Promise<string> {
  await page.getByLabel('E-postadress').fill(email);
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click();
  await expect(page.getByRole('heading', { name: 'Kolla din inkorg' })).toBeVisible();
  return latestSignInLink(email);
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.goto(await requestSignInLink(page, email));
}

interface FirestoreDoc {
  name: string;
  fields?: Record<
    string,
    {
      stringValue?: string;
      arrayValue?: {
        values?: { mapValue: { fields: Record<string, { stringValue?: string }> } }[];
      };
    }
  >;
}

async function listDocs(path: string, query = ''): Promise<FirestoreDoc[]> {
  const response = await fetch(`${FIRESTORE}/${path}?pageSize=200${query}`, { headers: OWNER });
  return ((await response.json()) as { documents?: FirestoreDoc[] }).documents ?? [];
}

/** The link in the newest text message to the dev outbox that contains `text`. */
export function linkInTextMessage(text: string): Promise<string> {
  return poll(async () => {
    const docs = await listDocs('devOutbox');
    const message = docs
      .map((d) => d.fields?.['text']?.stringValue ?? '')
      .filter((t) => t.includes(text))
      .at(-1);
    return message?.match(/https?:\/\/\S+\/p\/[\w-]+/)?.[0];
  }, `a text message containing "${text}"`);
}

/** The display photo paths of the post in a project with this text. */
export async function postMedia(projectId: string, text: string): Promise<string[]> {
  const posts = await listDocs(`projects/${projectId}/posts`);
  const post = posts.find((p) => p.fields?.['text']?.stringValue === text);
  return (post?.fields?.['media']?.arrayValue?.values ?? []).map(
    (v) => v.mapValue.fields['path']!.stringValue!,
  );
}

export async function downloadStorageFile(path: string): Promise<Buffer> {
  const bucket = `${PROJECT_ID}.appspot.com`;
  const response = await fetch(
    `${STORAGE}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`,
    { headers: OWNER },
  );
  if (!response.ok) throw new Error(`Storage emulator responded ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
