import { computed, effect, inject, Injectable, signal } from '@angular/core';

import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onIdTokenChanged,
  sendSignInLinkToEmail,
  signInWithCustomToken,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  type FeedStyle,
  isStaffRole,
  type Locale,
  type StaffRole,
  type TimestampLike,
  type UserDoc,
} from '@siteline/shared';

import { FirebaseService } from './firebase';
import { liveDoc } from './live';

const EMAIL_FOR_SIGN_IN = 'sl.emailForSignIn';

export interface SessionClaims {
  /** Company ID, set for staff by functions. */
  cid: string | null;
  crole: StaffRole | null;
  /** Set on client accounts created from invite links. */
  isClient: boolean;
  /** A "try Siteline" sandbox account. */
  isDemo: boolean;
}

/**
 * The signed-in person and their claims, as signals. `ready` resolves once Firebase has
 * restored the session, so guards can wait for it.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly firebase = inject(FirebaseService);

  private readonly userState = signal<User | null | undefined>(undefined);
  private readonly claimsState = signal<SessionClaims>(emptyClaims());

  /** `undefined` until the session has been restored. */
  readonly user = this.userState.asReadonly();
  readonly claims = this.claimsState.asReadonly();
  readonly signedIn = computed(() => this.userState() != null);
  readonly isStaff = computed(() => this.claimsState().cid != null);
  readonly isClient = computed(() => this.claimsState().isClient);
  readonly role = computed(() => this.claimsState().crole);
  readonly isDemo = computed(() => this.claimsState().isDemo);

  /** The person's own user document: name and language, kept in Firestore (PRD 8). */
  readonly profile = liveDoc<UserDoc & { claimsUpdatedAt?: TimestampLike }>(() => {
    const user = this.userState();
    return user ? `users/${user.uid}` : null;
  });

  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise((resolve) => {
      onIdTokenChanged(this.firebase.auth, async (user) => {
        await this.sync(user);
        resolve();
      });
    });

    // Functions stamp claimsUpdatedAt after changing someone's role or company, so the new
    // claims apply at once instead of within the hour (PRD F1).
    let lastClaimsUpdate: number | null = null;
    effect(() => {
      const stamp = this.profile()?.claimsUpdatedAt?.toMillis() ?? null;
      if (stamp !== null && lastClaimsUpdate !== null && stamp !== lastClaimsUpdate) {
        void this.refreshClaims();
      }
      if (stamp !== null) lastClaimsUpdate = stamp;
    });
  }

  /** The person's feed order: newest first (social feed) or newest at the bottom (chat). */
  readonly feedStyle = computed<FeedStyle>(() => this.profile()?.feedStyle ?? 'feed');

  /** Saves the app language on the person's profile, so messages to them use it too. */
  async setLocale(locale: Locale): Promise<void> {
    const uid = this.userState()?.uid;
    if (!uid || !this.profile()) return;
    const [db, fs] = await Promise.all([this.firebase.firestore(), import('firebase/firestore')]);
    await fs.updateDoc(fs.doc(db, 'users', uid), { locale, updatedAt: fs.serverTimestamp() });
  }

  /** Saves the feed order on the person's profile, so it follows them across devices. */
  async setFeedStyle(style: FeedStyle): Promise<void> {
    const uid = this.userState()?.uid;
    if (!uid) return;
    const [db, fs] = await Promise.all([this.firebase.firestore(), import('firebase/firestore')]);
    await fs.updateDoc(fs.doc(db, 'users', uid), {
      feedStyle: style,
      updatedAt: fs.serverTimestamp(),
    });
  }

  /** Signs in with a custom token: a client's link (PRD 4.1) or a "try Siteline" sandbox. */
  async signInWithClientToken(token: string): Promise<void> {
    const { user } = await signInWithCustomToken(this.firebase.auth, token);
    await this.sync(user);
  }

  async sendEmailLink(email: string, finishUrl: string): Promise<void> {
    await sendSignInLinkToEmail(this.firebase.auth, email, {
      url: finishUrl,
      handleCodeInApp: true,
    });
    try {
      localStorage.setItem(EMAIL_FOR_SIGN_IN, email);
    } catch {
      // Without storage, the finish page asks for the email again.
    }
  }

  isEmailLink(url: string): boolean {
    return isSignInWithEmailLink(this.firebase.auth, url);
  }

  /** The email the link was sent to from this browser, if known. */
  storedEmail(): string | null {
    try {
      return localStorage.getItem(EMAIL_FOR_SIGN_IN);
    } catch {
      return null;
    }
  }

  async completeEmailLink(email: string, url: string): Promise<void> {
    const { user } = await signInWithEmailLink(this.firebase.auth, email, url);
    await this.sync(user);
    try {
      localStorage.removeItem(EMAIL_FOR_SIGN_IN);
    } catch {
      // Nothing to clean up.
    }
  }

  async signInWithGoogle(): Promise<void> {
    const { user } = await signInWithPopup(this.firebase.auth, new GoogleAuthProvider());
    await this.sync(user);
  }

  /** Fetches a fresh ID token, for example after a function changed the claims (PRD F1). */
  async refreshClaims(): Promise<void> {
    const user = this.firebase.auth.currentUser;
    if (!user) return;
    await user.getIdToken(true);
    await this.sync(user);
  }

  signOut(): Promise<void> {
    return signOut(this.firebase.auth);
  }

  /**
   * Updates the signals from a user. Sign-in methods call it before returning, so the claims
   * are current when the caller navigates; the token listener calls it for every other change.
   */
  private async sync(user: User | null): Promise<void> {
    this.claimsState.set(user ? await readClaims(user) : emptyClaims());
    this.userState.set(user);
  }
}

function emptyClaims(): SessionClaims {
  return { cid: null, crole: null, isClient: false, isDemo: false };
}

async function readClaims(user: User): Promise<SessionClaims> {
  const { claims } = await user.getIdTokenResult();
  const role = claims['crole'];
  return {
    cid: typeof claims['cid'] === 'string' ? claims['cid'] : null,
    crole: isStaffRole(role) ? role : null,
    isClient: claims['kind'] === 'client',
    isDemo: claims['demo'] === true,
  };
}
