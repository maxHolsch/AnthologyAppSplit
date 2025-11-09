import { useEffect, useRef, useState, useMemo } from 'react';
import { useAnthologyStore, useVisualizationStore } from '@stores';
import { useD3, useD3Zoom } from '@hooks';
import { D3Visualization } from './D3Visualization';
import type { MapCanvasProps } from '@types';

/**
 * MapCanvas - Main SVG container for the force-directed graph
 * Manages D3 simulation, zoom/pan behavior, and rendering
 */
export function MapCanvas({ width = 800, height = 600, className }: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<SVGGElement>(null);

  const nodesMap = useAnthologyStore(state => state.data.nodes);
  const edgesMap = useAnthologyStore(state => state.data.edges);
  const clearSelection = useAnthologyStore(state => state.clearSelection);
  const setSvgRef = useVisualizationStore(state => state.setSvgRef);
  const setContainerRef = useVisualizationStore(state => state.setContainerRef);
  const setCenterOnNode = useVisualizationStore(state => state.setCenterOnNode);

  // Convert maps to arrays (memoized to prevent infinite loops)
  const nodes = useMemo(() => Array.from(nodesMap.values()), [nodesMap]);
  const edges = useMemo(() => Array.from(edgesMap.values()), [edgesMap]);

  const [dimensions, setDimensions] = useState({ width, height });

  // Initialize D3 simulation
  useD3(
    nodes,
    edges,
    dimensions.width,
    dimensions.height
  );

  // Initialize zoom behavior
  const { centerOnNode } = useD3Zoom(svgRef, containerRef, {
    minZoom: 0.5,
    maxZoom: 3,
    initialZoom: 1
  });

  // Store refs and zoom utilities in VisualizationStore
  useEffect(() => {
    if (svgRef.current) {
      setSvgRef(svgRef.current);
    }
    if (containerRef.current) {
      setContainerRef(containerRef.current);
    }
    // Register zoom utility for use by selection actions
    setCenterOnNode(centerOnNode);

    return () => {
      // Cleanup on unmount
      setCenterOnNode(null);
    };
  }, [setSvgRef, setContainerRef, setCenterOnNode, centerOnNode]);

  // Update dimensions when props change
  useEffect(() => {
    setDimensions({ width, height });
  }, [width, height]);

  // Handle background click (deselect all)
  const handleBackgroundClick = (e: React.MouseEvent) => {
    // Only clear selection if clicking directly on the SVG background
    // Not on any child elements (nodes, edges, etc.)
    if (e.target === svgRef.current || e.target === containerRef.current) {
      clearSelection();
    }
  };

  return (
    <svg
      ref={svgRef}
      width={dimensions.width}
      height={dimensions.height}
      className={className}
      style={{
        background: '#F6F6F1',
        cursor: 'grab',
      }}
      onClick={handleBackgroundClick}
    >
      {/* Zoomable container */}
      <g ref={containerRef} className="zoom-container">
        {/* D3 Visualization */}
        <D3Visualization />
      </g>
    </svg>
  );
}
