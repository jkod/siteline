import { TestBed } from '@angular/core/testing';

import { Icon } from './icon';
import { ICON_PATHS } from './icons.generated';

describe('Icon', () => {
  it('renders the symbol decoratively by default', async () => {
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', 'close');
    fixture.componentRef.setInput('size', 20);
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(ICON_PATHS.close);
  });

  it('is announced as an image when it has a label', async () => {
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', 'warning');
    fixture.componentRef.setInput('label', 'Varning');
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Varning');
    expect(svg.hasAttribute('aria-hidden')).toBe(false);
  });
});
