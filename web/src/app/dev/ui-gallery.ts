import { Component, inject, signal } from '@angular/core';
import { form, FormField, minLength, required } from '@angular/forms/signals';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { MoneyPipe } from '../shared/pipes/money';
import { Button } from '../shared/ui/button';
import { Card } from '../shared/ui/card';
import { Dialogs } from '../shared/ui/dialog';
import { Field, Input } from '../shared/ui/field';
import { LanguageSwitch } from '../shared/ui/language-switch';
import { TabDef, Tabs } from '../shared/ui/tabs';
import { Toasts } from '../shared/ui/toast';

/** Every base component in one place, for visual checks and the accessibility test. */
@Component({
  selector: 'sl-ui-gallery',
  imports: [
    TranslatePipe,
    FormField,
    MoneyPipe,
    Button,
    Card,
    Field,
    Input,
    LanguageSwitch,
    TabDef,
    Tabs,
  ],
  template: `
    <main class="sl-page sl-stack" id="main">
      <h1>{{ 'pages.devUi' | translate }}</h1>
      <sl-language-switch />

      <section slCard class="sl-stack" aria-labelledby="buttons">
        <h2 id="buttons">{{ 'dev.ui.buttons' | translate }}</h2>
        <div class="row">
          <button slButton type="button">{{ 'dev.ui.primary' | translate }}</button>
          <button slButton="secondary" type="button">{{ 'dev.ui.secondary' | translate }}</button>
          <button slButton="ghost" type="button">{{ 'dev.ui.ghost' | translate }}</button>
          <button slButton type="button" busy disabled>{{ 'dev.ui.busy' | translate }}</button>
        </div>
        <button slButton size="large" block type="button">
          {{ 'dev.ui.mainAction' | translate }}
        </button>
      </section>

      <section slCard class="sl-stack" aria-labelledby="cards">
        <h2 id="cards">{{ 'dev.ui.cards' | translate }}</h2>
        <div slCard="panel">{{ 'dev.ui.panel' | translate }}</div>
        <div slCard="dark">{{ 'dev.ui.dark' | translate }}</div>
        <p>{{ 'dev.ui.price' | translate }}: {{ 650000 | money }}</p>
      </section>

      <section slCard class="sl-stack" aria-labelledby="fields">
        <h2 id="fields">{{ 'dev.ui.fields' | translate }}</h2>
        <form
          class="sl-stack"
          novalidate
          (submit)="$event.preventDefault(); form.name().markAsTouched()"
        >
          <sl-field
            [label]="'dev.ui.nameLabel' | translate"
            [hint]="'dev.ui.nameHint' | translate"
            [errors]="form.name().errors()"
            [touched]="form.name().touched()"
          >
            <input slInput type="text" autocomplete="off" [formField]="form.name" />
          </sl-field>
          <div>
            <button slButton="secondary" type="submit">{{ 'dev.ui.validate' | translate }}</button>
          </div>
        </form>
      </section>

      <section slCard class="sl-stack" aria-labelledby="tabs">
        <h2 id="tabs">{{ 'dev.ui.tabs' | translate }}</h2>
        <sl-tabs [label]="'dev.ui.tabs' | translate" [(selected)]="tab">
          <ng-template slTab="feed" [label]="'dev.ui.tabFeed' | translate">
            <p>{{ 'dev.ui.tabFeedBody' | translate }}</p>
          </ng-template>
          <ng-template slTab="decisions" [label]="'dev.ui.tabDecisions' | translate">
            <p>{{ 'dev.ui.tabDecisionsBody' | translate }}</p>
          </ng-template>
          <ng-template slTab="visit" [label]="'dev.ui.tabVisit' | translate">
            <p>{{ 'dev.ui.tabVisitBody' | translate }}</p>
          </ng-template>
        </sl-tabs>
      </section>

      <section slCard class="sl-stack" aria-labelledby="overlays">
        <h2 id="overlays">{{ 'dev.ui.overlays' | translate }}</h2>
        <div class="row">
          <button slButton="secondary" type="button" (click)="openDialog()">
            {{ 'dev.ui.openDialog' | translate }}
          </button>
          <button slButton="secondary" type="button" (click)="toast('success')">
            {{ 'dev.ui.toastSuccess' | translate }}
          </button>
          <button slButton="secondary" type="button" (click)="toast('error')">
            {{ 'dev.ui.toastError' | translate }}
          </button>
        </div>
        @if (lastAnswer() !== null) {
          <p>{{ (lastAnswer() ? 'dev.ui.confirmed' : 'dev.ui.cancelled') | translate }}</p>
        }
      </section>
    </main>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-space-3);
    }
  `,
})
export class UiGallery {
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  private readonly translate = inject(TranslateService);

  protected readonly tab = signal<string | undefined>('feed');
  protected readonly lastAnswer = signal<boolean | null>(null);
  protected readonly model = signal({ name: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    minLength(path.name, 2);
  });

  protected async openDialog(): Promise<void> {
    const t = (key: string) => this.translate.instant(key) as string;
    this.lastAnswer.set(
      await this.dialogs.confirm({
        title: t('dev.ui.dialogTitle'),
        message: t('dev.ui.dialogBody'),
        confirmLabel: t('dev.ui.dialogConfirm'),
        cancelLabel: t('common.cancel'),
      }),
    );
  }

  protected toast(kind: 'success' | 'error'): void {
    this.toasts.show(
      this.translate.instant(kind === 'success' ? 'dev.ui.toastSuccessText' : 'errors.unknown'),
      kind,
    );
  }
}
