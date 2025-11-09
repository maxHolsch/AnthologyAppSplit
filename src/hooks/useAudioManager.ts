/**
 * AudioManager Hook
 * Manages HTMLAudioElement lifecycle and playback for audio segments
 *
 * Features:
 * - Loads audio files based on conversation ID
 * - Plays specific segments (audio_start to audio_end)
 * - Syncs playback state with Zustand store
 * - Handles preloading and buffering
 * - Auto-stops at segment end
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAnthologyStore } from '@stores/AnthologyStore';
import { clampToSegment } from '@utils/audioUtils';

interface UseAudioManagerOptions {
  conversationId: string;
  audioFilePath: string;
  audioStart: number; // milliseconds
  audioEnd: number; // milliseconds
  responseId: string;
  onEnded?: () => void;
}

/**
 * Custom hook for managing audio playback
 */
export function useAudioManager(options: UseAudioManagerOptions) {
  const {
    conversationId,
    audioFilePath,
    audioStart,
    audioEnd,
    responseId,
    onEnded,
  } = options;

  // Audio element ref
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isSeekingRef = useRef(false);

  // Store actions
  const playbackState = useAnthologyStore(state => state.audio.playbackState);
  const currentTrack = useAnthologyStore(state => state.audio.currentTrack);
  const updateCurrentTime = useAnthologyStore(state => state.audio.updateCurrentTime);

  /**
   * Initialize audio element
   */
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    // Cleanup on unmount
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  /**
   * Load audio file when conversation changes
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Only reload if the audio file changes
    if (audio.src !== audioFilePath && audioFilePath) {
      audio.src = audioFilePath;
      audio.load();
    }
  }, [audioFilePath]);

  /**
   * Monitor playback time and auto-stop at segment end
   */
  const monitorPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) {
      rafRef.current = null;
      return;
    }

    const currentTimeMs = audio.currentTime * 1000;

    // Update store with current time (relative to segment start)
    const relativeTime = currentTimeMs - audioStart;
    updateCurrentTime(Math.max(0, relativeTime));

    // Check if we've reached the segment end
    if (currentTimeMs >= audioEnd) {
      audio.pause();
      audio.currentTime = audioStart / 1000; // Reset to segment start
      updateCurrentTime(0);

      // Trigger onEnded callback
      if (onEnded) {
        onEnded();
      }

      rafRef.current = null;
      return;
    }

    // Continue monitoring
    rafRef.current = requestAnimationFrame(monitorPlayback);
  }, [audioStart, audioEnd, updateCurrentTime, onEnded]);

  /**
   * Play audio segment
   */
  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      // Set playback position to segment start if not already within segment
      const currentTimeMs = audio.currentTime * 1000;
      if (currentTimeMs < audioStart || currentTimeMs >= audioEnd) {
        audio.currentTime = audioStart / 1000;
      }

      await audio.play();

      // Start monitoring playback
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(monitorPlayback);
      }
    } catch (error) {
      console.error('Audio playback error:', error);
    }
  }, [audioStart, audioEnd, monitorPlayback]);

  /**
   * Pause audio playback
   */
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();

    // Stop monitoring
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /**
   * Stop audio playback and reset to segment start
   */
  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = audioStart / 1000;
    updateCurrentTime(0);

    // Stop monitoring
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [audioStart, updateCurrentTime]);

  /**
   * Seek to a specific time within the segment
   * @param time - Time in milliseconds relative to segment start
   */
  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      isSeekingRef.current = true;

      // Clamp time within segment boundaries
      const absoluteTime = clampToSegment(audioStart + time, audioStart, audioEnd);
      audio.currentTime = absoluteTime / 1000;

      updateCurrentTime(time);

      // Resume monitoring if playing
      if (!audio.paused && !rafRef.current) {
        rafRef.current = requestAnimationFrame(monitorPlayback);
      }

      setTimeout(() => {
        isSeekingRef.current = false;
      }, 100);
    },
    [audioStart, audioEnd, updateCurrentTime, monitorPlayback]
  );

  /**
   * Seek to a specific progress percentage
   * @param progressPercent - Progress percentage (0-100)
   */
  const seekToProgress = useCallback(
    (progressPercent: number) => {
      const segmentDuration = audioEnd - audioStart;
      const relativeTime = (progressPercent / 100) * segmentDuration;
      seek(relativeTime);
    },
    [audioStart, audioEnd, seek]
  );

  /**
   * Get current audio duration (segment duration, not full file)
   */
  const getDuration = useCallback(() => {
    return audioEnd - audioStart;
  }, [audioStart, audioEnd]);

  /**
   * Handle play/pause when store state changes externally
   */
  useEffect(() => {
    if (!audioRef.current) return;

    // Only respond if this is the current track
    if (currentTrack !== responseId) {
      // Not our track, pause if playing
      if (!audioRef.current.paused) {
        pause();
      }
      return;
    }

    // This is our track - sync with store state
    if (playbackState === 'playing') {
      if (audioRef.current.paused) {
        play();
      }
    } else if (playbackState === 'paused') {
      if (!audioRef.current.paused) {
        pause();
      }
    } else if (playbackState === 'idle') {
      stop();
    }
  }, [playbackState, currentTrack, responseId, play, pause, stop]);

  return {
    play,
    pause,
    stop,
    seek,
    seekToProgress,
    getDuration,
    isPlaying: playbackState === 'playing' && currentTrack === responseId,
    isPaused: playbackState === 'paused' && currentTrack === responseId,
    audioElement: audioRef.current,
  };
}
