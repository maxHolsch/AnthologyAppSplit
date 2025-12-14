/**
 * AudioPlayer Component
 *
 * Container component that connects ResponsePlayButton to audio store.
 * Manages audio playback for individual response nodes using the global audio element.
 */

import { memo, useCallback } from 'react';
import { useAnthologyStore } from '@stores';
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
  const play = useAnthologyStore((state) => state.play);
  const pause = useAnthologyStore((state) => state.pause);
  const seek = useAnthologyStore((state) => state.seek);

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
