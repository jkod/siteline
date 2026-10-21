import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Api } from '../core/api';
import { errorMessageKey, errorReason } from '../core/errors';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Field, Input } from '../shared/ui/field';
import { Toasts } from '../shared/ui/toast';
import { CurrentCompany } from './current-company';
import { usePlanLimitDialog } from './plan-limit';

/** Title, address, dates and crew; the server enforces the plan limit (PRD F2). */
@Component({
  selector: 'sl-new-project',
  imports: [TranslatePipe, FormField, RouterLink, Button, Card, Field, Input],
  templateUrl: './new-project.html',
  styles: `
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--sl-space-3);
    }
    .crew {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-1);
      margin: 0;
      padding: 0;
      border: 0;
    }
    .crew legend {
      margin-bottom: var(--sl-space-2);
      font: 600 15px/20px var(--sl-font-body);
    }
    .crew label {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      min-height: var(--sl-target);
    }
    .crew input {
      width: 20px;
      height: 20px;
      accent-color: var(--sl-accent);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-space-3);
    }
  `,
})
export class NewProject {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly planLimit = usePlanLimitDialog();
  protected readonly company = inject(CurrentCompany);

  protected readonly crewOptions = computed(() =>
    (this.company.staff() ?? []).filter((s) => s.role === 'crew'),
  );
  protected readonly crew = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly model = signal({
    title: '',
    street: '',
    postalCode: '',
    city: '',
    startDate: '',
    endDate: '',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.title);
    maxLength(path.title, 120);
  });

  protected toggleCrew(uid: string, on: boolean): void {
    this.crew.update((list) => (on ? [...list, uid] : list.filter((u) => u !== uid)));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      const m = this.model();
      this.saving.set(true);
      try {
        const hasAddress = m.street || m.postalCode || m.city;
        const { projectId } = await this.api.createProject({
          kind: 'project',
          title: m.title.trim(),
          address: hasAddress ? { street: m.street, postalCode: m.postalCode, city: m.city } : null,
          startDate: m.startDate || null,
          endDate: m.endDate || null,
          crewUids: this.crew(),
        });
        await this.router.navigate(['/app/projects', projectId, 'people'], {
          queryParams: { invite: 1 },
        });
      } catch (error) {
        if (errorReason(error) === 'plan_limit') {
          await this.planLimit();
        } else {
          const key = errorMessageKey(error);
          if (key) this.toasts.show(this.translate.instant(key), 'error');
        }
      } finally {
        this.saving.set(false);
      }
      return undefined;
    });
  }
}
