import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { LucideChevronLeft } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';

import { useFirestore } from '../core/live';
import { ProjectContext } from '../core/project-context';
import { Session } from '../core/session';
import { Brand } from '../shared/ui/brand';
import { InstallHint } from '../shared/ui/install-hint';

/**
 * The branded client view: the firm's name, logo and colour, and tabs for the feed, decisions
 * and the next visit. Siteline's own branding appears only in the footer (PRD F3).
 */
@Component({
  selector: 'sl-client-project-shell',
  imports: [
    TranslatePipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Brand,
    LucideChevronLeft,
    InstallHint,
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
  protected readonly tabs = [
    { path: '', label: 'pages.projectFeed', exact: true },
    { path: 'decisions', label: 'pages.decisions', exact: false },
    { path: 'visit', label: 'pages.visit', exact: false },
  ];

  constructor() {
    effect(() => this.context.projectId.set(this.projectId()));
    // Records when the client last opened the feed, for the People tab (PRD F2).
    effect(() => {
      const id = this.projectId();
      const uid = this.session.user()?.uid;
      if (!id || !uid) return;
      void this.firestore((db, fs) =>
        fs.updateDoc(fs.doc(db, 'projects', id, 'members', uid), {
          lastSeenAt: fs.serverTimestamp(),
        }),
      ).catch(() => undefined);
    });
  }
}
