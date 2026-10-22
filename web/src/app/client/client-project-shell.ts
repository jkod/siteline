import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';

import { useFirestore } from '../core/live';
import { Metrics } from '../core/metrics';
import { ProjectContext } from '../core/project-context';
import { Session } from '../core/session';
import { Brand } from '../shared/ui/brand';
import { HideOnScroll } from '../shared/ui/hide-on-scroll';
import { Icon } from '../shared/ui/icon';
import { InstallHint } from '../shared/ui/install-hint';

const SEEN_HEARTBEAT_MS = 60_000;

/**
 * The branded client view: the firm's name, logo and colour, and tabs for the feed, decisions
 * and the next visit. Siteline's own branding appears only in the footer (PRD F3).
 */
@Component({
  selector: 'sl-client-project-shell',
  imports: [
    Icon,
    TranslatePipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Brand,
    InstallHint,
    HideOnScroll,
  ],
  providers: [ProjectContext],
  templateUrl: './client-project-shell.html',
  styleUrl: './client-project-shell.css',
})
export class ClientProjectShell {
  protected readonly context = inject(ProjectContext);
  private readonly session = inject(Session);
  private readonly firestore = useFirestore();

  readonly projectId = input.required<string>();
  protected readonly project = computed(() => this.context.project());
  /** Service clients get Feed, Visits and Decisions; projects Feed, Decisions and Next visit (PRD F3, F19). */
  protected readonly tabs = computed(() =>
    this.project()?.kind === 'service'
      ? [
          { path: '', label: 'pages.projectFeed', exact: true },
          { path: 'visit', label: 'pages.visits', exact: false },
          { path: 'decisions', label: 'pages.decisions', exact: false },
        ]
      : [
          { path: '', label: 'pages.projectFeed', exact: true },
          { path: 'decisions', label: 'pages.decisions', exact: false },
          { path: 'visit', label: 'pages.visit', exact: false },
        ],
  );

  constructor() {
    effect(() => this.context.projectId.set(this.projectId()));
    // A first-party event per project opened (PRD section 8).
    const metrics = inject(Metrics);
    let tracked: string | null = null;
    effect(() => {
      const project = this.project();
      if (!project || tracked === project.id) return;
      tracked = project.id;
      metrics.track('feed_opened', { projectId: project.id, companyId: project.companyId });
    });
    // Records when the client last had the project open, for the People tab (PRD F2) and "seen
    // by" (F16): on opening, when the tab comes back into view, and each minute while visible.
    effect((onCleanup) => {
      const id = this.projectId();
      const uid = this.session.user()?.uid;
      if (!id || !uid) return;
      const markSeen = () => {
        if (document.visibilityState !== 'visible') return;
        void this.firestore((db, fs) =>
          fs.updateDoc(fs.doc(db, 'projects', id, 'members', uid), {
            lastSeenAt: fs.serverTimestamp(),
          }),
        ).catch(() => undefined);
      };
      markSeen();
      const timer = setInterval(markSeen, SEEN_HEARTBEAT_MS);
      document.addEventListener('visibilitychange', markSeen);
      onCleanup(() => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', markSeen);
      });
    });
  }
}
