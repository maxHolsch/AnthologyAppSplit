/**
 * Audio Utility Functions
 * Helper functions for audio playback, time formatting, and word synchronization
 */

import type { WordTimestamp } from '@types/data.types';

/**
 * Maps a conversation ID to its audio file path
 * @param conversationId - The unique conversation identifier
 * @returns The path to the audio file
 */
export function getAudioFilePath(conversationId: string): string {
  // Audio files are stored in the public directory
  // The conversation data contains relative paths like "./recordings/1635.mp3"
  // We need to return the public path (without the leading ./)
  return `/recordings/${conversationId}.mp3`;
}

/**
 * Formats milliseconds to countdown time format (-MM:SS)
 * @param ms - Time in milliseconds
 * @returns Formatted string like "-02:35" or "-00:05"
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `-${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats milliseconds to time remaining from duration
 * @param currentMs - Current time in milliseconds
 * @param durationMs - Total duration in milliseconds
 * @returns Formatted countdown string
 */
export function formatTimeRemaining(currentMs: number, durationMs: number): string {
  const remaining = Math.max(0, durationMs - currentMs);
  return formatTime(remaining);
}

/**
 * Finds the currently active word based on audio playback time
 * Uses forward-biased search that prefers natural speech order
 *
 * @param wordTimestamps - Array of word timestamp objects
 * @param currentTime - Current playback time in milliseconds
 * @param previousIndex - Previously highlighted word index (optional, for stateful tracking)
 * @returns Index of the current word, or -1 if none match
 */
export function findCurrentWord(
  wordTimestamps: WordTimestamp[],
  currentTime: number,
  previousIndex: number = -1
): number {
  if (!wordTimestamps || wordTimestamps.length === 0) {
    return -1;
  }

  // Handle edge cases
  if (currentTime < wordTimestamps[0].start) {
    return -1; // Before first word
  }

  const lastWord = wordTimestamps[wordTimestamps.length - 1];
  if (currentTime > lastWord.end) {
    return wordTimestamps.length - 1; // Keep last word highlighted after speech ends
  }

  // If we have a previous index, check nearby words first (forward-biased)
  if (previousIndex >= 0 && previousIndex < wordTimestamps.length) {
    // Check if we're still in the same word
    const prevWord = wordTimestamps[previousIndex];
    if (currentTime >= prevWord.start && currentTime <= prevWord.end) {
      return previousIndex;
    }

    // Check the next word (natural speech progression)
    if (previousIndex < wordTimestamps.length - 1) {
      const nextWord = wordTimestamps[previousIndex + 1];
      if (currentTime >= nextWord.start && currentTime <= nextWord.end) {
        return previousIndex + 1;
      }

      // Check if we're in the gap between current and next word
      // Prefer showing the upcoming word slightly early (forward-biased)
      if (currentTime > prevWord.end && currentTime < nextWord.start) {
        const gapMidpoint = (prevWord.end + nextWord.start) / 2;
        return currentTime >= gapMidpoint ? previousIndex + 1 : previousIndex;
      }
    }

    // Check if we rewound to the previous word
    if (previousIndex > 0) {
      const prevPrevWord = wordTimestamps[previousIndex - 1];
      if (currentTime >= prevPrevWord.start && currentTime <= prevPrevWord.end) {
        return previousIndex - 1;
      }
    }
  }

  // Binary search for initial lookup or significant time jumps
  let left = 0;
  let right = wordTimestamps.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const word = wordTimestamps[mid];

    if (currentTime >= word.start && currentTime <= word.end) {
      return mid; // Found exact match
    } else if (currentTime < word.start) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  // Find closest word with forward bias
  for (let i = 0; i < wordTimestamps.length - 1; i++) {
    const currentWord = wordTimestamps[i];
    const nextWord = wordTimestamps[i + 1];

    if (currentTime >= currentWord.end && currentTime < nextWord.start) {
      // In gap between words - use midpoint with slight forward bias
      const gapMidpoint = (currentWord.end + nextWord.start) / 2;
      return currentTime >= gapMidpoint ? i + 1 : i;
    }
  }

  return -1;
}

/**
 * Validates browser audio format support
 * @returns Object with supported format flags
 */
export function validateAudioSupport(): {
  mp3: boolean;
  wav: boolean;
  ogg: boolean;
  m4a: boolean;
} {
  const audio = document.createElement('audio');

  return {
    mp3: audio.canPlayType('audio/mpeg') !== '',
    wav: audio.canPlayType('audio/wav') !== '',
    ogg: audio.canPlayType('audio/ogg') !== '',
    m4a: audio.canPlayType('audio/mp4') !== '',
  };
}

/**
 * Clamps audio time within segment boundaries
 * @param time - Time in milliseconds to clamp
 * @param start - Segment start time in milliseconds
 * @param end - Segment end time in milliseconds
 * @returns Clamped time within [start, end]
 */
export function clampToSegment(time: number, start: number, end: number): number {
  return Math.max(start, Math.min(end, time));
}

/**
 * Calculates progress percentage within an audio segment
 * @param currentTime - Current playback time in milliseconds
 * @param start - Segment start time in milliseconds
 * @param end - Segment end time in milliseconds
 * @returns Progress as percentage (0-100)
 */
export function calculateSegmentProgress(
  currentTime: number,
  start: number,
  end: number
): number {
  if (end <= start) return 0;

  const segmentDuration = end - start;
  const elapsed = currentTime - start;
  const progress = (elapsed / segmentDuration) * 100;

  return Math.max(0, Math.min(100, progress));
}

/**
 * Converts a progress percentage to absolute time within a segment
 * @param progressPercent - Progress percentage (0-100)
 * @param start - Segment start time in milliseconds
 * @param end - Segment end time in milliseconds
 * @returns Absolute time in milliseconds
 */
export function progressToTime(
  progressPercent: number,
  start: number,
  end: number
): number {
  const segmentDuration = end - start;
  const elapsed = (progressPercent / 100) * segmentDuration;

  return start + elapsed;
}

/**
 * Fisher-Yates shuffle algorithm for fair randomization
 * Creates a shuffled copy of the input array
 *
 * @param array - Array to shuffle
 * @returns New shuffled array
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}
