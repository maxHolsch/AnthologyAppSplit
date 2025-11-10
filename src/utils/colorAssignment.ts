/**
 * Color assignment utilities for multi-conversation visualization
 */

import type { Conversation, ColorAssignment, SpeakerColorAssignment } from '@types';

/**
 * Default color palette optimized for accessibility
 * Based on Design.md specifications and Figma designs
 */
export const DEFAULT_PALETTE = [
  '#FF5F1F', // Orange
  '#6CB7FA', // Blue
  '#CC82E7', // Purple
  '#6CC686', // Green
  '#F7ACEA', // Pink
  '#FFB84D', // Gold
  '#7B68EE', // Medium Slate Blue
  '#FF6B6B', // Coral
  '#4ECDC4', // Turquoise
  '#95E1D3', // Mint
  '#FFA07A', // Light Salmon
  '#DDA0DD', // Plum
  '#98D8C8', // Pale Green
  '#F7DC6F', // Yellow
  '#85C1E2', // Sky Blue
];

/**
 * Participant-specific colors from Figma
 */
export const PARTICIPANT_COLORS = {
  orange: {
    primary: '#FF5F1F',
    background: 'rgba(255, 95, 31, 0.15)',
    text: '#DB3F00'
  },
  blue: {
    primary: '#6CB7FA',
    background: 'rgba(108, 183, 250, 0.15)',
    text: '#0061B7'
  },
  purple: {
    primary: '#CC82E7',
    background: 'rgba(204, 130, 231, 0.15)',
    text: '#5D0184'
  },
  green: {
    primary: '#6CC686',
    background: 'rgba(108, 198, 134, 0.15)',
    text: '#0A501E'
  },
  pink: {
    primary: '#F7ACEA',
    background: 'rgba(247, 172, 234, 0.15)',
    text: '#C14886'
  }
};

/**
 * Color scheme presets for different themes
 */
export const COLOR_SCHEMES = {
  default: DEFAULT_PALETTE,

  warm: [
    '#FF6B6B', '#FF8E53', '#FF9A76', '#FFC93C',
    '#FFD93D', '#F6F578', '#FFA07A', '#FFB6B9'
  ],

  cool: [
    '#4ECDC4', '#45B7D1', '#96CEB4', '#88D8B0',
    '#6CB7FA', '#85C1E2', '#7B68EE', '#9B59B6'
  ],

  pastel: [
    '#FFE5E5', '#FFF5E4', '#FFE3E1', '#FFF9E6',
    '#E8F6EF', '#E5EBF7', '#F3E5F5', '#FCE4EC'
  ],

  vibrant: [
    '#FF0080', '#00FF00', '#00FFFF', '#FF00FF',
    '#FFFF00', '#FF4500', '#00CED1', '#FF1493'
  ],

  monochrome: [
    '#2C3E50', '#34495E', '#7F8C8D', '#95A5A6',
    '#BDC3C7', '#ECF0F1', '#D5DBDB', '#AAB7B8'
  ]
};

/**
 * Assigns colors to conversations
 */
export const assignColors = (
  conversations: Conversation[],
  scheme: keyof typeof COLOR_SCHEMES = 'default'
): Map<string, ColorAssignment> => {
  const palette = COLOR_SCHEMES[scheme];
  const assignments = new Map<string, ColorAssignment>();

  conversations.forEach((conv, index) => {
    // Use existing color if provided, otherwise assign from palette
    const color = conv.color || palette[index % palette.length];

    assignments.set(conv.conversation_id, {
      conversation_id: conv.conversation_id,
      color,
      index
    });
  });

  return assignments;
};

/**
 * Assigns colors to speakers within each conversation
 * Key format: "conversationId:speakerName"
 */
export const assignSpeakerColors = (
  conversations: Conversation[],
  scheme: keyof typeof COLOR_SCHEMES = 'default'
): Map<string, SpeakerColorAssignment> => {
  const palette = COLOR_SCHEMES[scheme];
  const assignments = new Map<string, SpeakerColorAssignment>();

  conversations.forEach((conv) => {
    const speakerColors = conv.metadata.speaker_colors || {};
    const participants = conv.metadata.participants || [];

    participants.forEach((speaker, index) => {
      // Use color from metadata if available, otherwise assign from palette
      const color = speakerColors[speaker] || palette[index % palette.length];
      const key = `${conv.conversation_id}:${speaker}`;

      assignments.set(key, {
        speaker_name: speaker,
        conversation_id: conv.conversation_id,
        color,
        index
      });
    });
  });

  return assignments;
};

/**
 * Gets participant color set based on color value
 */
export const getParticipantColorSet = (color: string) => {
  // Try to match with predefined participant colors
  const colorLower = color.toLowerCase();

  for (const colors of Object.values(PARTICIPANT_COLORS)) {
    if (colors.primary.toLowerCase() === colorLower) {
      return colors;
    }
  }

  // Generate color set from base color
  return generateColorSet(color);
};

/**
 * Generates background and text colors from a base color
 */
export const generateColorSet = (baseColor: string) => {
  return {
    primary: baseColor,
    background: hexToRgba(baseColor, 0.15),
    text: darkenColor(baseColor, 0.4)
  };
};

/**
 * Converts hex color to rgba
 */
export const hexToRgba = (hex: string, alpha: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 0, 0, ${alpha})`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Darkens a color by a percentage
 */
export const darkenColor = (hex: string, percent: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;

  let r = parseInt(result[1], 16);
  let g = parseInt(result[2], 16);
  let b = parseInt(result[3], 16);

  r = Math.round(r * (1 - percent));
  g = Math.round(g * (1 - percent));
  b = Math.round(b * (1 - percent));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

/**
 * Lightens a color by a percentage
 */
export const lightenColor = (hex: string, percent: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;

  let r = parseInt(result[1], 16);
  let g = parseInt(result[2], 16);
  let b = parseInt(result[3], 16);

  r = Math.round(r + (255 - r) * percent);
  g = Math.round(g + (255 - g) * percent);
  b = Math.round(b + (255 - b) * percent);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

/**
 * Adjusts opacity based on selection state
 */
export const getNodeOpacity = (
  isSelected: boolean,
  otherSelected: boolean,
  sameConversation: boolean
): number => {
  if (isSelected) return 1.0;
  if (!otherSelected) return 1.0; // No selection, all full opacity
  if (sameConversation) return 0.7;
  return 0.4;
};

/**
 * Gets edge opacity based on selection state
 */
export const getEdgeOpacity = (
  sourceSelected: boolean,
  targetSelected: boolean,
  anySelected: boolean
): number => {
  if (sourceSelected || targetSelected) return 0.8;
  if (!anySelected) return 0.5; // Default state
  return 0.2; // Faded when other nodes selected
};

/**
 * Checks if a color is light or dark
 */
export const isLightColor = (hex: string): boolean => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return true;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
};

/**
 * Gets contrasting text color (black or white) for a background
 */
export const getContrastingTextColor = (backgroundColor: string): string => {
  return isLightColor(backgroundColor) ? '#000000' : '#FFFFFF';
};