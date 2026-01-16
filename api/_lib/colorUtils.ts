/**
 * Color utility functions for backend/API usage
 * Note: Frontend uses src/utils/colorAssignment.ts
 */

/**
 * Speaker color scheme type
 */
export interface SpeakerColorScheme {
  circle_color: string;
  faded_circle_color: string;
  quote_rectangle_color: string;
  faded_quote_rectangle_color: string;
  quote_text_color: string;
  faded_quote_text_color: string;
}

/**
 * Converts hex color to rgba
 */
export function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Darkens a color by a percentage
 */
export function darkenColor(hex: string, percent: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  let r = parseInt(result[1], 16);
  let g = parseInt(result[2], 16);
  let b = parseInt(result[3], 16);
  r = Math.round(r * (1 - percent));
  g = Math.round(g * (1 - percent));
  b = Math.round(b * (1 - percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Builds a complete speaker color scheme from a base color
 */
export function buildSpeakerColorScheme(base: string): SpeakerColorScheme {
  return {
    circle_color: base,
    faded_circle_color: hexToRgba(base, 0.35),
    quote_rectangle_color: hexToRgba(base, 0.15),
    faded_quote_rectangle_color: hexToRgba(base, 0.08),
    quote_text_color: darkenColor(base, 0.4),
    faded_quote_text_color: darkenColor(base, 0.4),
  };
}
