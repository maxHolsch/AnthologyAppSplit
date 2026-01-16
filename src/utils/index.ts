/**
 * Central export for all utility functions
 */

// Logger utilities
export {
  debugLog,
  warnLog,
  errorLog,
  createLogger
} from './logger';

// Color assignment
export {
  DEFAULT_PALETTE,
  PARTICIPANT_COLORS,
  COLOR_SCHEMES,
  assignColors,
  hexToRgba,
  darkenColor,
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