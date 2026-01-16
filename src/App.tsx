import { useEffect, useState, useRef } from 'react';
import { MapCanvas } from '@components/Map';
import { CommentRail } from '@components/Rail';
import { Tooltip } from '@components/UI/Tooltip';
import { NotificationContainer } from '@components/UI/Notification';
import { PhysicsControl } from '@components/UI/PhysicsControl';
import { Legend } from '@components/UI/Legend';
import { AudioManager } from '@components/Audio/AudioManager';
import { AddYourVoiceButton } from '@/components/AddYourVoice/AddYourVoiceButton';
import { useAnthologyStore, useInteractionStore } from '@stores';
import { GraphDataService } from '@/services';
import './App.css';

/**
 * Main Anthology Application Component
 * Integrates the visual map with state management
 */
function App({ anthologySlug }: { anthologySlug?: string }) {
  console.log('[App] rendered with anthologySlug:', anthologySlug);
  const loadData = useAnthologyStore(state => state.loadData);
  const isLoading = useAnthologyStore(state => state.data.isLoading);
  const error = useAnthologyStore(state => state.data.loadError);
  // Tooltip state
  const tooltipContent = useInteractionStore(state => state.tooltipContent);
  const tooltipPos = useInteractionStore(state => state.tooltipPos);

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Map now takes full width since rail floats on top
  const mapWidth = dimensions.width;

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load data from Supabase (with JSON fallback)
  const dataLoadedRef = useRef(false);

  useEffect(() => {
    if (dataLoadedRef.current) return;

    const loadAnthologyData = async () => {
      try {
        dataLoadedRef.current = true;
        // Try loading from Supabase first
        console.log('[App] Fetching data from Supabase...');
        const data = await GraphDataService.loadAll({ anthologySlug });

        if (data.conversations.length > 0) {
          console.log('✅ Loaded data from Supabase');
          await loadData(data);
          return;
        }

        // Fallback to JSON if Supabase has no data
        console.warn('⚠️  No data in Supabase, falling back to JSON');
        const response = await fetch('/6798_phase2_3_template.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData = await response.json();
        await loadData(jsonData);

      } catch (error) {
        console.error('Error loading anthology data:', error);

        // Final fallback to JSON
        try {
          console.log('📄 Attempting JSON fallback...');
          const response = await fetch('/6798_phase2_3_template.json');
          const jsonData = await response.json();
          await loadData(jsonData);
        } catch (fallbackError) {
          console.error('Failed to load from both Supabase and JSON:', fallbackError);
        }
      }
    };

    loadAnthologyData();
  }, [loadData, anthologySlug]); // Removed dimensions from dependencies to prevent resize loops

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading Anthology...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error Loading Data</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Global notification popup system */}
      <NotificationContainer />

      {/* Global audio manager - handles all audio playback */}
      <AudioManager />

      {/* Global "add your vioce" entry point */}
      <AddYourVoiceButton anthologySlug={anthologySlug} />

      {/* Physics Control Toggle */}
      <PhysicsControl />

      {/* Legend */}
      <Legend />

      <main className="app-main">
        <div className="map-container" style={{ width: mapWidth }}>
          <MapCanvas
            width={mapWidth}
            height={dimensions.height} // Full viewport height
            className="map-canvas"
          />
        </div>
        <CommentRail anthologySlug={anthologySlug} />
      </main>

      {/* Tooltip overlay - rendered at app level for proper positioning */}
      <Tooltip
        content={tooltipContent}
        position={tooltipPos}
        visible={!!tooltipContent && !!tooltipPos}
      />
    </div>
  );
}

export default App;
