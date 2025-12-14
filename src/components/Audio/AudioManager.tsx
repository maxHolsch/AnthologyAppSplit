/**
 * AudioManager Component
 *
 * Manages global audio playback and coordinates with store.
 * Creates a single shared audio element for the entire app.
 * Handles playback for all modes (single, shuffle, medley).
 */

import { useEffect, useRef } from 'react';
import { useAnthologyStore } from '@stores';

export const AudioManager: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const setAudioElement = useAnthologyStore((state) => state.setAudioElement);
  const currentTrack = useAnthologyStore((state) => state.audio.currentTrack);
  const playbackState = useAnthologyStore((state) => state.audio.playbackState);
  const storeCurrentTime = useAnthologyStore((state) => state.audio.currentTime);
  const responseNodes = useAnthologyStore((state) => state.data.responseNodes);
  const conversations = useAnthologyStore((state) => state.data.conversations);
  const updateCurrentTime = useAnthologyStore((state) => state.updateCurrentTime);
  const pause = useAnthologyStore((state) => state.pause);

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

    // Prefer per-response recording if present; otherwise fall back to the conversation audio.
    // Note: conversation audio_file may be a relative path like "./recordings/1635.mp3".
    const audioFilePathRaw = currentNode.path_to_recording || conversation.audio_file;
    const audioFilePath = audioFilePathRaw.startsWith('./')
      ? audioFilePathRaw.replace('./', '/')
      : audioFilePathRaw;
    const { audio_start, audio_end } = currentNode;

    const waitForEvent = (event: keyof HTMLMediaElementEventMap, timeoutMs = 3000) => {
      return new Promise<void>((resolve) => {
        let settled = false;
        const onEvent = () => {
          if (settled) return;
          settled = true;
          audioElement.removeEventListener(event, onEvent);
          resolve();
        };
        audioElement.addEventListener(event, onEvent, { once: true });
        setTimeout(() => {
          if (settled) return;
          settled = true;
          audioElement.removeEventListener(event, onEvent);
          resolve();
        }, timeoutMs);
      });
    };

    const ensureMetadataLoaded = async () => {
      // HAVE_METADATA = 1
      if (audioElement.readyState >= 1) return;
      await waitForEvent('loadedmetadata');
    };

    const seekToMs = async (targetMs: number) => {
      const targetSeconds = targetMs / 1000;
      // If we're already near the target, don't seek.
      if (Math.abs(audioElement.currentTime - targetSeconds) < 0.05) return;
      const seeked = waitForEvent('seeked');
      audioElement.currentTime = targetSeconds;
      await seeked;
    };

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
        // Keep the audio at the end position so the last word can remain highlighted.
        const finalRelativeTime = audio_end - audio_start;
        updateCurrentTime(finalRelativeTime);
        // Don't clear currentTrack; just pause.
        pause();
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(monitorPlayback);
    };

    let cancelled = false;

    // Handle playback state
    if (playbackState === 'playing') {
      const startPlayback = async () => {
        // Load audio if needed
        // NOTE: `audioElement.src` becomes an absolute URL; `audioFilePath` may be relative or absolute.
        // We still compare directly; if mismatch, we set src (safe).
        if (audioElement.src !== audioFilePath) {
          audioElement.src = audioFilePath;
        }

        // For segments that start far into the file, we must wait for metadata before seeking,
        // otherwise some browsers ignore the seek and playback starts at 0.
        await ensureMetadataLoaded();
        if (cancelled) return;

        // Seek into the segment if needed
        const currentTimeMs = audioElement.currentTime * 1000;
        if (currentTimeMs < audio_start || currentTimeMs >= audio_end) {
          await seekToMs(audio_start);
        }
        if (cancelled) return;

        // Start playback
        await audioElement.play().catch(console.error);
        if (cancelled) return;

        // Start monitoring
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(monitorPlayback);
        }
      };

      startPlayback();
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
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [currentTrack, playbackState, responseNodes, conversations, updateCurrentTime, pause]);

  // Handle seek operations (store.currentTime is ms relative to the segment start)
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !currentTrack) return;

    const currentNode = responseNodes.get(currentTrack);
    if (!currentNode) return;

    const { audio_start } = currentNode;
    const absoluteTimeMs = audio_start + storeCurrentTime;
    const currentAudioTimeMs = audioElement.currentTime * 1000;

    // Only update if significantly different (avoid feedback loop)
    if (Math.abs(currentAudioTimeMs - absoluteTimeMs) > 150) {
      audioElement.currentTime = absoluteTimeMs / 1000;
    }
  }, [currentTrack, storeCurrentTime, responseNodes]);

  // Component renders nothing - audio element is managed internally
  return null;
};
