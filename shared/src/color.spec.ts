import { accentTextColor, contrastRatio, onAccentColor, tintColor } from './color';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for equal colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21);
    expect(contrastRatio('#127A69', '#127A69')).toBe(1);
  });
});

describe('accentTextColor', () => {
  it('keeps an accent that already passes 4.5:1 on white', () => {
    expect(accentTextColor('#127A69')).toBe('#127A69');
  });

  it('darkens a light accent until it passes', () => {
    const text = accentTextColor('#5FD3BC');
    expect(text).not.toBe('#5FD3BC');
    expect(contrastRatio(text, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('onAccentColor', () => {
  it('uses white on a dark accent and ink on a light one', () => {
    expect(onAccentColor('#127A69')).toBe('#FFFFFF');
    expect(onAccentColor('#F5D547')).toBe('#1C1F26');
  });
});

describe('tintColor', () => {
  it('mixes the accent with white', () => {
    expect(tintColor('#000000', 0.5)).toBe('#808080');
    expect(tintColor('#127A69')).toBe('#D9EAE7');
  });

  it('gives accent text that passes 4.5:1 on its own tint', () => {
    for (const accent of ['#127A69', '#2F5DA8', '#5FD3BC', '#E8553A']) {
      const tint = tintColor(accent);
      expect(contrastRatio(accentTextColor(accent, 4.5, tint), tint)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
