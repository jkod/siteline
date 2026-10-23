import { Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DEFAULT_TEMPLATES,
  describeSchedule,
  type ReportTemplate,
  stockholmDate,
  stockholmDayRange,
  type Trade,
  type Visit,
  type VisitRequest,
} from '@siteline/shared';

import { Api } from '../../core/api';
import { errorMessageKey } from '../../core/errors';
import { Language } from '../../core/language';
import { liveDoc, liveQuery, useFirestore, type WithId } from '../../core/live';
import { ProjectContext } from '../../core/project-context';
import { DatePipe, formatDate } from '../../shared/pipes/date';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Dialogs } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Toasts } from '../../shared/ui/toast';
import { Checklist } from '../../shared/visits/checklist';
import { ReportDialog, type ReportDialogData } from '../../shared/visits/report-dialog';
import { VisitEditor, type VisitEditorData } from '../../shared/visits/visit-editor';
import {
  VisitRequestDialog,
  type VisitRequestDialogData,
} from '../../shared/visits/visit-request-dialog';
import { VisitSummary } from '../../shared/visits/visit-summary';

/**
 * The next visit and its checklist, requests from the client, and visit history (PRD F7). For
 * service clients: the schedule, upcoming visits with Report buttons, and photo consent (F19).
 */
@Component({
  selector: 'sl-project-visits',
  imports: [Icon, TranslatePipe, DatePipe, Button, Card, EmptyState, Checklist, VisitSummary],
  templateUrl: './project-visits.html',
  styleUrl: './project-visits.css',
})
export class ProjectVisits {
  protected readonly context = inject(ProjectContext);
  private readonly api = inject(Api);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(Language);
  private readonly router = inject(Router);
  private readonly firestore = useFirestore();

  /** ?report=visitId opens the report dialog, from the staff home's today strip. */
  readonly report = input<string>();

  protected readonly project = computed(() => this.context.project());
  protected readonly isService = computed(() => this.project()?.kind === 'service');
  private readonly projectId = computed(() => this.context.projectId());

  protected readonly next = liveDoc<Visit>(() => {
    const p = this.project();
    return p?.nextVisitId ? `projects/${p.id}/visits/${p.nextVisitId}` : null;
  });
  protected readonly visits = liveQuery<Visit>(
    (db, fs) =>
      this.projectId()
        ? fs.query(
            fs.collection(db, 'projects', this.projectId()!, 'visits'),
            fs.orderBy('startAt'),
          )
        : null,
    () => this.projectId(),
  );
  protected readonly requests = liveQuery<VisitRequest>(
    (db, fs) =>
      this.projectId()
        ? fs.query(
            fs.collection(db, 'projects', this.projectId()!, 'visitRequests'),
            fs.where('status', '==', 'open'),
          )
        : null,
    () => this.projectId(),
  );
  private readonly storedTemplate = liveDoc<ReportTemplate>(() => {
    const p = this.project();
    return p?.kind === 'service'
      ? `companies/${p.companyId}/templates/${p.templateId ?? 'other'}`
      : null;
  });
  protected readonly template = computed<ReportTemplate>(() => {
    const trade = (this.project()?.templateId ?? 'other') as Trade;
    return this.storedTemplate() ?? DEFAULT_TEMPLATES[trade] ?? DEFAULT_TEMPLATES.other;
  });

  private readonly todayStart = stockholmDayRange(stockholmDate(new Date())).start.getTime();
  private readonly todayEnd = stockholmDayRange(stockholmDate(new Date())).end.getTime();
  protected readonly upcoming = computed(() =>
    (this.visits() ?? []).filter(
      (v) => v.status === 'planned' && v.startAt.toMillis() >= this.todayStart,
    ),
  );
  /** Past visits without a report stay listed until reported or cancelled (PRD F19). */
  protected readonly unreported = computed(() =>
    (this.visits() ?? []).filter(
      (v) => v.status === 'planned' && v.startAt.toMillis() < this.todayStart,
    ),
  );
  protected readonly history = computed(() =>
    (this.visits() ?? [])
      .filter((v) => v.status !== 'planned')
      .reverse()
      .slice(0, 20),
  );
  protected readonly schedule = computed(() => {
    const s = this.project()?.schedule;
    if (!s) return null;
    const d = describeSchedule(s);
    return {
      interval: d.interval,
      days: d.weekdays.map((w) => this.translate.instant(`weekdays.${w}`)).join(', '),
      time: d.time,
      minutes: s.durationMinutes,
    };
  });
  protected readonly isTutoring = computed(() => this.project()?.templateId === 'tutoring');

