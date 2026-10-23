import { inject, Injectable, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { FirebaseService } from './firebase';
import { Session } from './session';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on' | 'busy';

/**
 * Browser notifications through Firebase Cloud Messaging (PRD section 7). Each browser that
 * turns them on is a device under users/{uid}/devices. In the emulators, where Cloud Messaging
 * isn't available, a stand-in device is registered and pushes appear in /dev/outbox.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(Session);

  readonly state = signal<PushState>(this.supported() ? 'off' : 'unsupported');

  /** iPhones only allow notifications once the app is on the home screen. */
  readonly needsInstall = /iphone|ipad/i.test(navigator.userAgent) && !('PushManager' in window);

  private supported(): boolean {
    if (environment.emulators) return true;
    return (
      !!environment.vapidKey &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  private key(): string | null {
    const uid = this.session.user()?.uid;
    return uid ? `sl.pushDevice.${uid}` : null;
  }

  private deviceId(): string | null {
    const key = this.key();
    try {
      return key ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  /** Reads whether this browser is registered for the signed-in person. */
  async refresh(): Promise<void> {
    if (this.state() === 'unsupported') return;
    if (!environment.emulators && Notification.permission === 'denied') {
      this.state.set('denied');
      return;
    }
    const uid = this.session.user()?.uid;
    const id = this.deviceId();
    if (!uid || !id) {
      this.state.set('off');
      return;
    }
    const [db, fs] = await Promise.all([this.firebase.firestore(), import('firebase/firestore')]);
    const device = await fs.getDoc(fs.doc(db, 'users', uid, 'devices', id));
    this.state.set(device.exists() ? 'on' : 'off');
  }

  async enable(): Promise<void> {
    const uid = this.session.user()?.uid;
    const key = this.key();
    if (!uid || !key) return;
    this.state.set('busy');
    try {
      let token: string;
      const id = this.deviceId() ?? crypto.randomUUID().replace(/-/g, '');
      if (environment.emulators) {
        token = `dev-${id}`;
      } else {
        if ((await Notification.requestPermission()) !== 'granted') {
          this.state.set(Notification.permission === 'denied' ? 'denied' : 'off');
          return;
        }
        const registration = await navigator.serviceWorker.register('/push-sw.js', {
          scope: '/push/',
        });
        const { getMessaging, getToken } = await import('firebase/messaging');
        token = await getToken(getMessaging(this.firebase.app), {
          vapidKey: environment.vapidKey,
          serviceWorkerRegistration: registration,
        });
      }
      const [db, fs] = await Promise.all([this.firebase.firestore(), import('firebase/firestore')]);
      await fs.setDoc(fs.doc(db, 'users', uid, 'devices', id), {
        fcmToken: token,
        platform: platform(),
        lastSeenAt: fs.serverTimestamp(),
      });
      try {
        localStorage.setItem(key, id);
      } catch {
        // The device still works; this browser just won't remember it's on.
      }
      this.state.set('on');
    } catch (error) {
      this.state.set('off');
      throw error;
    }
  }

  async disable(): Promise<void> {
    const uid = this.session.user()?.uid;
    const id = this.deviceId();
    if (!uid || !id) return;
    this.state.set('busy');
    try {
      if (!environment.emulators) {
        const { deleteToken, getMessaging } = await import('firebase/messaging');
        await deleteToken(getMessaging(this.firebase.app)).catch(() => undefined);
      }
      const [db, fs] = await Promise.all([this.firebase.firestore(), import('firebase/firestore')]);
      await fs.deleteDoc(fs.doc(db, 'users', uid, 'devices', id));
      try {
        localStorage.removeItem(this.key()!);
      } catch {
        // See enable().
      }
    } finally {
      this.state.set('off');
    }
  }
}

function platform(): string {
  const ua = navigator.userAgent;
  if (/iphone|ipad/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'web';
}
