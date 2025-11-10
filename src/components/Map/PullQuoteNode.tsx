import { useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { getPullQuoteTextColor, getPullQuoteBackgroundColor } from '@utils';
import type { PullQuoteNodeProps } from '@types';

/**
 * Pull quote node component - rectangle nodes with quoted text
 * Larger nodes displaying featured excerpts from responses
 */
export function PullQuoteNode({ node, onClick, onMouseEnter, onMouseLeave }: PullQuoteNodeProps) {
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

  // Get speaker color from node, speaker assignments, or fallback to conversation color
  const conversationId = node.data.type === 'response' ? node.data.conversation_id : null;
  const speakerName = node.data.type === 'response' ? node.data.speaker_name : null;
  const conversation = conversationId ? conversations.get(conversationId) : null;

  const speakerColorKey = conversationId && speakerName ? `${conversationId}:${speakerName}` : null;
  const speakerColor = speakerColorKey ? speakerColorAssignments.get(speakerColorKey)?.color : null;

  const baseColor = node.color || speakerColor || conversation?.color || '#FF5F1F';

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

  // Get pull quote text from node data
  const pullQuoteText = node.data.type === 'response' ? (node.data.pull_quote || '') : '';

  // Constants for sizing
  const padding = 16; // Horizontal and vertical padding
  const borderRadius = 8;
  const fontSize = 12;
  const lineHeight = 16.8;
  const charWidth = 7; // Approximate width per character in px at fontSize 12

  // Calculate dynamic dimensions based on text content
  const { width, height, lines } = useMemo(() => {
    const text = pullQuoteText;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    // Minimum dimensions
    const minWidth = 150;
    const minHeight = 80;

    // Calculate optimal width based on text length
    // Aim for ~30-40 characters per line for readability
    const idealCharsPerLine = 35;

    // Calculate approximate chars per line to fit within ratio constraint
    let maxCharsPerLine = idealCharsPerLine;

    // Wrap text into lines
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

    // Calculate dimensions based on content
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    let textWidth = Math.max(longestLine * charWidth, minWidth - (padding * 2));
    let contentWidth = textWidth + (padding * 2);

    const numLines = lines.length;
    let contentHeight = (numLines * lineHeight) + (padding * 2);
    contentHeight = Math.max(contentHeight, minHeight);

    // Apply 3:1 ratio constraint (width ≤ 3 * height)
    const maxWidth = contentHeight * 3;
    if (contentWidth > maxWidth) {
      // Need to reflow text to fit ratio constraint
      contentWidth = maxWidth;
      textWidth = contentWidth - (padding * 2);

      // Re-wrap text with new width constraint
      const newMaxCharsPerLine = Math.floor(textWidth / charWidth);
      lines.length = 0; // Clear array
      currentLine = '';

      words.forEach((word: string) => {
        if ((currentLine + word).length > newMaxCharsPerLine && currentLine.length > 0) {
          lines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine += word + ' ';
        }
      });

      if (currentLine.trim().length > 0) {
        lines.push(currentLine.trim());
      }

      // Recalculate height with new line count
      contentHeight = (lines.length * lineHeight) + (padding * 2);
      contentHeight = Math.max(contentHeight, minHeight);

      // Ensure we still meet the ratio after recalculation
      if (contentWidth > contentHeight * 3) {
        contentWidth = contentHeight * 3;
        textWidth = contentWidth - (padding * 2);
      }
    }

    return {
      width: contentWidth,
      height: contentHeight,
      lines
    };
  }, [pullQuoteText]);

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
      opacity={opacity}
    >
      {/* Pulsing border for playing state */}
      {isPlaying && (
        <rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          rx={borderRadius}
          fill="none"
          stroke={baseColor}
          strokeWidth={2}
          strokeOpacity={0.6}
          pointerEvents="none"
        >
          <animate
            attributeName="stroke-width"
            values="2;4;2"
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-opacity"
            values="0.6;0.3;0.6"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </rect>
      )}

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

      {/* Pull quote text - left-justified with 16px padding */}
      <text
        textAnchor="start"
        dominantBaseline="hanging"
        fontSize={fontSize}
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
            x={-width / 2 + padding}
            dy={i === 0 ? padding : lineHeight}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
