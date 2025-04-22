/**
 * Logger Utility
 *
 * Provides standardized logging for the application with:
 * - Formatted messages with timestamps
 * - Different log levels
 * - Color-coding for better readability
 * - Consistent logging format across the app
 */

class Logger {
  constructor(moduleName = 'App') {
    this.moduleName = moduleName
  }

  /**
   * Get formatted timestamp for log messages
   * @returns {string} Formatted timestamp [HH:MM:SS.mmm]
   * @private
   */
  _getTimestamp() {
    const now = new Date()
    return `[${now.toLocaleTimeString('en-US', { hour12: false })}.${now.getMilliseconds().toString().padStart(3, '0')}]`
  }

  /**
   * Format module name for log messages
   * @returns {string} Formatted module name
   * @private
   */
  _getModulePrefix() {
    return `[${this.moduleName}]`
  }

  /**
   * Log an informational message
   * @param {string} message - The message to log
   * @param {any[]} args - Additional arguments to pass to console.log
   */
  info(message, ...args) {
    const timestamp = this._getTimestamp()
    const modulePrefix = this._getModulePrefix()

    console.log(`\x1B[36m${timestamp} ${modulePrefix}\x1B[0m ${message}`, ...args)
  }

  /**
   * Log a success message
   * @param {string} message - The message to log
   * @param {any[]} args - Additional arguments to pass to console.log
   */
  success(message, ...args) {
    const timestamp = this._getTimestamp()
    const modulePrefix = this._getModulePrefix()

    console.log(`\x1B[32m${timestamp} ${modulePrefix}\x1B[0m ${message}`, ...args)
  }

  /**
   * Log a warning message
   * @param {string} message - The message to log
   * @param {any[]} args - Additional arguments to pass to console.log
   */
  warn(message, ...args) {
    const timestamp = this._getTimestamp()
    const modulePrefix = this._getModulePrefix()

    console.warn(`\x1B[33m${timestamp} ${modulePrefix}\x1B[0m ${message}`, ...args)
  }

  /**
   * Log an error message
   * @param {string} message - The message to log
   * @param {any[]} args - Additional arguments to pass to console.error
   */
  error(message, ...args) {
    const timestamp = this._getTimestamp()
    const modulePrefix = this._getModulePrefix()

    console.error(`\x1B[31m${timestamp} ${modulePrefix}\x1B[0m ${message}`, ...args)
  }

  /**
   * Log a debug message (only in development)
   * @param {string} message - The message to log
   * @param {any[]} args - Additional arguments to pass to console.log
   */
  debug(message, ...args) {
    // Only log debug messages in development
    if (process.env.NODE_ENV !== 'production') {
      const timestamp = this._getTimestamp()
      const modulePrefix = this._getModulePrefix()

      console.log(`\x1B[35m${timestamp} ${modulePrefix} [DEBUG]\x1B[0m ${message}`, ...args)
    }
  }
}

/**
 * Create a logger for a specific module
 * @param {string} moduleName - The name of the module
 * @returns {Logger} A logger instance for the module
 */
export function createLogger(moduleName) {
  return new Logger(moduleName)
}

// Default logger
export const logger = new Logger()
