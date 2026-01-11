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
  const setActiveNarrative = useAnthologyStore(state => state.setActiveNarrative);
  const setRailMode = useAnthologyStore(state => state.setRailMode);
  const hoverNodes = useAnthologyStore(state => state.hoverNodes);

  // Get position with fallback
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // Get narrative data
  const narrativeData = node.data.type === 'narrative_label' ? node.data : null;
  if (!narrativeData) return null;

  const narrativeName = narrativeData.narrative_name;
  const narrativeColor = narrativeData.narrative_color;
  const narrativeId = narrativeData.narrative_id;

  // Calculate opacity based on hover state
  const anyHovered = hoveredNodes.size > 0;
  const isHighlighted = hoveredNodes.has(node.id);
  const opacity = anyHovered ? (isHighlighted ? 1.0 : 0.3) : 1.0;

  // Calculate inverse scale for semantic zoom (label stays same size)
  const inverseScale = 1 / mapTransform.k;

  // Pill dimensions
  const padding = 12;
  const fontSize = 14;
  const height = 32;

  // Estimate width based on text length (rough approximation)
  const charWidth = 8.5; // Average character width at 14px
  const textWidth = narrativeName.length * charWidth;
  const width = textWidth + padding * 2;

  // Click handler: Open narrative view in side panel
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveNarrative(narrativeId);
    setRailMode('narrative');
  }, [narrativeId, setActiveNarrative, setRailMode]);

  // Hover handler: Highlight all responses and questions in this narrative
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    // Find all responses in this narrative
    const narrativeResponseIds: string[] = [];
    responseNodes.forEach((response, responseId) => {
      const narrativeIds = response.metadata?.narrative_ids || [];
      if (narrativeIds.includes(narrativeId)) {
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
      <g transform={`scale(${inverseScale})`} opacity={opacity}>
        {/* Pill background */}
        <rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          rx={height / 2}
          fill={narrativeColor}
          fillOpacity={0.9}
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeOpacity={0.5}
          pointerEvents="all"
          style={{
            filter: 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.2))',
          }}
        />

        {/* Label text */}
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontFamily="Hedvig Letters Sans, sans-serif"
          fontWeight={600}
          fill="#FFFFFF"
          pointerEvents="none"
          style={{
            userSelect: 'none',
          }}
        >
          {narrativeName}
        </text>
      </g>
    </g>
  );
}
