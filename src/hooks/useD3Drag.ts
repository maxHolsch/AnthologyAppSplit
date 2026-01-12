import { useCallback } from 'react';
import * as d3 from 'd3';
import { useInteractionStore, useVisualizationStore } from '@stores';
import type { GraphNode } from '@types';

/**
 * D3 drag behavior hook for node interactions
 * Manages node dragging with simulation integration
 *
 * Behavior:
 * - Question nodes: Stay fixed where dropped (fx/fy maintained)
 * - Response nodes: Release after drag (continue natural simulation movement)
 * - Zoom/pan interference prevented during all drag phases
 */
export function useD3Drag(
  simulation: d3.Simulation<GraphNode, undefined> | null,
  containerRef: React.RefObject<SVGGElement | null>,
  onDragStart?: (node: GraphNode) => void,
  onDragEnd?: (node: GraphNode) => void
) {
  const startDrag = useInteractionStore(state => state.startDrag);
  const updateDrag = useInteractionStore(state => state.updateDrag);
  const endDrag = useInteractionStore(state => state.endDrag);

  // Create drag behavior
  const createDragBehavior = useCallback(() => {
    if (!simulation) return null;

    const behavior = d3.drag<SVGElement, GraphNode>();

    // Set container to ensure local coordinates (fixing flying bug on zoom)
    if (!containerRef.current) {
      console.warn('Drag behavior initialization skipped: containerRef is null');
      return null;
    }
    behavior.container(containerRef.current);

    return behavior
      .on('start', (event, d) => {
        // Prevent zoom/pan interference during drag
        event.sourceEvent.stopPropagation();

        if (!d) return;

        // Update interaction store
        startDrag(d.id, { x: event.x, y: event.y });

        // Reheat simulation for smooth dragging
        if (!event.active) {
          simulation.alphaTarget(0.25).restart();
        }

        // Fix node position during drag
        d.fx = d.x;
        d.fy = d.y;

        // Call custom handler
        onDragStart?.(d);
      })
      .on('drag', (event, d) => {
        // Prevent zoom/pan interference during drag
        event.sourceEvent.stopPropagation();

        if (!d) return;


        // Update node position
        d.fx = event.x;
        d.fy = event.y;

        // Update interaction store
        updateDrag({ x: event.x, y: event.y });
      })
      .on('end', (event, d) => {
        // Prevent zoom/pan interference on release
        event.sourceEvent.stopPropagation();

        if (!d) return;


        // Cool down simulation
        if (!event.active) {
          simulation.alphaTarget(0);
        }

        // All nodes follow the global physics state after drag:
        // - Physics enabled: release node to follow simulation forces
        // - Physics disabled: keep node pinned where dropped
        const isPhysicsEnabled = useVisualizationStore.getState().isPhysicsEnabled;

        if (isPhysicsEnabled) {
          d.fx = undefined;
          d.fy = undefined;
        } else {
          // Keep pinned where dropped
          d.fx = d.x;
          d.fy = d.y;
        }

        // Update interaction store
        endDrag();

        // Call custom handler
        onDragEnd?.(d);
      });
  }, [simulation, startDrag, updateDrag, endDrag, onDragStart, onDragEnd]);

  return {
    createDragBehavior
  };
}
