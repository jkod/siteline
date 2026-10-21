import { TestBed } from '@angular/core/testing';

import { Dialogs } from './dialog';

describe('Dialogs.confirm', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
  });

  async function openConfirm() {
    const dialogs = TestBed.inject(Dialogs);
    const answer = dialogs.confirm({
      title: 'Dra tillbaka beslutet?',
      message: 'Kunden får veta det.',
      confirmLabel: 'Dra tillbaka',
      cancelLabel: 'Avbryt',
    });
    await new Promise((resolve) => setTimeout(resolve));
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    return { answer, dialog };
  }

  it('opens a modal dialog labelled by its title', async () => {
    const { dialog } = await openConfirm();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe('Dra tillbaka beslutet?');
  });

  it('resolves true on confirm and false on cancel', async () => {
    let opened = await openConfirm();
    const buttons = () => Array.from(opened.dialog.querySelectorAll('button'));
    buttons()
      .find((b) => b.textContent?.includes('Dra tillbaka'))
      ?.click();
    expect(await opened.answer).toBe(true);

    opened = await openConfirm();
    buttons()
      .find((b) => b.textContent?.includes('Avbryt'))
      ?.click();
    expect(await opened.answer).toBe(false);
  });
});
