/**
 * Semantic Layout Utilities
 *
 * Uses UMAP to project high-dimensional embeddings to 2D coordinates
 * for semantic-based initial positioning of response nodes.
 */

import { UMAP } from 'umap-js';

export interface SemanticCoordinate {
  x: number;
  y: number;
}

export interface UMAPOptions {
  nNeighbors?: number;
  minDist?: number;
  spread?: number;
  nComponents?: number;
  random?: () => number;
}

const DEFAULT_UMAP_OPTIONS: UMAPOptions = {
  nNeighbors: 15,      // Number of neighbors to consider for local structure
  minDist: 0.2,        // Minimum distance between points in low-dimensional space
  spread: 2.0,         // Scale of the embedded points (increased for more spacing)
  nComponents: 2,      // Output dimensions (2D for our visualization)
};

/**
 * Project high-dimensional embeddings to 2D coordinates using UMAP.
 *
 * @param embeddings - Array of embedding vectors (e.g., 1536-dim from OpenAI)
 * @param options - Optional UMAP configuration
 * @returns Array of 2D coordinates in the same order as input embeddings
 */
export function projectEmbeddingsTo2D(
  embeddings: number[][],
  options?: UMAPOptions
): SemanticCoordinate[] {
  if (embeddings.length === 0) {
    return [];
  }

  // Need at least 2 points for UMAP
  if (embeddings.length === 1) {
    return [{ x: 0, y: 0 }];
  }

  // Validate embeddings have consistent dimensions
  const dim = embeddings[0].length;
  const validEmbeddings = embeddings.filter((e) => Array.isArray(e) && e.length === dim);

  if (validEmbeddings.length < 2) {
    // Fall back to origin positions if not enough valid embeddings
    return embeddings.map(() => ({ x: 0, y: 0 }));
  }

  const mergedOptions = { ...DEFAULT_UMAP_OPTIONS, ...options };

  // Adjust nNeighbors if we have fewer points than the default
  const nNeighbors = Math.min(mergedOptions.nNeighbors || 15, Math.max(2, validEmbeddings.length - 1));

  try {
    const umap = new UMAP({
      nNeighbors,
      minDist: mergedOptions.minDist,
      spread: mergedOptions.spread,
      nComponents: mergedOptions.nComponents || 2,
      random: mergedOptions.random,
    });

    // Fit and transform embeddings to 2D
    const projected = umap.fit(validEmbeddings);

    // Convert to SemanticCoordinate format
    const coordinates: SemanticCoordinate[] = projected.map((point: number[]) => ({
      x: point[0],
      y: point[1],
    }));

    // If some embeddings were filtered out, map them back
    if (validEmbeddings.length < embeddings.length) {
      let validIdx = 0;
      return embeddings.map((e) => {
        if (Array.isArray(e) && e.length === dim) {
          return coordinates[validIdx++];
        }
        return { x: 0, y: 0 };
      });
    }

    return coordinates;
  } catch (error) {
    console.warn('[semanticLayout] UMAP projection failed:', error);
    // Fall back to origin positions on error
    return embeddings.map(() => ({ x: 0, y: 0 }));
  }
}

/**
 * Scale UMAP coordinates to fit within a specified range.
 * Centers the coordinates around (0, 0) with the given range.
 *
 * @param coords - Array of UMAP coordinates
 * @param range - Target range for coordinates (e.g., 500 means -500 to 500)
 * @returns Scaled coordinates
 */
export function scaleCoordinates(
  coords: SemanticCoordinate[],
  range: number = 500
): SemanticCoordinate[] {
  if (coords.length === 0) return [];

  // Find bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const c of coords) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }

  // Handle edge case where all points are the same
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  // Scale to fit within -range to +range
  return coords.map((c) => ({
    x: ((c.x - minX) / rangeX - 0.5) * 2 * range,
    y: ((c.y - minY) / rangeY - 0.5) * 2 * range,
  }));
}

/**
 * Parse a PostgreSQL vector string to a number array.
 * Format: "[0.1,0.2,0.3,...]" or "(0.1,0.2,0.3,...)"
 *
 * @param vectorStr - PostgreSQL vector string
 * @returns Array of numbers or null if parsing fails
 */
export function parseVectorString(vectorStr: string | null | undefined): number[] | null {
  if (!vectorStr || typeof vectorStr !== 'string') {
    return null;
  }

  try {
    // Remove brackets/parentheses and split by comma
    const cleaned = vectorStr.replace(/[\[\]\(\)]/g, '').trim();
    if (!cleaned) return null;

    const numbers = cleaned.split(',').map((s) => parseFloat(s.trim()));

    // Validate all values are valid numbers
    if (numbers.some((n) => isNaN(n))) {
      return null;
    }

    return numbers;
  } catch {
    return null;
  }
}

/**
 * Project embeddings to 2D and scale to visualization range.
 * This is the main entry point for semantic layout calculation.
 *
 * @param embeddings - Array of embedding vectors
 * @param range - Target coordinate range (default 500, meaning -500 to 500)
 * @param options - Optional UMAP configuration
 * @returns Scaled 2D coordinates
 */
export function calculateSemanticPositions(
  embeddings: number[][],
  range: number = 500,
  options?: UMAPOptions
): SemanticCoordinate[] {
  const rawCoords = projectEmbeddingsTo2D(embeddings, options);
  return scaleCoordinates(rawCoords, range);
}
