/**
 * Color utilities for pull quote nodes and conversation colors
 * Matches Figma design specifications exactly
 */

import type { SpeakerColorScheme } from '../types/data.types';

/**
 * Type guard to check if a value is a SpeakerColorScheme object
 */
function isSpeakerColorScheme(value: unknown): value is SpeakerColorScheme {
  if (typeof value !== 'object' || value === null) return false;
  const scheme = value as Record<string, unknown>;
  return (
    typeof scheme.circle === 'string' &&
    typeof scheme.fadedCircle === 'string' &&
    typeof scheme.quoteRectangle === 'string' &&
    typeof scheme.fadedQuoteRectangle === 'string' &&
    typeof scheme.quoteText === 'string' &&
    typeof scheme.fadedQuoteText === 'string'
  );
}

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

/**
 * Extract circle color from color scheme based on selection state
 * Supports both new (object) and old (string) color formats
 */
export function getCircleColor(
  colorScheme: string | SpeakerColorScheme,
  isSelected: boolean,
  anySelected: boolean
): string {
  // Handle old format (single color string)
  if (typeof colorScheme === 'string') {
    return colorScheme;
  }

  // Handle new format (color scheme object)
  if (isSpeakerColorScheme(colorScheme)) {
    // If nothing is selected, show normal color
    if (!anySelected) {
      return colorScheme.circle;
    }
    // Return appropriate color based on selection state
    return isSelected ? colorScheme.circle : colorScheme.fadedCircle;
  }

  // Fallback to default color
  return '#FF5F1F';
}

/**
 * Extract pull quote background color from color scheme based on selection state
 * Supports both new (object) and old (string) color formats
 */
export function getQuoteBackgroundColor(
  colorScheme: string | SpeakerColorScheme,
  isSelected: boolean,
  anySelected: boolean
): string {
  // Handle old format (single color string)
  if (typeof colorScheme === 'string') {
    return getPullQuoteBackgroundColor(colorScheme);
  }

  // Handle new format (color scheme object)
  if (isSpeakerColorScheme(colorScheme)) {
    // If nothing is selected, show normal color
    if (!anySelected) {
      return colorScheme.quoteRectangle;
    }
    // Return appropriate color based on selection state
    return isSelected ? colorScheme.quoteRectangle : colorScheme.fadedQuoteRectangle;
  }

  // Fallback to old calculation
  return getPullQuoteBackgroundColor('#FF5F1F');
}

/**
 * Extract pull quote text color from color scheme based on selection state
 * Supports both new (object) and old (string) color formats
 * Note: Text color stays the same - opacity is controlled separately in the component
 */
export function getQuoteTextColor(
  colorScheme: string | SpeakerColorScheme,
  isSelected: boolean,
  anySelected: boolean
): string {
  // Handle old format (single color string)
  if (typeof colorScheme === 'string') {
    return getPullQuoteTextColor(colorScheme);
  }

  // Handle new format (color scheme object)
  if (isSpeakerColorScheme(colorScheme)) {
    // Always return the same text color - opacity is handled separately
    return colorScheme.quoteText;
  }

  // Fallback to old calculation
  return getPullQuoteTextColor('#FF5F1F');
}
