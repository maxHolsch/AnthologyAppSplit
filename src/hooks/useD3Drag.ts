import { useCallback } from 'react';
import * as d3 from 'd3';
import { useInteractionStore } from '@stores';
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
  onDragStart?: (node: GraphNode) => void,
  onDragEnd?: (node: GraphNode) => void
) {
  const startDrag = useInteractionStore(state => state.startDrag);
  const updateDrag = useInteractionStore(state => state.updateDrag);
  const endDrag = useInteractionStore(state => state.endDrag);

  // Create drag behavior
  const createDragBehavior = useCallback(() => {
    if (!simulation) return null;

    return d3.drag<SVGElement, GraphNode>()
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

        // Type-specific node behavior:
        // - Question nodes stay fixed where dropped (maintain fx/fy)
        // - Response and pull quote nodes release to continue natural movement
        if (d.type !== 'question') {
          d.fx = undefined;
          d.fy = undefined;
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
