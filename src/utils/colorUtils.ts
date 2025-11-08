/**
 * Color utilities for pull quote nodes and conversation colors
 * Matches Figma design specifications exactly
 */

/**
 * Figma-specified color mappings for pull quote text
 * Maps base conversation colors to their darker text variants
 */
const FIGMA_TEXT_COLORS: Record<string, string> = {
  '#FF5F1F': '#db3f00', // Orange
  '#6CB7FA': '#0061b7', // Blue
  '#CC82E7': '#5d0184', // Purple
  '#6CC686': '#0a501e', // Green
  '#F7ACEA': '#c14886', // Pink
};

/**
 * Get text color for pull quote based on conversation color
 * Uses exact Figma color if available, otherwise calculates darker shade
 */
export function getPullQuoteTextColor(baseColor: string): string {
  // Normalize color to uppercase for comparison
  const normalizedColor = baseColor.toUpperCase();

  // Check if we have an exact Figma color match
  if (FIGMA_TEXT_COLORS[normalizedColor]) {
    return FIGMA_TEXT_COLORS[normalizedColor];
  }

  // Fallback: calculate darker shade (60% RGB reduction)
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const textR = Math.max(0, Math.floor(r * 0.6));
  const textG = Math.max(0, Math.floor(g * 0.6));
  const textB = Math.max(0, Math.floor(b * 0.6));

  return `rgb(${textR}, ${textG}, ${textB})`;
}

/**
 * Get background color for pull quote (15% opacity)
 */
export function getPullQuoteBackgroundColor(baseColor: string): string {
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

/**
 * Calculate edge opacity based on selection state
 */
export function getEdgeOpacity(
  sourceSelected: boolean,
  targetSelected: boolean,
  anySelected: boolean
): number {
  if (!anySelected) return 1;
  if (sourceSelected || targetSelected) return 1;
  return 0.3;
}
