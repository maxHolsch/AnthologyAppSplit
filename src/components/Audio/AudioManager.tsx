/**
 * AudioManager Component
 *
 * Manages global audio playback and coordinates with store.
 * Creates a single shared audio element for the entire app.
 * Handles playback for all modes (single, shuffle, medley).
 */

import { useEffect, useRef } from 'react';
import { useAnthologyStore } from '@stores/AnthologyStore';

export const AudioManager: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const setAudioElement = useAnthologyStore((state) => state.setAudioElement);
  const currentTrack = useAnthologyStore((state) => state.audio.currentTrack);
  const playbackState = useAnthologyStore((state) => state.audio.playbackState);
  const responseNodes = useAnthologyStore((state) => state.data.responseNodes);
  const conversations = useAnthologyStore((state) => state.data.conversations);
  const updateCurrentTime = useAnthologyStore((state) => state.updateCurrentTime);
  const stop = useAnthologyStore((state) => state.stop);

  // Create and register audio element on mount
  useEffect(() => {
    // Create audio element
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    // Register with store
    setAudioElement(audio);

    // Cleanup on unmount
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      audio.pause();
      audio.src = '';
      setAudioElement(null);
      audioRef.current = null;
    };
  }, [setAudioElement]);

  // Handle global audio playback
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !currentTrack) return;

    const currentNode = responseNodes.get(currentTrack);
    if (!currentNode) return;

    const conversation = conversations.get(currentNode.conversation_id);
    if (!conversation) return;

    // Use the audio_file from conversation data, removing the leading "./"
    const audioFilePath = conversation.audio_file.replace('./', '/');
    const { audio_start, audio_end } = currentNode;

    // Monitor playback and auto-stop at segment end
    const monitorPlayback = () => {
      if (!audioElement || audioElement.paused) {
        rafRef.current = null;
        return;
      }

      const currentTimeMs = audioElement.currentTime * 1000;
      const relativeTime = currentTimeMs - audio_start;
      updateCurrentTime(Math.max(0, relativeTime));

      // Check if we've reached segment end
      if (currentTimeMs >= audio_end) {
        audioElement.pause();
        audioElement.currentTime = audio_start / 1000;
        updateCurrentTime(0);
        stop();
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(monitorPlayback);
    };

    // Handle playback state
    if (playbackState === 'playing') {
      // Load audio if needed
      if (audioElement.src !== audioFilePath) {
        audioElement.src = audioFilePath;
      }

      // Set position to segment start if not in segment
      const currentTimeMs = audioElement.currentTime * 1000;
      if (currentTimeMs < audio_start || currentTimeMs >= audio_end) {
        audioElement.currentTime = audio_start / 1000;
      }

      // Start playback
      audioElement.play().catch(console.error);

      // Start monitoring
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(monitorPlayback);
      }
    } else if (playbackState === 'paused') {
      audioElement.pause();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    } else if (playbackState === 'idle') {
      audioElement.pause();
      audioElement.currentTime = audio_start / 1000;
      updateCurrentTime(0);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    // Cleanup
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [currentTrack, playbackState, responseNodes, conversations, updateCurrentTime, stop]);

  // Component renders nothing - audio element is managed internally
  return null;
};
