import { Tab, TabContent, TabList, TabPanel, Tabs as AriaTabs } from '@angular/aria/tabs';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  contentChildren,
  Directive,
  inject,
  input,
  model,
  TemplateRef,
} from '@angular/core';

/** One tab of an `sl-tabs`: `<ng-template slTab="feed" label="Feed">…</ng-template>`. */
@Directive({ selector: 'ng-template[slTab]' })
export class TabDef {
  readonly value = input.required<string>({ alias: 'slTab' });
  readonly label = input.required<string>();
  readonly template = inject(TemplateRef);
}

/** In-page tabs on Angular Aria, with keyboard navigation and the ARIA tab pattern. */
@Component({
  selector: 'sl-tabs',
  imports: [AriaTabs, TabList, Tab, TabPanel, TabContent, NgTemplateOutlet],
  template: `
    <div ngTabs>
      <ul ngTabList class="sl-tablist" [(selectedTab)]="selected" [attr.aria-label]="label()">
        @for (tab of tabs(); track tab.value()) {
          <li ngTab class="sl-tab" [value]="tab.value()">{{ tab.label() }}</li>
        }
      </ul>
      @for (tab of tabs(); track tab.value()) {
        <div ngTabPanel class="sl-tabpanel" [value]="tab.value()">
          <ng-template ngTabContent>
            <ng-container [ngTemplateOutlet]="tab.template" />
          </ng-template>
        </div>
      }
    </div>
  `,
})
export class Tabs {
  /** Accessible name for the tab list. */
  readonly label = input.required<string>();
  readonly selected = model<string | undefined>(undefined);
  protected readonly tabs = contentChildren(TabDef);
}
