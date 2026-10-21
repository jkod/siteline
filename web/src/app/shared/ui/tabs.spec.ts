import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TabDef, Tabs } from './tabs';

@Component({
  imports: [Tabs, TabDef],
  template: `
    <sl-tabs label="Projekt" [(selected)]="selected">
      <ng-template slTab="feed" label="Flöde"><p>Feed content</p></ng-template>
      <ng-template slTab="decisions" label="Beslut"><p>Decision content</p></ng-template>
    </sl-tabs>
  `,
})
class Host {
  readonly selected = signal<string | undefined>('feed');
}

describe('Tabs', () => {
  it('renders an accessible tab list with the selected tab and its panel', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const list = root.querySelector('[role="tablist"]');
    expect(list?.getAttribute('aria-label')).toBe('Projekt');
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Flöde', 'Beslut']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(root.textContent).toContain('Feed content');
  });

  it('switches tabs when the selection changes', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.componentInstance.selected.set('decisions');
    await fixture.whenStable();
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Decision content');
  });
});
