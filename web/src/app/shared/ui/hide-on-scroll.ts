import {
  booleanAttribute,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  Injectable,
  input,
  signal,
} from '@angular/core';

/** Scroll movements smaller than this, in pixels, don't count (touch jitter, overscroll). */
const JITTER_PX = 4;

/**
 * Which scroll direction leads toward older content. A feed in chat order turns it around while
 * it's on screen, so the top bar hides as you scroll up into history.
 */
@Injectable({ providedIn: 'root' })
export class ScrollDirection {
  readonly reversed = signal(false);
}

/**
 * A floating top bar that slides away as soon as you scroll toward older content and comes back
 * as soon as you scroll the other way. It sticks once scrolled to (gaining a `--stuck` class),
 * always shows before that, and shows when focus moves into it. Its visible height is published
 * as `--sl-top-inset`, so content that fades under the top edge (the feed) follows it. Bound to
 * false (`[slHideOnScroll]="false"`), it's an ordinary element.
 */
@Directive({
  selector: '[slHideOnScroll]',
  host: {
    '[class.sl-hide-on-scroll]': 'enabled()',
    '[class.sl-hide-on-scroll--stuck]': 'enabled() && stuck()',
    '[class.sl-hide-on-scroll--hidden]': 'enabled() && hidden()',
    '(focusin)': 'hidden.set(false)',
  },
})
export class HideOnScroll {
  private readonly direction = inject(ScrollDirection);
  private readonly el: HTMLElement = inject(ElementRef).nativeElement;

  readonly enabled = input(true, { alias: 'slHideOnScroll', transform: booleanAttribute });
  protected readonly hidden = signal(false);
  protected readonly stuck = signal(false);
  private readonly height = signal(0);

  constructor() {
    const root = document.documentElement;
    let last = Math.max(0, window.scrollY);
    let setsInset = false;

    /** Where the bar sits in the page before it sticks: just below whatever comes before it. */
    const restingTop = () => {
      const before = this.el.previousElementSibling?.getBoundingClientRect();
      return before ? Math.max(0, before.bottom + window.scrollY) : 0;
    };

    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const delta = y - last;
      if (Math.abs(delta) < JITTER_PX) return;
      last = y;
      const top = restingTop();
      this.stuck.set(y > top);
      if (y <= top + this.height()) {
        this.hidden.set(false);
        return;
      }
      this.hidden.set(this.direction.reversed() ? delta < 0 : delta > 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const resize = new ResizeObserver(() => this.height.set(this.el.offsetHeight));
    resize.observe(this.el);

    // Only a bar that's on screen sets the inset, so a hidden phone bar doesn't clear a desktop one.
    effect(() => {
      setsInset = this.enabled() && this.height() > 0;
      if (!setsInset) return;
      root.style.setProperty('--sl-top-inset', `${this.hidden() ? 0 : this.height()}px`);
    });

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', onScroll);
      resize.disconnect();
      if (setsInset) root.style.removeProperty('--sl-top-inset');
    });
  }
}
