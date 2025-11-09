/**
 * HighlightedText Component
 *
 * Displays text with word-level highlighting synchronized to audio playback.
 * Uses useWordHighlighting hook to track the currently active word.
 */

import { memo } from 'react';
import { useAnthologyStore } from '@stores/AnthologyStore';
import { useWordHighlighting } from '@hooks/useWordHighlighting';
import type { ResponseNode } from '@types';
import styles from './HighlightedText.module.css';

interface HighlightedTextProps {
  response: ResponseNode;
}

export const HighlightedText = memo<HighlightedTextProps>(({ response }) => {
  // Get audio state from store
  const currentTrack = useAnthologyStore((state) => state.audio.currentTrack);
  const currentTime = useAnthologyStore((state) => state.audio.currentTime);
  const playbackState = useAnthologyStore((state) => state.audio.playbackState);

  // Check if this response is currently playing
  const isCurrentTrack = currentTrack === response.id;
  const isPlaying = isCurrentTrack && playbackState === 'playing';

  // Use word highlighting hook if this track is playing and has word timestamps
  // Only highlight when actively playing (not paused or idle)
  const wordHighlighting = useWordHighlighting({
    wordTimestamps: response.word_timestamps,
    currentTime: isCurrentTrack ? currentTime : 0,
    audioStart: response.audio_start,
    isPlaying: isPlaying,
  });

  // If no word timestamps, display plain text
  if (!response.word_timestamps || response.word_timestamps.length === 0) {
    return (
      <div className={styles.plainText}>
        {response.speaker_text}
      </div>
    );
  }

  // Render text with word-level highlighting
  return (
    <div className={styles.highlightedText}>
      {wordHighlighting.words.map((word, index) => (
        <span
          key={`${word.text}-${word.start}-${index}`}
          className={`${styles.word} ${word.isActive ? styles.active : ''}`}
          data-confidence={word.confidence}
        >
          {word.text}
          {/* Add space if word doesn't already have trailing punctuation/space */}
          {!/[\s,.\!?\-;:]$/.test(word.text) && ' '}
        </span>
      ))}
    </div>
  );
});

HighlightedText.displayName = 'HighlightedText';
