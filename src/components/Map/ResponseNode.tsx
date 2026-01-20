import { useAnthologyStore } from '@stores';
import type { ResponseNodeProps } from '@types';
import { SyncIcon, AsyncAudioIcon, AsyncTextIcon } from '@components/Icons/NodeIcons';

/**
 * Response node component - circular nodes for standard responses
 * 14px diameter circles with conversation colors
 */
export function ResponseNode({ node, onClick, onMouseEnter, onMouseLeave }: ResponseNodeProps) {
  const selectedNodes = useAnthologyStore(state => state.selection.selectedNodes);
  const hoveredNode = useAnthologyStore(state => state.selection.hoveredNode);
  const hoveredNodes = useAnthologyStore(state => state.selection.hoveredNodes);
  const narrativeColorAssignments = useAnthologyStore(state => state.data.narrativeColorAssignments);
  const currentTrack = useAnthologyStore(state => state.audio.currentTrack);
  const playbackState = useAnthologyStore(state => state.audio.playbackState);

  const isSelected = selectedNodes.has(node.id);
  const isHovered = hoveredNode === node.id || hoveredNodes.has(node.id);
  const isPlaying = currentTrack === node.id && playbackState === 'playing';

  // Calculate overlay visibility based on hover state (priority) and selection state
  const anyHovered = hoveredNodes.size > 0;
  const anySelected = selectedNodes.size > 0;
  const isHighlightedByHover = hoveredNodes.has(node.id);
  const isHighlightedBySelection = selectedNodes.has(node.id);

  // Hover takes priority over selection
  const shouldShowOverlay = anyHovered
    ? !isHighlightedByHover  // If hovering, show overlay on non-hovered nodes
    : (anySelected ? !isHighlightedBySelection : false); // Else if selected, show overlay on non-selected nodes

  // Get position with fallback
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // Get narrative color if response belongs to a narrative
  const narrativeId = node.data.type === 'response'
    ? node.data.responds_to_narrative_id
    : null;
  const narrativeColor = narrativeId
    ? narrativeColorAssignments.get(narrativeId)
    : null;

  // Priority: node.color (from store) || narrative color || grey fallback
  const colorScheme = node.color || narrativeColor || '#999999';

  // Use full color always (no opacity adjustment)
  const color = colorScheme;

  // Determine visual style based on medium and synchronicity
  const responseData = node.data.type === 'response' ? node.data : null;
  const medium = responseData?.medium; // 'audio' | 'text' | undefined
  const synchronicity = responseData?.synchronicity; // 'sync' | 'asynchronous' | undefined

  // Visual logic:
  // - Sync nodes (or undefined/legacy): Sync icon (filled circle)
  // - Async audio nodes: AsyncAudio icon (outlined circle with inner fill)
  // - Async text nodes: AsyncText icon (outlined diamond with inner fill)
  const isSyncOrLegacy = !synchronicity || synchronicity === 'sync';
  const isAsync = synchronicity === 'asynchronous';
  const isTextMedium = medium === 'text';
  const isSquareShape = isAsync && isTextMedium;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(node);
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    onMouseEnter?.(node, e);
  };

  const handleMouseLeave = () => {
    onMouseLeave?.(node);
  };

  return (
    <g
      className="node-group"
      data-node-id={node.id}
      transform={`translate(${x}, ${y})`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      {/* Pulsing ring for playing state */}
      {isPlaying && !isSquareShape && (
        <circle
          r={7}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={0.6}
          pointerEvents="none"
        >
          <animate
            attributeName="r"
            values="7;12;7"
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-opacity"
            values="0.6;0;0.6"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      {isPlaying && isSquareShape && (
        <rect
          x={-7}
          y={-7}
          width={14}
          height={14}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={0.6}
          pointerEvents="none"
        >
          <animate
            attributeName="width"
            values="14;24;14"
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="height"
            values="14;24;14"
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="x"
            values="-7;-12;-7"
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y"
            values="-7;-12;-7"
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-opacity"
            values="0.6;0;0.6"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </rect>
      )}

      {/* Main shape - SVG Icons based on synchronicity and medium */}
      <foreignObject
        x={-7}
        y={-7}
        width={14}
        height={14}
        style={{
          pointerEvents: 'all',
          overflow: 'visible',
        }}
      >
        {isSyncOrLegacy && <SyncIcon color={color} size={14} />}
        {isAsync && !isTextMedium && <AsyncAudioIcon color={color} size={14} />}
        {isAsync && isTextMedium && <AsyncTextIcon color={color} size={14} />}
      </foreignObject>

      {/* Overlay for dimming when not highlighted */}
      {shouldShowOverlay && !isSquareShape && (
        <circle
          r={7}
          fill="#F6F6F1"
          fillOpacity={0.8}
          pointerEvents="none"
        />
      )}
      {shouldShowOverlay && isSquareShape && (
        <rect
          x={-7}
          y={-7}
          width={14}
          height={14}
          fill="#F6F6F1"
          fillOpacity={0.8}
          pointerEvents="none"
        />
      )}

      {/* Selection indicator */}
      {isSelected && !isSquareShape && (
        <circle
          r={9}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.5}
          pointerEvents="none"
        />
      )}
      {isSelected && isSquareShape && (
        <rect
          x={-9}
          y={-9}
          width={18}
          height={18}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.5}
          pointerEvents="none"
        />
      )}
    </g>
  );
}
