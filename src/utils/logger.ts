/**
 * Logger utility for development debugging
 * Automatically disabled in production builds
 */

// Check if we're in development mode
const DEBUG = import.meta.env.DEV;

/**
 * Log a debug message (only in development)
 */
export const debugLog = (...args: unknown[]): void => {
  if (DEBUG) {
    console.log(...args);
  }
};

/**
 * Log a warning message (always enabled)
 */
export const warnLog = (...args: unknown[]): void => {
  console.warn(...args);
};

/**
 * Log an error message (always enabled)
 */
export const errorLog = (...args: unknown[]): void => {
  console.error(...args);
};

/**
 * Create a namespaced logger for a specific module
 * @param namespace - Module name (e.g., 'AnthologyStore', 'D3Visualization')
 */
export const createLogger = (namespace: string) => {
  return {
    debug: (...args: unknown[]) => debugLog(`[${namespace}]`, ...args),
    warn: (...args: unknown[]) => warnLog(`[${namespace}]`, ...args),
    error: (...args: unknown[]) => errorLog(`[${namespace}]`, ...args)
  };
};
