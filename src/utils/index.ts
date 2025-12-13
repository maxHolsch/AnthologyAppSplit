/**
 * Central export for all utility functions
 */

// Data processing
export {
  validateAnthologyData,
  filterResponseNodes,
  createQuestionResponseMap,
  createGraphNodes,
  createGraphEdges,
  calculateStatistics,
  findConnectedComponents,
  calculateInitialPositions,
  type DataStatistics
} from './dataProcessor';

// Color assignment
export {
  DEFAULT_PALETTE,
  PARTICIPANT_COLORS,
  COLOR_SCHEMES,
  assignColors,
  getParticipantColorSet,
  generateColorSet,
  hexToRgba,
  darkenColor,
  lightenColor,
  getNodeOpacity,
  getEdgeOpacity,
  isLightColor,
  getContrastingTextColor
} from './colorAssignment';

// Color utilities for pull quotes and nodes
export {
  getPullQuoteTextColor,
  getPullQuoteBackgroundColor,
  getCircleColor,
  getQuoteBackgroundColor,
  getQuoteTextColor
} from './colorUtils';

// Audio utilities
export {
  getAudioFilePath,
  formatTime,
  formatTimeRemaining,
  findCurrentWord,
  validateAudioSupport,
  clampToSegment,
  calculateSegmentProgress,
  progressToTime,
  shuffleArray
} from './audioUtils';