import { useEffect, useState, useMemo } from 'react';
import { MapCanvas } from '@components/Map';
import { CommentRail } from '@components/Rail';
import { Tooltip } from '@components/UI/Tooltip';
import { AudioManager } from '@components/Audio/AudioManager';
import { useAnthologyStore, useInteractionStore } from '@stores';
import './App.css';

/**
 * Main Anthology Application Component
 * Integrates the visual map with state management
 */
function App() {
  const loadData = useAnthologyStore(state => state.loadData);
  const nodesMap = useAnthologyStore(state => state.data.nodes);
  const edgesMap = useAnthologyStore(state => state.data.edges);
  const isLoading = useAnthologyStore(state => state.data.isLoading);
  const error = useAnthologyStore(state => state.data.loadError);
  const railWidth = useAnthologyStore(state => state.view.railWidth);
  const railExpanded = useAnthologyStore(state => state.view.railExpanded);

  // Tooltip state
  const tooltipContent = useInteractionStore(state => state.tooltipContent);
  const tooltipPos = useInteractionStore(state => state.tooltipPos);

  // Convert maps to arrays (memoized to prevent infinite loops)
  const nodes = useMemo(() => Array.from(nodesMap.values()), [nodesMap]);
  const edges = useMemo(() => Array.from(edgesMap.values()), [edgesMap]);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Calculate map width based on rail state
  const mapWidth = railExpanded ? dimensions.width - railWidth : dimensions.width;

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

  // Load real data from anthology_template.json
  useEffect(() => {
    const loadAnthologyData = async () => {
      try {
        const response = await fetch('/anthology_template.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Load data (positions will be calculated by D3 simulation)
        await loadData(data);
      } catch (error) {
        console.error('Error loading anthology data:', error);
      }
    };

    loadAnthologyData();
  }, [loadData, dimensions.width, dimensions.height]);

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
      {/* Global audio manager - handles all audio playback */}
      <AudioManager />

      <header className="app-header">
        <h1>Anthology</h1>
        <p className="subtitle">Community Stories Visualized</p>
        <div className="stats">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} connections</span>
        </div>
      </header>

      <main className="app-main">
        <div className="map-container" style={{ width: mapWidth }}>
          <MapCanvas
            width={mapWidth}
            height={dimensions.height - 100} // Account for header
            className="map-canvas"
          />
        </div>
        <CommentRail />
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
