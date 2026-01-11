/**
 * NarrativeView - Shows a narrative with all its connected responses
 * Similar to QuestionView but for narratives
 */

import { memo, useCallback, useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { BackButton } from '../Components/BackButton';
import { ResponseTile } from '../Components/ResponseTile';
import { MedleyPlayer } from '@components/Audio/MedleyPlayer';
import { KaraokeDisplay } from './KaraokeDisplay';
import styles from './QuestionView.module.css'; // Reuse QuestionView styles

// Narrative names mapping (should match AnthologyStore)
const NARRATIVE_NAMES: Record<string, string> = {
  'N1': 'The Silicon Valley Illusion',
  'N2': 'Reclaiming Human Agency',
  'N3': 'The Myth of AI Objectivity',
  'N4': 'Progress at What Cost',
  'N5': 'The Humanity Behind the Job',
  'N6': 'Tech Culture as Masculine Risk-Taking',
  'N7': 'AI Creating New Problems',
  'N8': 'The Erosion of Human Capability',
  'N9': 'Demystifying the Black Box',
};

export const NarrativeView = memo(() => {
  const activeNarrative = useAnthologyStore(state => state.view.activeNarrative);
  const getResponsesForNarrative = useAnthologyStore(state => state.getResponsesForNarrative);
  const selectResponse = useAnthologyStore(state => state.selectResponse);
  const hoverNode = useAnthologyStore(state => state.hoverNode);
  const currentTrack = useAnthologyStore(state => state.audio.currentTrack);
  const playbackState = useAnthologyStore(state => state.audio.playbackState);
  const setActiveNarrative = useAnthologyStore(state => state.setActiveNarrative);
  const zoomToFullMap = useAnthologyStore(state => state.zoomToFullMap);

  // Get all responses for this narrative
  const responses = useMemo(() => {
    if (!activeNarrative) return [];
    return getResponsesForNarrative(activeNarrative);
  }, [activeNarrative, getResponsesForNarrative]);

  const responseIds = useMemo(() => {
    return responses.map(r => r.id);
  }, [responses]);

  const narrativeName = activeNarrative ? NARRATIVE_NAMES[activeNarrative] || activeNarrative : '';

  const handleBackClick = useCallback(() => {
    // Zoom out to full map view before changing rail mode
    zoomToFullMap();
    // Clear active narrative (which will also set railMode to 'narratives')
    setActiveNarrative(null);
  }, [zoomToFullMap, setActiveNarrative]);

  const handleResponseClick = useCallback((responseId: string) => {
    selectResponse(responseId);
  }, [selectResponse]);

  const handleResponseHover = useCallback((responseId: string | null) => {
    hoverNode(responseId);
  }, [hoverNode]);

  if (!activeNarrative) {
    return (
      <div className={styles.emptyState}>
        <p>No narrative selected</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Back Button */}
      <div className={styles.backButtonContainer}>
        <BackButton onClick={handleBackClick} />
      </div>

      {/* Narrative Section Label */}
      <p className={styles.sectionLabel}>Narrative</p>

      {/* Narrative Name */}
      <h2 className={styles.questionText}>{narrativeName}</h2>

      {/* Large Play Button (Medley Player) */}
      {responses.length > 0 && (
        <div className={styles.playButtonContainer}>
          <MedleyPlayer responseIds={responseIds} />
        </div>
      )}

      {/* Karaoke Display - Only shows when audio is actively playing */}
      {currentTrack && playbackState === 'playing' && (
        <div className={styles.karaokeSection}>
          <KaraokeDisplay responseId={currentTrack} />
        </div>
      )}

      {/* Responses Section Label */}
      <p className={styles.responsesLabel}>EXCERPTS</p>

      {/* Responses List */}
      <div className={styles.responsesSection}>
        {responses.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No excerpts available for this narrative</p>
          </div>
        ) : (
          <div className={styles.responseList}>
            {responses.map((response, index) => (
              <ResponseTile
                key={response.id}
                response={response}
                onClick={handleResponseClick}
                onHover={handleResponseHover}
                showSeparator={index < responses.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

NarrativeView.displayName = 'NarrativeView';
