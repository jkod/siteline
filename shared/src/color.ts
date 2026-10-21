const INK = '#1C1F26';
const WHITE = '#FFFFFF';

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#RRGGBB` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or ink, whichever contrasts more with the accent (PRD section 12). */
export function onAccentColor(accent: string): string {
  return contrastRatio(accent, WHITE) >= contrastRatio(accent, INK) ? WHITE : INK;
}

/**
 * The accent as text on white: the accent itself when it reaches 4.5:1, otherwise darkened
 * step by step until it does (PRD F1).
 */
export function accentTextColor(accent: string, minRatio = 4.5): string {
  let rgb = channels(accent);
  let hex = toHex(rgb);
  while (contrastRatio(hex, WHITE) < minRatio) {
    rgb = rgb.map((c) => Math.floor(c * 0.95)) as [number, number, number];
    hex = toHex(rgb);
  }
  return hex;
}
