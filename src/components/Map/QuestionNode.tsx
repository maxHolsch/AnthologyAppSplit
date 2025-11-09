import { useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import type { QuestionNodeProps } from '@types';

/**
 * Question node component - text with rounded pill background and semantic zoom
 * Background and text maintain constant screen size regardless of zoom level
 *
 * Visual specifications:
 * - Background: Pill-shaped rounded rectangle with dynamic width/height
 * - Background color: #F6F6F1 (matches rail background)
 * - Border radius: 25px (fully rounded pill shape)
 * - Text: Hedvig Letters Sans, 12px, black with opacity
 * - Text wrapping: ~30 characters per line, dynamic height
 */

/**
 * Wraps text to fit within specified character width
 * @param text - Text to wrap
 * @param maxCharsPerLine - Maximum characters per line (default: 30)
 * @returns Array of text lines
 */
function wrapText(text: string, maxCharsPerLine: number = 30): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

export function QuestionNode({ node, onClick, onMouseEnter, onMouseLeave }: QuestionNodeProps) {
  const selectedNodes = useAnthologyStore(state => state.selection.selectedNodes);
  const hoveredNode = useAnthologyStore(state => state.selection.hoveredNode);
  const mapTransform = useAnthologyStore(state => state.view.mapTransform);

  const isSelected = selectedNodes.has(node.id);
  const isHovered = hoveredNode === node.id;

  // Calculate inverse scale for semantic zoom (text stays same size)
  const inverseScale = 1 / mapTransform.k;

  // Get position with fallback
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // Opacity based on selection state
  const opacity = isSelected || selectedNodes.size === 0 ? 0.8 : 0.3;

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

  // Get question text from node data
  const questionText = node.data.type === 'question' ? node.data.question_text : '';

  // Wrap text and calculate dimensions
  const wrappedLines = useMemo(() => wrapText(questionText, 30), [questionText]);

  // Calculate dynamic dimensions based on text
  const lineHeight = 16.8; // 1.4 * 12px font size
  const padding = 20; // Padding inside the pill
  const rectWidth = 180; // Fixed width for consistent pill shape
  const rectHeight = Math.max(50, wrappedLines.length * lineHeight + padding * 2);
  const rectX = -rectWidth / 2;
  const rectY = -rectHeight / 2;

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
      {/* Semantic zoom group - scales from the exact center point (0, 0) */}
      <g transform={`scale(${inverseScale})`}>
        {/* Permanent background pill (rounded rectangle with dynamic height) */}
        <rect
          x={rectX}
          y={rectY}
          width={rectWidth}
          height={rectHeight}
          rx={25}
          fill="#F6F6F1"
          fillOpacity={opacity}
          pointerEvents="none"
          style={{
            transition: 'fill-opacity 200ms ease',
          }}
        />

        {/* Hover indicator (subtle border on hover) */}
        {isHovered && (
          <rect
            x={rectX}
            y={rectY}
            width={rectWidth}
            height={rectHeight}
            rx={25}
            fill="none"
            stroke="#000000"
            strokeWidth={1}
            strokeOpacity={0.15}
            pointerEvents="none"
          />
        )}

        {/* Text element with semantic zoom and proper wrapping */}
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fontFamily="Hedvig Letters Sans, sans-serif"
          fontWeight={400}
          fill="#000000"
          fillOpacity={opacity}
          style={{
            userSelect: 'none',
            pointerEvents: 'all',
            transition: 'fill-opacity 200ms ease',
          }}
        >
          {/* Render wrapped lines */}
          {wrappedLines.map((line: string, i: number) => {
            // Calculate y offset to vertically center multi-line text
            const totalHeight = wrappedLines.length * lineHeight;
            const startY = -totalHeight / 2 + lineHeight / 2;
            const yOffset = startY + i * lineHeight;

            return (
              <tspan
                key={i}
                x={0}
                y={yOffset}
              >
                {line}
              </tspan>
            );
          })}
        </text>
      </g>
    </g>
  );
}
