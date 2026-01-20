import { useAnthologyStore } from '@stores';
import { useCallback } from 'react';
import type { GraphNode } from '@types';

/**
 * Narrative Label Node component - floating wayfinding labels
 * Pill-shaped badges that show narrative names in the visualization
 *
 * Visual specifications:
 * - Shape: Rounded rectangle (pill)
 * - Background: Narrative color
 * - Text: White, 14px, centered
 * - Semantic zoom: Size stays constant regardless of zoom level
 * - Physics: Participates in force simulation with strong collision
 *
 * Interactions:
 * - Click: Opens narrative view in side panel
 * - Hover: Highlights all responses and questions in that narrative
 */

interface NarrativeLabelNodeProps {
  node: GraphNode;
  onClick?: (node: GraphNode) => void;
  onMouseEnter?: (node: GraphNode, e: React.MouseEvent) => void;
  onMouseLeave?: (node: GraphNode) => void;
}

export function NarrativeLabelNode({ node, onClick, onMouseEnter, onMouseLeave }: NarrativeLabelNodeProps) {
  const mapTransform = useAnthologyStore(state => state.view.mapTransform);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);
  const edges = useAnthologyStore(state => state.data.edges);
  const hoveredNodes = useAnthologyStore(state => state.selection.hoveredNodes);
  const selectNarrative = useAnthologyStore(state => state.selectNarrative);
  const hoverNodes = useAnthologyStore(state => state.hoverNodes);

  // Get position with fallback
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // Get narrative data
  if (node.type !== 'narrative_label') return null;
  const narrativeData = node.data as any;

  const narrativeName = narrativeData.narrative_name;
  const narrativeColor = narrativeData.narrative_color;
  const narrativeId = narrativeData.narrative_id;

  // Calculate overlay visibility based on hover state (priority) and selection state
  const selectedNodes = useAnthologyStore(state => state.selection.selectedNodes);
  const anyHovered = hoveredNodes.size > 0;
  const anySelected = selectedNodes.size > 0;
  const isHighlightedByHover = hoveredNodes.has(node.id);
  const isHighlightedBySelection = selectedNodes.has(node.id);

  // Hover takes priority over selection
  const shouldShowOverlay = anyHovered
    ? !isHighlightedByHover  // If hovering, show overlay on non-hovered nodes
    : (anySelected ? !isHighlightedBySelection : false); // Else if selected, show overlay on non-selected nodes

  // Calculate inverse scale for semantic zoom (label stays same size)
  const inverseScale = 1 / mapTransform.k;

  // Pill dimensions
  const paddingHorizontal = 10; // Consistent horizontal padding
  const fontSize = 10;
  const height = 24;

  // Calculate width based on monospace character width (DM Mono)
  const charWidth = 6.0; // Exact character width at 10px for DM Mono
  const textWidth = narrativeName.length * charWidth;
  const width = textWidth + paddingHorizontal * 2;

  // Click handler: Open narrative view in side panel and select all related nodes
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    selectNarrative(narrativeId);
  }, [narrativeId, selectNarrative]);

  // Hover handler: Highlight all responses and questions in this narrative
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    // Find all responses in this narrative
    const narrativeResponseIds: string[] = [];
    responseNodes.forEach((response, responseId) => {
      if (response.responds_to_narrative_id === narrativeId) {
        narrativeResponseIds.push(responseId);
      }
    });

    // Find all questions connected to these responses
    const connectedQuestionIds = new Set<string>();
    edges.forEach(edge => {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source?.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target?.id;

      // Check if response is source or target
      if (narrativeResponseIds.includes(sourceId)) {
        // Source is a narrative response, target might be a question
        const targetNode = responseNodes.get(targetId);
        if (!targetNode) {
          // It's a question node
          connectedQuestionIds.add(targetId);
        }
      } else if (narrativeResponseIds.includes(targetId)) {
        // Target is a narrative response, source might be a question
        const sourceNode = responseNodes.get(sourceId);
        if (!sourceNode) {
          // It's a question node
          connectedQuestionIds.add(sourceId);
        }
      }
    });

    // Combine response and question IDs, plus this label's own ID
    const allNodeIds = [...narrativeResponseIds, ...Array.from(connectedQuestionIds), node.id];
    hoverNodes(allNodeIds);
  }, [narrativeId, responseNodes, edges, hoverNodes, node.id]);

  const handleMouseLeave = useCallback(() => {
    hoverNodes([]);
  }, [hoverNodes]);

  return (
    <g
      className="narrative-label-node node-group"
      data-node-id={node.id}
      transform={`translate(${x}, ${y})`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      {/* Semantic zoom group - maintains constant size */}
      <g transform={`scale(${inverseScale})`}>
        {/* Pill background */}
        <rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          rx={height / 2}
          fill={narrativeColor}
          fillOpacity={1.0}
          pointerEvents="all"
        />

        {/* Label text */}
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontFamily="DM Mono, monospace"
          fontWeight={400}
          fill="#FFFFFF"
          pointerEvents="none"
          style={{
            userSelect: 'none',
          }}
        >
          {narrativeName}
        </text>

        {/* Overlay for dimming when not highlighted */}
        {shouldShowOverlay && (
          <rect
            x={-width / 2}
            y={-height / 2}
            width={width}
            height={height}
            rx={height / 2}
            fill="#F6F6F1"
            fillOpacity={0.8}
            pointerEvents="none"
          />
        )}
      </g>
    </g>
  );
}
