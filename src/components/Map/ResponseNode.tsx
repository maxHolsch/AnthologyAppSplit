import { useAnthologyStore } from '@stores';
import type { ResponseNodeProps } from '@types';

/**
 * Response node component - circular nodes for standard responses
 * 14px diameter circles with conversation colors
 */
export function ResponseNode({ node, onClick, onMouseEnter, onMouseLeave }: ResponseNodeProps) {
  const selectedNodes = useAnthologyStore(state => state.selection.selectedNodes);
  const hoveredNode = useAnthologyStore(state => state.selection.hoveredNode);
  const conversations = useAnthologyStore(state => state.data.conversations);

  const isSelected = selectedNodes.has(node.id);
  const isHovered = hoveredNode === node.id;

  // Get position with fallback
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // Get conversation color from node or conversations map
  const conversationId = node.data.type === 'response' ? node.data.conversation_id : null;
  const conversation = conversationId ? conversations.get(conversationId) : null;
  const color = node.color || conversation?.color || '#FF5F1F'; // Default to orange

  // Calculate opacity based on selection state
  let opacity = 1;
  if (selectedNodes.size > 0) {
    opacity = isSelected ? 1 : 0.3; // 30% for unselected when something is selected
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(node);
  };

  const handleMouseEnter = () => {
    onMouseEnter?.(node);
  };

  const handleMouseLeave = () => {
    onMouseLeave?.(node);
  };

  return (
    <g
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

      {/* Main circle */}
      <circle
        r={7} // 14px diameter = 7px radius
        fill={color}
        fillOpacity={opacity}
        style={{
          pointerEvents: 'all',
          transition: 'fill-opacity 200ms ease',
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
