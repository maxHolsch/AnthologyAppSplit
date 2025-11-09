/**
 * KaraokeDisplay Component
 *
 * Displays word-by-word karaoke highlighting synchronized with audio playback.
 * Shows the currently playing response with:
 * - Speaker name and indicator
 * - Question context box
 * - Full response text with real-time word highlighting
 */

import { memo, useMemo } from 'react';
import { useAnthologyStore } from '@stores/AnthologyStore';
import { useWordHighlighting } from '@hooks/useWordHighlighting';
import styles from './KaraokeDisplay.module.css';

interface KaraokeDisplayProps {
  responseId: string;
}

export const KaraokeDisplay = memo<KaraokeDisplayProps>(({ responseId }) => {
  // Get response data from store
  const response = useAnthologyStore(state => state.data.responseNodes.get(responseId));
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);
  const conversations = useAnthologyStore(state => state.data.conversations);
  const currentTime = useAnthologyStore(state => state.audio.currentTime);
  const playbackState = useAnthologyStore(state => state.audio.playbackState);

  // If response not found, don't render
  if (!response) {
    return null;
  }

  // Get conversation color for speaker indicator
  const conversation = conversations.get(response.conversation_id);
  const speakerColor = conversation?.color || '#FF5F1F';

  // Get parent question text
  const parentQuestion = questionNodes.get(response.responds_to);
  const questionText = parentQuestion?.question_text || '';

  // Use word highlighting hook if word timestamps available
  // Only highlight when actively playing (not paused or idle)
  const { words, hasActiveWord } = useWordHighlighting({
    wordTimestamps: response.word_timestamps,
    currentTime: currentTime,
    audioStart: response.audio_start,
    isPlaying: playbackState === 'playing',
  });

  // Render word-by-word or plain text fallback
  const renderText = useMemo(() => {
    if (!response.word_timestamps || response.word_timestamps.length === 0) {
      // Fallback: plain text without highlighting
      return <p className={styles.plainText}>{response.speaker_text}</p>;
    }

    // Render words with highlighting
    return (
      <p className={styles.karaokeText}>
        {words.map((word, index) => (
          <span
            key={index}
            className={`${styles.word} ${word.isActive ? styles.active : ''}`}
            data-confidence={word.confidence}
          >
            {word.text}{' '}
          </span>
        ))}
      </p>
    );
  }, [words, response.word_timestamps, response.speaker_text]);

  return (
    <div className={styles.container}>
      {/* Speaker Name with Color Indicator */}
      <div className={styles.speakerSection}>
        <div
          className={styles.speakerIndicator}
          style={{ backgroundColor: speakerColor }}
          aria-hidden="true"
        />
        <span className={styles.speakerName}>{response.speaker_name}</span>
      </div>

      {/* Question Context Box */}
      {questionText && (
        <div className={styles.questionContext}>
          <p className={styles.questionText}>{questionText}</p>
        </div>
      )}

      {/* Karaoke Text Area */}
      <div className={styles.textArea}>
        {renderText}
      </div>
    </div>
  );
});

KaraokeDisplay.displayName = 'KaraokeDisplay';
