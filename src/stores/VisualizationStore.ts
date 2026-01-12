/**
 * Visualization Store - manages D3 force simulation and rendering
 * Keeps D3 state separate from React state as per Design.md
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import * as d3 from 'd3';
import type { GraphNode, GraphEdge } from '@types';
import type { VisualizationState, VisualizationActions } from '@types';

interface VisualizationStoreType extends VisualizationState, VisualizationActions { }

export const useVisualizationStore = create<VisualizationStoreType>()(
  devtools(
    (set, get) => ({
      // ============ Initial State ============

      simulation: null,
      simulationNodes: [], // D3-mutated nodes with positions
      originalPositions: new Map(), // Store original UMAP positions for restoration
      svgRef: null,
      containerRef: null,
      centerOnNode: null, // Zoom utility function
      resetZoom: null, // Reset zoom utility function
      needsUpdate: false,
      isSimulating: false,
      isPhysicsEnabled: false,
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

        // Create a set of valid node IDs for validation
        const nodeIds = new Set(nodes.map(n => n.id));

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
          })
          // Filter out edges that reference non-existent nodes
          .filter(edge => {
            const sourceExists = nodeIds.has(edge.source as string);
            const targetExists = nodeIds.has(edge.target as string);

            if (!sourceExists || !targetExists) {
              console.warn(`Edge references missing node - source: ${edge.source} (${sourceExists}), target: ${edge.target} (${targetExists})`);
              return false;
            }
            return true;
          });

        // Use provided dimensions or defaults
        const centerX = width ? width / 2 : window.innerWidth / 2;
        const centerY = height ? height / 2 : (window.innerHeight - 100) / 2;

        // Create force simulation with optimized forces for good spread
        const simulation = d3.forceSimulation(d3Nodes)
          .force('link', d3.forceLink(d3Links)
            .id((d: any) => d.id)
            .distance(150) // Keep distance
            .strength(0.005)) // Increased strength for fluid chain-pulling
          .force('charge', d3.forceManyBody()
            .strength(-1) // Reduced repulsion to prevent explosion
            .distanceMax(800)) // Keep range
          .force('center', d3.forceCenter(centerX, centerY)
            .strength(0.08)) // Stronger centering to keep floating nodes on screen
          .force('collision', d3.forceCollide()
            .radius((d: any) => {
              // Optimized radii to match visual sizes and prevent overlap
              if (d.type === 'question') return 95; // Covers ~190px width (180px pill + padding)
              if (d.data?.pull_quote) return 140; // Covers ~280px width for pull quotes
              return 10; // Matches 10px visual hover radius for standard nodes
            })
            .strength(0.1)) // Max collision strength to strictly enforce spacing
          .force('x', d3.forceX(centerX).strength(0.01)) // Stronger X centering
          .force('y', d3.forceY(centerY).strength(0.01)); // Stronger Y centering

        // Configure simulation
        simulation
          .velocityDecay(0.9) // Friction: Higher = more viscous (honey-like)
          .alphaDecay(0.05) // Faster cooling to settle quicker
          .alphaMin(0.001); // Threshold to stop simulation

        // Pre-warm simulation: run several ticks before first render
        // This settles nodes closer to their final positions for better initial display
        // Increased to 100 ticks for better initial distribution
        // Pre-warm simulation: run several ticks before first render
        // Reduced to 50 ticks as high viscosity prevents explosion anyway
        for (let i = 0; i < 50; i++) {
          simulation.tick();
        }

        // Store original positions for later restoration (UMAP semantic positions)
        const originalPositions = new Map<string, { x: number; y: number }>();
        d3Nodes.forEach(node => {
          if (typeof node.x === 'number' && typeof node.y === 'number') {
            originalPositions.set(node.id, { x: node.x, y: node.y });
          }
        });

        // Store simulation AND the D3-mutated node array
        set({
          simulation,
          simulationNodes: d3Nodes, // Store reference to D3's node array
          originalPositions, // Store original UMAP positions
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
      },

      setResetZoom: (fn: ((duration?: number) => void) | null) => {
        set({ resetZoom: fn });
      },

      togglePhysics: () => {
        const { isPhysicsEnabled, simulationNodes, simulation } = get();
        const newState = !isPhysicsEnabled;

        // Apply state change to nodes immediately
        simulationNodes.forEach(node => {
          if (node.type === 'response' || node.type === 'question') {
            if (newState) {
              // Enable physics: Unpin so forces take over
              node.fx = undefined;
              node.fy = undefined;
            } else {
              // Disable physics: Pin at current location
              node.fx = node.x;
              node.fy = node.y;
            }
          }
        });

        if (simulation) {
          simulation.alpha(0.3).restart();
        }

        set({ isPhysicsEnabled: newState });
      },

      // Animate nodes to their original UMAP semantic positions
      // Nodes fly smoothly to targets, then unlock after animation completes
      restoreOriginalPositions: (animationDuration: number = 800) => {
        const { simulationNodes, originalPositions, simulation } = get();

        // Set target positions as fixed points - nodes will be pulled toward them
        // Don't set x/y directly - let the simulation animate the transition
        simulationNodes.forEach(node => {
          const originalPos = originalPositions.get(node.id);
          if (originalPos) {
            // Pin to target position - simulation will animate nodes toward these
            node.fx = originalPos.x;
            node.fy = originalPos.y;
          }
        });

        if (simulation) {
          // High alpha for energetic animation, moderate decay for smooth movement
          simulation
            .velocityDecay(0.3) // Lower friction for smoother flying
            .alpha(0.8) // High energy to drive animation
            .restart();
        }

        set({ needsUpdate: true, isPhysicsEnabled: false });

        // Unlock physics after animation completes so nodes can still move
        setTimeout(() => {
          const { simulationNodes: nodes, simulation: sim } = get();
          nodes.forEach(node => {
            // Unpin all nodes
            node.fx = undefined;
            node.fy = undefined;
          });
          if (sim) {
            // Restore normal velocity decay and restart with gentle alpha
            sim.velocityDecay(0.9).alpha(0.3).restart();
          }
          set({ isPhysicsEnabled: true, needsUpdate: true });
        }, animationDuration);
      },

      // Set force strengths based on view mode
      setForceStrengths: (mode: 'narrative' | 'question') => {
        const { simulation } = get();
        if (!simulation) return;

        if (mode === 'question') {
          // Very strong forces for question view - edges act like strings
          const linkForce = simulation.force('link') as d3.ForceLink<any, any>;
          if (linkForce) {
            linkForce.strength(0.8); // Very strong link pull - like strings (was 0.005)
            linkForce.distance(80); // Short distance - pull nodes close
          }

          const chargeForce = simulation.force('charge') as d3.ForceManyBody<any>;
          if (chargeForce) {
            chargeForce.strength(-100); // Strong repulsion to spread nodes (was -1)
          }

          const centerForce = simulation.force('center') as d3.ForceCenter<any>;
          if (centerForce) {
            centerForce.strength(0.05); // Moderate centering
          }

          // Reduce velocity decay for more responsive movement
          simulation.velocityDecay(0.4);
        } else {
          // Narrative view - restore original weak forces
          const linkForce = simulation.force('link') as d3.ForceLink<any, any>;
          if (linkForce) {
            linkForce.strength(0.005); // Original weak strength
            linkForce.distance(150); // Original distance
          }

          const chargeForce = simulation.force('charge') as d3.ForceManyBody<any>;
          if (chargeForce) {
            chargeForce.strength(-1); // Original weak repulsion
          }

          const centerForce = simulation.force('center') as d3.ForceCenter<any>;
          if (centerForce) {
            centerForce.strength(0.08); // Original centering
          }

          // Restore original velocity decay
          simulation.velocityDecay(0.9);
        }

        // Reheat simulation to apply new forces
        simulation.alpha(0.5).restart();
      }
    }),
    {
      name: 'visualization-store'
    }
  )
);