  constructor() {
    let opened = false;
    effect(() => {
      const id = this.report();
      const visit = (this.visits() ?? []).find((v) => v.id === id);
      if (!id || !visit || opened || !this.project()) return;
      opened = true;
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.openReport(visit);
    });
  }

  protected canReport(visit: WithId<Visit>): boolean {
    return (
      visit.status === 'planned' && !visit.reportPostId && visit.startAt.toMillis() < this.todayEnd
    );
  }

  protected edit(visit?: WithId<Visit>): void {
    const p = this.project();
    if (!p) return;
    this.dialogs.open<void, VisitEditorData, VisitEditor>(
      VisitEditor,
      {
        projectId: p.id,
        companyId: p.companyId,
        visit,
      },
      { wide: true },
    );
  }

  protected openReport(visit: WithId<Visit>): void {
    const p = this.project();
    if (!p) return;
    this.dialogs.open<string, ReportDialogData, ReportDialog>(
      ReportDialog,
      {
        projectId: p.id,
        visitId: visit.id,
        when: formatDate(visit.startAt, 'visit', this.language.lang()),
        template: this.template(),
        photosAllowed: !this.isTutoring() || !!p.photoConsentAt,
      },
      { wide: true },
    );
  }

  protected async markDone(visit: WithId<Visit>): Promise<void> {
    await this.setStatus(visit, 'done', 'visits.markedDone');
  }

  protected async cancel(visit: WithId<Visit>): Promise<void> {
    const t = (key: string) => this.translate.instant(key) as string;
    const ok = await this.dialogs.confirm({
      title: t('visits.cancelTitle'),
      message: t('visits.cancelBody'),
      confirmLabel: t('visits.cancelConfirm'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (ok) await this.setStatus(visit, 'cancelled', 'visits.cancelled');
  }

  protected async answer(request: WithId<VisitRequest>, accept: boolean): Promise<void> {
    await this.run(
      () =>
        this.api.respondVisitChange({
          projectId: this.projectId()!,
          requestId: request.id,
          accept,
        }),
      accept ? 'visits.requestAccepted' : 'visits.requestDeclined',
    );
  }

  protected suggest(request: WithId<VisitRequest>): void {
    const visit = (this.visits() ?? []).find((v) => v.id === request.visitId);
    this.dialogs.open<void, VisitRequestDialogData, VisitRequestDialog>(
      VisitRequestDialog,
      {
        projectId: this.projectId()!,
        visitId: request.visitId,
        requestId: request.id,
        when: visit ? formatDate(visit.startAt, 'visit', this.language.lang()) : '',
        mode: 'suggest',
      },
      { wide: true },
    );
  }

  protected visitFor(request: WithId<VisitRequest>): WithId<Visit> | undefined {
    return (this.visits() ?? []).find((v) => v.id === request.visitId);
  }

  protected async setConsent(consent: boolean): Promise<void> {
    await this.run(
      () => this.api.setPhotoConsent(this.projectId()!, consent),
      consent ? 'visits.consentRecorded' : 'visits.consentWithdrawn',
    );
  }

  private async setStatus(
    visit: WithId<Visit>,
    status: 'done' | 'cancelled',
    doneKey: string,
  ): Promise<void> {
    await this.run(
      () =>
        this.firestore((db, fs) =>
          fs.updateDoc(fs.doc(db, 'projects', this.projectId()!, 'visits', visit.id), {
            status,
            updatedAt: fs.serverTimestamp(),
          }),
        ),
      doneKey,
    );
  }

  private async run(action: () => Promise<unknown>, doneKey: string): Promise<void> {
    try {
      await action();
      this.toasts.show(this.translate.instant(doneKey), 'success');
    } catch (error) {
      const key = errorMessageKey(error);
      if (key) this.toasts.show(this.translate.instant(key), 'error');
    }
  }
}
