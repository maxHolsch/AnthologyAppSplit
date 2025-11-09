import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useVisualizationStore } from '@stores';
import type { GraphNode, GraphEdge } from '@types';

/**
 * Core D3 force simulation hook
 * Manages the D3 force-directed graph simulation lifecycle
 * Syncs with VisualizationStore for state management
 */
export function useD3(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
) {
  const simulation = useVisualizationStore(state => state.simulation);
  const initSimulation = useVisualizationStore(state => state.initSimulation);
  const updateSimulation = useVisualizationStore(state => state.updateSimulation);

  const nodesRef = useRef<GraphNode[]>(nodes);
  const edgesRef = useRef<GraphEdge[]>(edges);

  // Update refs when data changes
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  // Initialize simulation when nodes are loaded
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current && nodes.length > 0 && edges.length > 0) {
      // Initialize simulation through store (handles all setup)
      initSimulation(nodes, edges, width, height);
      hasInitialized.current = true;
    }
  }, [nodes.length, edges.length, initSimulation, width, height]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      const currentSim = useVisualizationStore.getState().simulation;
      if (currentSim) {
        currentSim.stop();
      }
    };
  }, []);

  // Update simulation when nodes/edges change
  useEffect(() => {
    if (simulation && nodes.length > 0) {
      updateSimulation();
    }
  }, [nodes.length, edges.length, simulation, updateSimulation]);

  // Update center force when dimensions change
  useEffect(() => {
    if (simulation) {
      simulation
        .force('center', d3.forceCenter(width / 2, height / 2))
        .alpha(0.3)
        .restart();
    }
  }, [width, height]);

  // Reheat simulation function for user interactions
  const reheat = (alpha: number = 0.3) => {
    if (simulation) {
      simulation.alpha(alpha).restart();
    }
  };

  // Fix node position (for dragging)
  const fixNode = (nodeId: string, x: number, y: number) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      node.fx = x;
      node.fy = y;
      reheat(0.1);
    }
  };

  // Unfix node position (release from drag)
  const unfixNode = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      node.fx = undefined;
      node.fy = undefined;
      reheat(0.1);
    }
  };

  return {
    simulation,
    reheat,
    fixNode,
    unfixNode
  };
}
