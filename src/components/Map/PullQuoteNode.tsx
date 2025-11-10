import { useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { getQuoteBackgroundColor, getQuoteTextColor } from '@utils/colorUtils';
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

  // Get speaker color scheme from node, speaker assignments, or fallback to conversation color
  const conversationId = node.data.type === 'response' ? node.data.conversation_id : null;
  const speakerName = node.data.type === 'response' ? node.data.speaker_name : null;
  const conversation = conversationId ? conversations.get(conversationId) : null;

  const speakerColorKey = conversationId && speakerName ? `${conversationId}:${speakerName}` : null;
  const speakerColorScheme = speakerColorKey ? speakerColorAssignments.get(speakerColorKey)?.color : null;

  const colorScheme = node.color || speakerColorScheme || conversation?.color || '#999999'; // Default to grey

  // Get appropriate colors based on selection state
  const anySelected = selectedNodes.size > 0;
  const colors = useMemo(() => {
    const bgColor = getQuoteBackgroundColor(colorScheme, isSelected, anySelected);
    const textColor = getQuoteTextColor(colorScheme, isSelected, anySelected);

    return { bgColor, textColor };
  }, [colorScheme, isSelected, anySelected]);

  // Calculate text opacity (0.3 for faded, 1 for selected or no selection)
  const textOpacity = anySelected && !isSelected ? 0.3 : 1;

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
    // Removed minHeight to allow content to determine height with consistent padding

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
    // Calculate actual text height: fontSize for first line + lineHeight for subsequent lines
    const textHeight = fontSize + ((numLines - 1) * lineHeight);
    let contentHeight = textHeight + (padding * 2);

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

  // Get base circle color for stroke effects (selected state)
  const baseColor = typeof colorScheme === 'string' ? colorScheme : (colorScheme.circle || '#FF5F1F');

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
          transition: 'fill 200ms ease',
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
        y={-height / 2 + padding}
        style={{
          userSelect: 'none',
          pointerEvents: 'none',
          transition: 'fill 200ms ease, opacity 200ms ease',
        }}
      >
        {lines.map((line, i) => (
          <tspan
            key={i}
            x={-width / 2 + padding}
            dy={i === 0 ? 0 : lineHeight}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
