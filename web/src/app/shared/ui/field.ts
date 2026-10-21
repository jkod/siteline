import { Component, computed, Directive, inject, input } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

let nextId = 0;

export interface FieldError {
  kind: string;
}

/**
 * A labelled form field: label, the projected `slInput` control, an optional hint and
 * translated errors. The control gets its id, `aria-describedby` and `aria-invalid` from here.
 */
@Component({
  selector: 'sl-field',
  imports: [TranslatePipe],
  template: `
    <label class="label" [attr.for]="controlId">{{ label() }}</label>
    <ng-content />
    @if (hint()) {
      <p class="hint" [id]="hintId">{{ hint() }}</p>
    }
    @if (showErrors()) {
      <p class="error" [id]="errorId">{{ 'errors.validation.' + errors()[0].kind | translate }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sl-space-2);
    }
    .label {
      font: 600 15px/20px var(--sl-font-body);
    }
    .hint {
      font: var(--sl-text-small);
      color: var(--sl-text-3);
    }
    .error {
      font: 600 13px/18px var(--sl-font-body);
      color: var(--sl-alert-text);
    }
  `,
})
export class Field {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly errors = input<readonly FieldError[]>([]);
  /** Usually the field's `touched()` state, so errors wait until the person has tried. */
  readonly touched = input(false);

  private readonly id = `sl-field-${nextId++}`;
  readonly controlId = `${this.id}-control`;
  readonly hintId = `${this.id}-hint`;
  readonly errorId = `${this.id}-error`;

  readonly showErrors = computed(() => this.touched() && this.errors().length > 0);
  readonly describedBy = computed(
    () =>
      [this.hint() ? this.hintId : null, this.showErrors() ? this.errorId : null]
        .filter(Boolean)
        .join(' ') || null,
  );
}

/** Styles a native input or textarea and wires it to its `sl-field`. */
@Directive({
  selector: 'input[slInput], textarea[slInput], select[slInput]',
  host: {
    class: 'sl-input',
    '[id]': 'field?.controlId',
    '[attr.aria-describedby]': 'field?.describedBy()',
    '[attr.aria-invalid]': 'field?.showErrors() || null',
  },
})
export class Input {
  protected readonly field = inject(Field, { optional: true });
}
