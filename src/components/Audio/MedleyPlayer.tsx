/**
 * MedleyPlayer Component
 *
 * Container component that connects MedleyPlayButton to audio store.
 * Manages shuffle/medley playback for multiple response nodes.
 */

import { memo, useCallback } from 'react';
import { useAnthologyStore } from '@stores/AnthologyStore';
import { MedleyPlayButton } from '@components/Rail/Components/MedleyPlayButton';

interface MedleyPlayerProps {
  responseIds: string[];
}

export const MedleyPlayer = memo<MedleyPlayerProps>(({ responseIds }) => {
  // Get store state - use separate selectors to avoid object creation
  const currentTrack = useAnthologyStore((state) => state.audio.currentTrack);
  const playbackState = useAnthologyStore((state) => state.audio.playbackState);
  const playbackMode = useAnthologyStore((state) => state.audio.playbackMode);
  const shufflePlay = useAnthologyStore((state) => state.shufflePlay);
  const pause = useAnthologyStore((state) => state.pause);

  // Check if we're currently in shuffle mode and playing
  const isPlaying = playbackState === 'playing' && playbackMode === 'shuffle';

  // Handle play action - start shuffle playback
  const handlePlay = useCallback(() => {
    shufflePlay(responseIds);
  }, [shufflePlay, responseIds]);

  // Handle pause action
  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  return (
    <MedleyPlayButton
      responseIds={responseIds}
      isPlaying={isPlaying}
      currentPlayingId={currentTrack}
      onPlay={handlePlay}
      onPause={handlePause}
    />
  );
});

MedleyPlayer.displayName = 'MedleyPlayer';
