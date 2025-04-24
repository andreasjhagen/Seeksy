/**
 * Logger Utility
 *
 * Provides standardized logging for the application with:
 * - Formatted messages with timestamps
 * - Different log levels
 * - Color-coding for better readability
 * - Consistent logging format across the app
 * - Ability to enable/disable logging
 */

class Logger {
  // Static property to globally control logging
  static enabled = false

  constructor(moduleName = 'App') {
    this.moduleName = moduleName
    this.enabled = null // Individual logger can override global setting
  }

  /**
   * Check if logging is enabled for this instance
   * @returns {boolean} True if logging is enabled
   * @private
   */
  _isEnabled() {
    // If instance has a specific setting, use that, otherwise use global setting
    return this.enabled !== null ? this.enabled : Logger.enabled
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
    if (!this._isEnabled())
      return

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
    if (!this._isEnabled())
      return

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
    if (!this._isEnabled())
      return

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
    if (!this._isEnabled())
      return

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
    // Only log debug messages in development and if logging is enabled
    if (!this._isEnabled() || process.env.NODE_ENV === 'production')
      return

    const timestamp = this._getTimestamp()
    const modulePrefix = this._getModulePrefix()

    console.log(`\x1B[35m${timestamp} ${modulePrefix} [DEBUG]\x1B[0m ${message}`, ...args)
  }

  /**
   * Enable logging for this logger instance
   */
  enable() {
    this.enabled = true
  }

  /**
   * Disable logging for this logger instance
   */
  disable() {
    this.enabled = false
  }

  /**
   * Reset to use global logging setting
   */
  resetToGlobal() {
    this.enabled = null
  }

  /**
   * Enable logging globally
   */
  static enableGlobal() {
    Logger.enabled = true
  }

  /**
   * Disable logging globally
   */
  static disableGlobal() {
    Logger.enabled = false
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

// Export static methods for global control
export const enableLogging = Logger.enableGlobal.bind(Logger)
export const disableLogging = Logger.disableGlobal.bind(Logger)
