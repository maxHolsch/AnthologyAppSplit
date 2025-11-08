import { useEffect, useState, useMemo } from 'react';
import { MapCanvas } from '@components/Map';
import { useAnthologyStore } from '@stores';
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

  // Convert maps to arrays (memoized to prevent infinite loops)
  const nodes = useMemo(() => Array.from(nodesMap.values()), [nodesMap]);
  const edges = useMemo(() => Array.from(edgesMap.values()), [edgesMap]);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

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

        // Load data with viewport dimensions
        await loadData(data, dimensions.width, dimensions.height - 100);
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
      <header className="app-header">
        <h1>Anthology</h1>
        <p className="subtitle">Community Stories Visualized</p>
        <div className="stats">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} connections</span>
        </div>
      </header>

      <main className="app-main">
        <MapCanvas
          width={dimensions.width}
          height={dimensions.height - 100} // Account for header
          className="map-canvas"
        />
      </main>
    </div>
  );
}

export default App;
