import { useCallback } from 'react';
import * as d3 from 'd3';
import { useInteractionStore } from '@stores';
import type { GraphNode } from '@types';

/**
 * D3 drag behavior hook for node interactions
 * Manages node dragging with simulation integration
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
        // Prevent click events during drag
        event.sourceEvent.stopPropagation();

        // Update interaction store
        startDrag(d.id, { x: event.x, y: event.y });

        // Reheat simulation for smooth dragging
        if (!event.active) {
          simulation.alphaTarget(0.3).restart();
        }

        // Fix node position
        d.fx = d.x;
        d.fy = d.y;

        // Call custom handler
        onDragStart?.(d);
      })
      .on('drag', (event, d) => {
        // Update node position
        d.fx = event.x;
        d.fy = event.y;

        // Update interaction store
        updateDrag({ x: event.x, y: event.y });
      })
      .on('end', (event, d) => {
        // Cool down simulation
        if (!event.active) {
          simulation.alphaTarget(0);
        }

        // Unfix node position (let simulation control it again)
        // Comment these out if you want nodes to stay where dropped
        d.fx = undefined;
        d.fy = undefined;

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
