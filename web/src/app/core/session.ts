import { computed, inject, Injectable, signal } from '@angular/core';

import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onIdTokenChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { isStaffRole, type StaffRole } from '@siteline/shared';

import { FirebaseService } from './firebase';

const EMAIL_FOR_SIGN_IN = 'sl.emailForSignIn';

export interface SessionClaims {
  /** Company ID, set for staff by functions. */
  cid: string | null;
  crole: StaffRole | null;
  /** Set on client accounts created from invite links. */
  isClient: boolean;
}

/**
 * The signed-in person and their claims, as signals. `ready` resolves once Firebase has
 * restored the session, so guards can wait for it.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly firebase = inject(FirebaseService);

  private readonly userState = signal<User | null | undefined>(undefined);
  private readonly claimsState = signal<SessionClaims>({ cid: null, crole: null, isClient: false });

  /** `undefined` until the session has been restored. */
  readonly user = this.userState.asReadonly();
  readonly claims = this.claimsState.asReadonly();
  readonly signedIn = computed(() => this.userState() != null);
  readonly isStaff = computed(() => this.claimsState().cid != null);
  readonly isClient = computed(() => this.claimsState().isClient);
  readonly role = computed(() => this.claimsState().crole);

  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise((resolve) => {
      onIdTokenChanged(this.firebase.auth, async (user) => {
        await this.sync(user);
        resolve();
      });
    });
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
  return { cid: null, crole: null, isClient: false };
}

async function readClaims(user: User): Promise<SessionClaims> {
  const { claims } = await user.getIdTokenResult();
  const role = claims['crole'];
  return {
    cid: typeof claims['cid'] === 'string' ? claims['cid'] : null,
    crole: isStaffRole(role) ? role : null,
    isClient: claims['kind'] === 'client',
  };
}
