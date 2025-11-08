import { useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { getPullQuoteTextColor, getPullQuoteBackgroundColor } from '@utils/colorUtils';
import type { PullQuoteNodeProps } from '@types';

/**
 * Pull quote node component - rectangle nodes with quoted text
 * Larger nodes displaying featured excerpts from responses
 */
export function PullQuoteNode({ node, onClick, onMouseEnter, onMouseLeave }: PullQuoteNodeProps) {
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
  const baseColor = node.color || conversation?.color || '#FF5F1F';

  // Calculate colors based on Figma specs
  const colors = useMemo(() => {
    // Use Figma-exact colors or calculated fallback
    const bgColor = getPullQuoteBackgroundColor(baseColor);
    const textColor = getPullQuoteTextColor(baseColor);

    return { bgColor, textColor };
  }, [baseColor]);

  // Calculate opacity based on selection state
  let opacity = 1;
  if (selectedNodes.size > 0) {
    opacity = isSelected ? 1 : 0.3; // 30% for unselected
  }

  // Dimensions from Figma
  const width = 204;
  const height = 146;
  const padding = 12;
  const borderRadius = 8;
  const textWidth = 180;

  // Get pull quote text from node data
  const pullQuoteText = node.data.type === 'response' ? (node.data.pull_quote || '') : '';

  // Split text into lines (simplified - real implementation would need proper text wrapping)
  const lines = useMemo(() => {
    const text = pullQuoteText;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    // Approximate word wrapping (12 chars ≈ 1 word average)
    const maxCharsPerLine = 30;

    words.forEach((word: string) => {
      if ((currentLine + word).length > maxCharsPerLine && currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    });

    if (currentLine.trim().length > 0) {
      lines.push(currentLine.trim());
    }

    return lines;
  }, [pullQuoteText]);

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
      opacity={opacity}
    >
      {/* Hover border */}
      {isHovered && (
        <rect
          x={-width / 2 - 2}
          y={-height / 2 - 2}
          width={width + 4}
          height={height + 4}
          rx={borderRadius + 2}
          fill="none"
          stroke={baseColor}
          strokeWidth={2}
          strokeOpacity={0.3}
          pointerEvents="none"
        />
      )}

      {/* Background rectangle */}
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={borderRadius}
        fill={colors.bgColor}
        style={{
          pointerEvents: 'all',
          transition: 'opacity 200ms ease',
        }}
      />

      {/* Selection border */}
      {isSelected && (
        <rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          rx={borderRadius}
          fill="none"
          stroke={baseColor}
          strokeWidth={1.5}
          strokeOpacity={0.5}
          pointerEvents="none"
        />
      )}

      {/* Pull quote text */}
      <text
        textAnchor="start"
        dominantBaseline="hanging"
        fontSize={12}
        fontFamily="Hedvig Letters Sans, sans-serif"
        fontWeight={400}
        fill={colors.textColor}
        style={{
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {lines.map((line, i) => (
          <tspan
            key={i}
            x={-textWidth / 2}
            dy={i === 0 ? padding : 16.8} // First line offset by padding, others by line-height
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
