import { Component, input } from '@angular/core';

/** Tells people what to do next when a list is empty (PRD section 11). */
@Component({
  selector: 'sl-empty-state',
  template: `
    <p class="title">{{ title() }}</p>
    @if (body()) {
      <p class="body">{{ body() }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--sl-space-2);
      padding: var(--sl-space-8) var(--sl-space-5);
      text-align: center;
      background: var(--sl-panel);
      border-radius: var(--sl-radius-panel);
    }
    .title {
      font: var(--sl-text-section);
    }
    .body {
      max-width: 36ch;
      color: var(--sl-text-2);
    }
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly body = input<string>();
}
