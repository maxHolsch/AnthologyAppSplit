/**
 * Word Highlighting Hook
 * Manages word-level highlighting synchronized with audio playback
 *
 * Features:
 * - Finds currently active word based on audio time
 * - Forward-biased search that prefers natural speech order
 * - Stateful tracking to prevent jumping backward unexpectedly
 * - Handles edge cases (before/after all words, gaps between words)
 * - Memoizes results to prevent unnecessary re-renders
 */

import { useMemo, useRef } from 'react';
import type { WordTimestamp } from '@types/data.types';
import { findCurrentWord } from '@utils/audioUtils';

interface UseWordHighlightingOptions {
  wordTimestamps: WordTimestamp[] | undefined;
  currentTime: number; // milliseconds relative to segment start
  audioStart: number; // milliseconds absolute start time
  isPlaying?: boolean; // Only highlight words when actively playing
}

/**
 * Custom hook for word-level highlighting
 * @returns Object with current word index and helper functions
 */
export function useWordHighlighting(options: UseWordHighlightingOptions) {
  const { wordTimestamps, currentTime, audioStart, isPlaying = true } = options;

  // Track the previous word index for stateful, forward-biased searching
  const previousIndexRef = useRef<number>(-1);

  /**
   * Calculate the absolute playback time
   * (currentTime is relative to segment start, word timestamps are absolute)
   */
  const absoluteTime = useMemo(() => {
    return audioStart + currentTime;
  }, [audioStart, currentTime]);

  /**
   * Find the currently active word index
   * Uses stateful tracking to prefer forward progression
   * Only highlights when isPlaying is true
   */
  const currentWordIndex = useMemo(() => {
    if (!wordTimestamps || wordTimestamps.length === 0 || !isPlaying) {
      previousIndexRef.current = -1;
      return -1;
    }

    const newIndex = findCurrentWord(wordTimestamps, absoluteTime, previousIndexRef.current);
    previousIndexRef.current = newIndex;
    return newIndex;
  }, [wordTimestamps, absoluteTime, isPlaying]);

  /**
   * Check if a specific word index is currently active
   */
  const isWordActive = (index: number): boolean => {
    return index === currentWordIndex;
  };

  /**
   * Get the currently active word object
   */
  const currentWord = useMemo(() => {
    if (!wordTimestamps || currentWordIndex === -1) {
      return null;
    }

    return wordTimestamps[currentWordIndex] || null;
  }, [wordTimestamps, currentWordIndex]);

  /**
   * Split text into words for rendering
   * Preserves original spacing and punctuation
   */
  const splitIntoWords = useMemo(() => {
    if (!wordTimestamps) {
      return [];
    }

    return wordTimestamps.map((word, index) => ({
      text: word.text,
      index,
      isActive: index === currentWordIndex,
      start: word.start,
      end: word.end,
      speaker: word.speaker,
      confidence: word.confidence,
    }));
  }, [wordTimestamps, currentWordIndex]);

  return {
    /**
     * Index of currently highlighted word (-1 if none)
     */
    currentWordIndex,

    /**
     * Currently active word object (null if none)
     */
    currentWord,

    /**
     * Check if a word at given index is currently active
     */
    isWordActive,

    /**
     * Array of words with active state for rendering
     */
    words: splitIntoWords,

    /**
     * Whether any word is currently active
     */
    hasActiveWord: currentWordIndex !== -1,
  };
}
