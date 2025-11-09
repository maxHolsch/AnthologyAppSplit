/**
 * AudioPlayer Component
 *
 * Container component that connects ResponsePlayButton to audio store.
 * Manages audio playback for individual response nodes using the global audio element.
 */

import { memo, useCallback, useEffect, useRef } from 'react';
import { useAnthologyStore } from '@stores/AnthologyStore';
import { ResponsePlayButton } from '@components/Rail/Components/ResponsePlayButton';
import type { ResponseNode } from '@types';

interface AudioPlayerProps {
  response: ResponseNode;
}

export const AudioPlayer = memo<AudioPlayerProps>(({ response }) => {
  // Get store state - use separate selectors to avoid object creation
  const currentTrack = useAnthologyStore((state) => state.audio.currentTrack);
  const playbackState = useAnthologyStore((state) => state.audio.playbackState);
  const currentTime = useAnthologyStore((state) => state.audio.currentTime);
  const audioElement = useAnthologyStore((state) => state.audio.audioElement);
  const play = useAnthologyStore((state) => state.play);
  const pause = useAnthologyStore((state) => state.pause);
  const seek = useAnthologyStore((state) => state.seek);
  const updateCurrentTime = useAnthologyStore((state) => state.updateCurrentTime);
  const stop = useAnthologyStore((state) => state.stop);

  const responseNodes = useAnthologyStore((state) => state.data.responseNodes);
  const conversations = useAnthologyStore((state) => state.data.conversations);

  const rafRef = useRef<number | null>(null);

  // Check if this response is currently playing
  const isPlaying = currentTrack === response.id && playbackState === 'playing';

  // Calculate duration for this response segment
  const duration = response.audio_end - response.audio_start;

  // Handle play action
  const handlePlay = useCallback(() => {
    play(response.id);
  }, [play, response.id]);

  // Handle pause action
  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  // Handle seek action
  const handleSeek = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek]
  );

  // Handle actual audio playback when store state changes
  useEffect(() => {
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
        // Keep the audio at the end position (don't rewind)
        // Keep currentTime at the end so the last word stays highlighted
        const finalRelativeTime = audio_end - audio_start;
        updateCurrentTime(finalRelativeTime);
        // Don't call stop() - keep currentTrack so karaoke display stays visible
        // Just pause the playback state
        pause();
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

    // Cleanup on unmount or state change
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [audioElement, currentTrack, playbackState, responseNodes, conversations, updateCurrentTime, stop]);

  // Handle seek operations
  useEffect(() => {
    if (!audioElement || currentTrack !== response.id) return;

    const currentNode = responseNodes.get(currentTrack);
    if (!currentNode) return;

    const { audio_start } = currentNode;
    const absoluteTime = audio_start + currentTime;

    // Only update if significantly different (avoid feedback loop)
    const currentAudioTime = audioElement.currentTime * 1000;
    if (Math.abs(currentAudioTime - absoluteTime) > 100) {
      audioElement.currentTime = absoluteTime / 1000;
    }
  }, [audioElement, currentTrack, currentTime, response.id, responseNodes]);

  return (
    <ResponsePlayButton
      response={response}
      isPlaying={isPlaying}
      currentTime={currentTrack === response.id ? currentTime : 0}
      duration={duration}
      onPlay={handlePlay}
      onPause={handlePause}
      onSeek={handleSeek}
    />
  );
});

AudioPlayer.displayName = 'AudioPlayer';
