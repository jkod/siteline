import { environment } from '../../environments/environment';

// Reads the emulators' REST APIs directly. `Bearer owner` bypasses security rules, which only
// the Firestore emulator accepts, so no rule ever has to open devOutbox.

export interface DevMessage {
  id: string;
  channel: string;
  to: string;
  sender?: string;
  subject?: string;
  text: string;
  createdAt: string;
}

export interface SignInLink {
  email: string;
  link: string;
}

type FirestoreValue = { stringValue?: string; timestampValue?: string };
interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

const projectId = environment.firebase.projectId;

export async function listDevMessages(): Promise<DevMessage[]> {
  const { host, port } = environment.emulatorHosts.firestore;
  const url = `http://${host}:${port}/v1/projects/${projectId}/databases/(default)/documents/devOutbox?pageSize=100&orderBy=createdAt%20desc`;
  const response = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (!response.ok) throw new Error(`Firestore emulator responded ${response.status}`);
  const body = (await response.json()) as { documents?: FirestoreDocument[] };
  return (body.documents ?? []).map((doc) => {
    const field = (key: string) => {
      const value = doc.fields?.[key];
      return value?.stringValue ?? value?.timestampValue;
    };
    return {
      id: doc.name.split('/').pop() ?? '',
      channel: field('channel') ?? '',
      to: field('to') ?? '',
      sender: field('sender'),
      subject: field('subject'),
      text: field('text') ?? field('body') ?? '',
      createdAt: field('createdAt') ?? '',
    };
  });
}

export interface HeldMessage {
  id: string;
  channel: string;
  template: string;
  sendAfter: string;
}

/** Messages the outbox is holding back, such as client texts during quiet hours. */
export async function listHeldMessages(): Promise<HeldMessage[]> {
  const { host, port } = environment.emulatorHosts.firestore;
  const url = `http://${host}:${port}/v1/projects/${projectId}/databases/(default)/documents/outbox?pageSize=200`;
  const response = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (!response.ok) throw new Error(`Firestore emulator responded ${response.status}`);
  const body = (await response.json()) as { documents?: FirestoreDocument[] };
  const now = Date.now();
  return (body.documents ?? [])
    .map((doc) => ({
      id: doc.name.split('/').pop() ?? '',
      channel: doc.fields?.['channel']?.stringValue ?? '',
      template: doc.fields?.['template']?.stringValue ?? '',
      status: doc.fields?.['status']?.stringValue ?? '',
      sendAfter: doc.fields?.['sendAfter']?.timestampValue ?? '',
    }))
    .filter((m) => m.status === 'queued' && Date.parse(m.sendAfter) > now)
    .map(({ status: _status, ...m }) => m);
}

export async function listSignInLinks(): Promise<SignInLink[]> {
  const response = await fetch(
    `${environment.emulatorHosts.auth}/emulator/v1/projects/${projectId}/oobCodes`,
  );
  if (!response.ok) throw new Error(`Auth emulator responded ${response.status}`);
  const body = (await response.json()) as {
    oobCodes?: { email: string; oobLink: string; requestType: string }[];
  };
  return (body.oobCodes ?? [])
    .filter((code) => code.requestType === 'EMAIL_SIGNIN')
    .map((code) => ({ email: code.email, link: code.oobLink }))
    .reverse();
}
