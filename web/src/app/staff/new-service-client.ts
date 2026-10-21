import { Component, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  max,
  maxLength,
  min,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { normalizePhone, stockholmDate, type Trade, type Weekday3 } from '@siteline/shared';

import { Api } from '../core/api';
import { errorMessageKey, errorReason } from '../core/errors';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Field, Input } from '../shared/ui/field';
import { Toasts } from '../shared/ui/toast';
import { usePlanLimitDialog } from './plan-limit';

const WEEKDAYS: Weekday3[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/**
 * Adds a service client (PRD 4.4): the client, what the service covers, a schedule and a report
 * template. Visits for eight weeks and the client's link follow automatically.
 */
@Component({
  selector: 'sl-new-service-client',
  imports: [TranslatePipe, FormField, RouterLink, Button, Card, Field, Input],
  templateUrl: './new-service-client.html',
  styles: `
    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--sl-space-3);
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: var(--sl-space-2);
      font: 600 15px/20px var(--sl-font-body);
    }
    .days,
    .segments {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-space-2);
    }
    .days button,
    .segments button {
      min-width: var(--sl-target);
      min-height: var(--sl-target);
      padding: 0 var(--sl-space-3);
      border: 1.5px solid var(--sl-border-control);
      border-radius: var(--sl-radius-pill);
      background: var(--sl-surface);
      color: var(--sl-text);
      font: 600 14px/18px var(--sl-font-body);
      cursor: pointer;
    }
    .days button[aria-pressed='true'],
    .segments button[aria-pressed='true'] {
      background: var(--sl-accent);
      border-color: var(--sl-accent);
      color: var(--sl-on-accent);
    }
    .error {
      margin-top: var(--sl-space-2);
      font: 600 13px/18px var(--sl-font-body);
      color: var(--sl-alert-text);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-space-3);
    }
  `,
})
export class NewServiceClient {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);
  private readonly planLimit = usePlanLimitDialog();

  protected readonly weekdays = WEEKDAYS;
  protected readonly trades: Trade[] = ['tutoring', 'gardening', 'other'];
  protected readonly trade = signal<Trade>('tutoring');
  protected readonly interval = signal<1 | 2>(1);
  protected readonly days = signal<Weekday3[]>([]);
  protected readonly daysError = signal(false);
  protected readonly saving = signal(false);
  protected readonly model = signal({
    title: '',
    clientName: '',
    clientPhone: '',
    street: '',
    city: '',
    startDate: stockholmDate(new Date()),
    time: '15:00',
    duration: 60,
  });
  protected readonly form = form(this.model, (path) => {
    required(path.title);
    maxLength(path.title, 120);
    required(path.clientName);
    required(path.clientPhone);
    validate(path.clientPhone, ({ value }) =>
      value() && !normalizePhone(value()) ? { kind: 'phone' } : null,
    );
    required(path.startDate);
    required(path.time);
    min(path.duration, 15);
    max(path.duration, 600);
  });

  protected toggleDay(day: Weekday3): void {
    this.days.update((list) =>
      list.includes(day) ? list.filter((d) => d !== day) : [...list, day],
    );
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.daysError.set(this.days().length === 0);
    await submit(this.form, async () => {
      if (this.days().length === 0) return undefined;
      const m = this.model();
      this.saving.set(true);
      try {
        const hasAddress = m.street || m.city;
        const { projectId } = await this.api.createServiceClient({
          title: m.title,
          clientName: m.clientName,
          clientPhone: m.clientPhone,
          address: hasAddress ? { street: m.street, postalCode: '', city: m.city } : null,
          trade: this.trade(),
          schedule: {
            interval: this.interval(),
            weekdays: WEEKDAYS.filter((d) => this.days().includes(d)),
            startDate: m.startDate,
            time: m.time,
            durationMinutes: Number(m.duration),
          },
        });
        this.toasts.show(
          this.translate.instant('serviceClient.created', { name: m.clientName }),
          'success',
        );
        await this.router.navigate(['/app/projects', projectId, 'visit']);
      } catch (error) {
        if (errorReason(error) === 'plan_limit') await this.planLimit();
        else {
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
