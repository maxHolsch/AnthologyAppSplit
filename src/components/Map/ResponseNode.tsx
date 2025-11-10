import { useAnthologyStore } from '@stores';
import type { ResponseNodeProps } from '@types';
import { getCircleColor } from '@utils/colorUtils';

/**
 * Response node component - circular nodes for standard responses
 * 14px diameter circles with conversation colors
 */
export function ResponseNode({ node, onClick, onMouseEnter, onMouseLeave }: ResponseNodeProps) {
  const selectedNodes = useAnthologyStore(state => state.selection.selectedNodes);
  const hoveredNode = useAnthologyStore(state => state.selection.hoveredNode);
  const conversations = useAnthologyStore(state => state.data.conversations);
  const speakerColorAssignments = useAnthologyStore(state => state.data.speakerColorAssignments);
  const currentTrack = useAnthologyStore(state => state.audio.currentTrack);
  const playbackState = useAnthologyStore(state => state.audio.playbackState);

  const isSelected = selectedNodes.has(node.id);
  const isHovered = hoveredNode === node.id;
  const isPlaying = currentTrack === node.id && playbackState === 'playing';

  // Get position with fallback
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // Get speaker color scheme from node, speaker assignments, or fallback to conversation color
  const conversationId = node.data.type === 'response' ? node.data.conversation_id : null;
  const speakerName = node.data.type === 'response' ? node.data.speaker_name : null;
  const conversation = conversationId ? conversations.get(conversationId) : null;

  const speakerColorKey = conversationId && speakerName ? `${conversationId}:${speakerName}` : null;
  const speakerColorScheme = speakerColorKey ? speakerColorAssignments.get(speakerColorKey)?.color : null;

  const colorScheme = node.color || speakerColorScheme || conversation?.color || '#999999'; // Default to grey

  // Get appropriate color based on selection state (no opacity adjustment needed)
  const anySelected = selectedNodes.size > 0;
  const color = getCircleColor(colorScheme, isSelected, anySelected);

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
      {isHovered && (
        <circle
          r={10}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={0.3}
          pointerEvents="none"
        />
      )}

      {/* Pulsing ring for playing state */}
      {isPlaying && (
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

      {/* Main circle */}
      <circle
        r={7} // 14px diameter = 7px radius
        fill={color}
        style={{
          pointerEvents: 'all',
          transition: 'fill 200ms ease',
        }}
      />

      {/* Selection indicator (optional subtle ring) */}
      {isSelected && (
        <circle
          r={9}
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
