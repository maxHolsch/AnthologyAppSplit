import { useEffect, useCallback, useMemo } from 'react';
import { useAnthologyStore, useVisualizationStore, useInteractionStore } from '@stores';
import { useD3Drag } from '@hooks';
import { QuestionNode } from './QuestionNode';
import { ResponseNode } from './ResponseNode';
import { PullQuoteNode } from './PullQuoteNode';
import { EdgePath } from './EdgePath';
import { getEdgeOpacity } from '@utils';
import type { GraphNode, GraphEdge } from '@types';

/**
 * D3Visualization component - bridges D3 simulation with React rendering
 * Handles node position updates and renders all graph elements
 */
export function D3Visualization() {
  const nodesMap = useAnthologyStore(state => state.data.nodes);
  const edgesMap = useAnthologyStore(state => state.data.edges);
  const selectNode = useAnthologyStore(state => state.selectNode);
  const hoverNode = useAnthologyStore(state => state.hoverNode);
  const selectedNodes = useAnthologyStore(state => state.selection.selectedNodes);

  // Convert maps to arrays (memoized to prevent infinite loops)
  const nodes = useMemo(() => Array.from(nodesMap.values()), [nodesMap]);
  const edges = useMemo(() => Array.from(edgesMap.values()), [edgesMap]);

  const simulation = useVisualizationStore(state => state.simulation);
  const needsUpdate = useVisualizationStore(state => state.needsUpdate);
  const setNeedsUpdate = useVisualizationStore(state => state.setNeedsUpdate);

  const showTooltip = useInteractionStore(state => state.showTooltip);
  const hideTooltip = useInteractionStore(state => state.hideTooltip);

  // Create drag behavior
  useD3Drag(
    simulation,
    (node) => {
      // On drag start, show which node is being dragged
      console.log('Dragging node:', node.id);
    },
    (node) => {
      // On drag end
      console.log('Released node:', node.id);
    }
  );

  // Force re-render when simulation ticks
  useEffect(() => {
    if (needsUpdate) {
      setNeedsUpdate(false);
    }
  }, [needsUpdate, setNeedsUpdate]);

  // Handle node click
  const handleNodeClick = useCallback((node: GraphNode) => {
    selectNode(node.id);

    // Center on node in future phase (zoom integration)
    // const { centerOnNode } = useD3Zoom(...);
    // centerOnNode(node.x ?? 0, node.y ?? 0, 1.5);
  }, [selectNode]);

  // Handle node hover
  const handleNodeMouseEnter = useCallback((node: GraphNode) => {
    hoverNode(node.id);

    // Show tooltip
    if (node.data.type === 'question') {
      showTooltip(node.data.question_text, 0, 0, node.id);
    } else if (node.data.type === 'response') {
      const preview = node.data.speaker_text.slice(0, 100) + (node.data.speaker_text.length > 100 ? '...' : '');
      showTooltip(preview, 0, 0, node.id);
    }
  }, [hoverNode, showTooltip]);

  const handleNodeMouseLeave = useCallback(() => {
    hoverNode(null);
    hideTooltip();
  }, [hoverNode, hideTooltip]);

  // Apply drag behavior to nodes via D3 (would need ref access)
  // This is a simplified version - full implementation would use d3.select()

  // Helper function to check if node has valid position
  const hasValidPosition = (node: GraphNode): boolean => {
    return typeof node.x === 'number' &&
           typeof node.y === 'number' &&
           !isNaN(node.x) &&
           !isNaN(node.y);
  };

  // Separate nodes by type (with position validation)
  const questionNodes = nodes.filter((n: GraphNode) =>
    n.type === 'question' && hasValidPosition(n)
  );
  const responseNodesWithPullQuote = nodes.filter((n: GraphNode) =>
    n.type === 'response' && (n.data as any).pull_quote && hasValidPosition(n)
  );
  const responseNodesStandard = nodes.filter((n: GraphNode) =>
    n.type === 'response' && !(n.data as any).pull_quote && hasValidPosition(n)
  );

  return (
    <g className="visualization-layer">
      {/* Render edges first (background layer) */}
      <g className="edges">
        {edges.map((edge: GraphEdge) => {
          // Safely extract source and target IDs with null checks
          if (!edge.source || !edge.target) {
            return null;
          }

          const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
          const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;

          if (!sourceId || !targetId) {
            return null;
          }

          const sourceNode = nodes.find((n: GraphNode) => n.id === sourceId);
          const targetNode = nodes.find((n: GraphNode) => n.id === targetId);

          // Validate both nodes exist and have valid positions
          if (!sourceNode || !targetNode ||
              !hasValidPosition(sourceNode) || !hasValidPosition(targetNode)) {
            return null;
          }

          const sourceSelected = selectedNodes.has(sourceId);
          const targetSelected = selectedNodes.has(targetId);
          const anySelected = selectedNodes.size > 0;

          const opacity = getEdgeOpacity(sourceSelected, targetSelected, anySelected);
          const edgeId = `${sourceId}-${targetId}`;

          return (
            <EdgePath
              key={edgeId}
              edge={edge}
              sourceNode={sourceNode}
              targetNode={targetNode}
              color={edge.color || '#000000'}
              opacity={opacity}
            />
          );
        })}
      </g>

      {/* Render nodes (foreground layer) */}
      <g className="nodes">
        {/* Standard response nodes (circles) - render first (background) */}
        {responseNodesStandard.map((node: GraphNode) => (
          <ResponseNode
            key={node.id}
            node={node}
            onClick={handleNodeClick}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
          />
        ))}

        {/* Pull quote response nodes (rectangles) - render second (middle) */}
        {responseNodesWithPullQuote.map((node: GraphNode) => (
          <PullQuoteNode
            key={node.id}
            node={node}
            onClick={handleNodeClick}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
          />
        ))}

        {/* Question nodes - render last (foreground/on top) */}
        {questionNodes.map((node: GraphNode) => (
          <QuestionNode
            key={node.id}
            node={node}
            onClick={handleNodeClick}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
          />
        ))}
      </g>
    </g>
  );
}
