import { useAnthologyStore } from '@stores';
import type { ResponseNodeProps } from '@types';
import { getCircleColor } from '@utils';
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

  // Get appropriate color based on selection state (no opacity adjustment needed)
  const anySelected = selectedNodes.size > 0;
  const color = getCircleColor(colorScheme, isSelected, anySelected);

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
      {/* Hover ring */}
      {isHovered && !isSquareShape && (
        <circle
          r={10}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={0.3}
          pointerEvents="none"
        />
      )}
      {isHovered && isSquareShape && (
        <rect
          x={-10}
          y={-10}
          width={20}
          height={20}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={0.3}
          pointerEvents="none"
        />
      )}

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
