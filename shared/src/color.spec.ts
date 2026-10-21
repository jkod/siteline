import { accentTextColor, contrastRatio, onAccentColor } from './color';

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
