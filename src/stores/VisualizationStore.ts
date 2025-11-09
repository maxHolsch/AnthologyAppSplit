/**
 * Visualization Store - manages D3 force simulation and rendering
 * Keeps D3 state separate from React state as per Design.md
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import * as d3 from 'd3';
import type { GraphNode, GraphEdge } from '@types';
import type { VisualizationState, VisualizationActions } from '@types';

interface VisualizationStoreType extends VisualizationState, VisualizationActions {}

export const useVisualizationStore = create<VisualizationStoreType>()(
  devtools(
    (set, get) => ({
      // ============ Initial State ============

      simulation: null,
      simulationNodes: [], // D3-mutated nodes with positions
      svgRef: null,
      containerRef: null,
      centerOnNode: null, // Zoom utility function
      needsUpdate: false,
      isSimulating: false,
      tickCount: 0, // Increments on each simulation tick
      renderFrameRate: 60,
      nodeCount: 0,
      edgeCount: 0,

      // ============ Actions ============

      initSimulation: (nodes: GraphNode[], edges: GraphEdge[], width?: number, height?: number) => {
        // Stop existing simulation if any
        const currentSim = get().simulation;
        if (currentSim) {
          currentSim.stop();
        }

        // Use nodes directly - D3 will mutate them with x, y, vx, vy
        // This is THE CRITICAL FIX - don't copy, let D3 mutate the actual objects
        const d3Nodes = nodes;

        const d3Links = edges
          .filter(edge => edge.source && edge.target) // Filter out edges with null source/target
          .map(edge => {
            const sourceId = typeof edge.source === 'string'
              ? edge.source
              : edge.source?.id || '';
            const targetId = typeof edge.target === 'string'
              ? edge.target
              : edge.target?.id || '';

            return {
              ...edge,
              source: sourceId,
              target: targetId
            };
          });

        // Use provided dimensions or defaults
        const centerX = width ? width / 2 : window.innerWidth / 2;
        const centerY = height ? height / 2 : (window.innerHeight - 100) / 2;

        // Create force simulation with optimized forces for good spread
        const simulation = d3.forceSimulation(d3Nodes)
          .force('link', d3.forceLink(d3Links)
            .id((d: any) => d.id)
            .distance(150) // Increased distance for more spread
            .strength(0.5)) // Reduced strength for less pulling together
          .force('charge', d3.forceManyBody()
            .strength(-400) // Increased repulsion for more spread
            .distanceMax(800)) // Increased distance for wider effect
          .force('center', d3.forceCenter(centerX, centerY)
            .strength(0.05)) // Very weak centering to allow spread
          .force('collision', d3.forceCollide()
            .radius((d: any) => {
              // Optimized radii to match visual sizes and prevent overlap
              // Increased question radius for better spacing between questions
              if (d.type === 'question') return 130; // Increased from 90 for more spacing between questions
              if (d.data?.pull_quote) return 120; // ~half of 204px width for pull quote rectangles
              return 10; // Close to 7px visual radius for standard circle nodes
            })
            .strength(0.95)) // Increased collision strength to enforce spacing
          .force('x', d3.forceX(centerX).strength(0.02)) // Very weak X centering
          .force('y', d3.forceY(centerY).strength(0.02)); // Very weak Y centering

        // Configure simulation
        simulation
          .velocityDecay(0.6) // Friction
          .alphaDecay(0.01) // How quickly simulation cools down
          .alphaMin(0.001); // Threshold to stop simulation

        // Pre-warm simulation: run several ticks before first render
        // This settles nodes closer to their final positions for better initial display
        // Increased to 100 ticks for better initial distribution
        for (let i = 0; i < 100; i++) {
          simulation.tick();
        }

        // Store simulation AND the D3-mutated node array
        set({
          simulation,
          simulationNodes: d3Nodes, // Store reference to D3's node array
          isSimulating: true,
          nodeCount: nodes.length,
          edgeCount: edges.length
        });

        // Listen for simulation events
        simulation.on('tick', () => {
          set(state => ({
            needsUpdate: true,
            tickCount: state.tickCount + 1 // Force React re-render
          }));
        });

        simulation.on('end', () => {
          set({ isSimulating: false });
        });

        // Trigger initial render with pre-warmed positions
        set({ needsUpdate: true });
      },

      updateSimulation: () => {
        const simulation = get().simulation;
        if (!simulation) return;

        // Reheat simulation for smooth transitions
        simulation.alpha(0.3).restart();
        set({ isSimulating: true });
      },

      stopSimulation: () => {
        const simulation = get().simulation;
        if (!simulation) return;

        simulation.stop();
        set({ isSimulating: false });
      },

      restartSimulation: () => {
        const simulation = get().simulation;
        if (!simulation) return;

        simulation.alpha(1).restart();
        set({ isSimulating: true });
      },

      setSvgRef: (ref: SVGSVGElement | null) => {
        set({ svgRef: ref });
      },

      setContainerRef: (ref: SVGGElement | null) => {
        set({ containerRef: ref });
      },

      setNeedsUpdate: (needsUpdate: boolean) => {
        set({ needsUpdate });
      },

      requestUpdate: () => {
        set({ needsUpdate: true });
      },

      updateComplete: () => {
        set({ needsUpdate: false });
      },

      getNodePosition: (nodeId: string) => {
        const { simulationNodes } = get();
        const node = simulationNodes.find(n => n.id === nodeId);

        if (node && typeof node.x === 'number' && typeof node.y === 'number') {
          return { x: node.x, y: node.y };
        }

        return null;
      },

      setCenterOnNode: (fn: ((nodeX: number, nodeY: number, targetScale?: number, duration?: number) => void) | null) => {
        set({ centerOnNode: fn });
      }
    }),
    {
      name: 'visualization-store'
    }
  )
);