/**
 * Crash Reporter Service
 *
 * Handles crash logging and error reporting for the application.
 * Writes detailed crash logs to the user data directory for debugging
 * production issues.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { app, crashReporter as electronCrashReporter } from 'electron'

class CrashReporterService {
  constructor() {
    this.crashLogPath = null
    this.initialized = false
  }

  /**
   * Initialize the crash reporter
   * Should be called early in app startup
   */
  initialize() {
    if (this.initialized)
      return

    // Set up crash log directory
    this.crashLogPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'crash-logs')
      : path.join(process.cwd(), 'crash-logs')

    // Ensure directory exists
    if (!fs.existsSync(this.crashLogPath)) {
      fs.mkdirSync(this.crashLogPath, { recursive: true })
    }

    // Start Electron's native crash reporter (for Chromium crashes)
    electronCrashReporter.start({
      submitURL: '',
      uploadToServer: false,
      compress: false,
    })

    this.initialized = true
    console.log(`Crash reporter initialized. Logs at: ${this.crashLogPath}`)
  }

  /**
   * Write a crash log to file
   * @param {string} type - Type of crash (uncaught-exception, unhandled-rejection, renderer-crash, etc.)
   * @param {Error|object} error - The error object
   * @param {object} [context] - Additional context about the crash
   */
  writeCrashLog(type, error, context = {}) {
    if (!this.crashLogPath) {
      console.error('Crash reporter not initialized')
      return
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const logFile = path.join(this.crashLogPath, `${type}-${timestamp}.log`)

    const logContent = [
      `=== Seeksy Crash Log ===`,
      `Type: ${type}`,
      `Time: ${new Date().toISOString()}`,
      `App Version: ${app.getVersion()}`,
      `Electron: ${process.versions.electron}`,
      `Chrome: ${process.versions.chrome}`,
      `Node: ${process.versions.node}`,
      `Platform: ${process.platform} ${process.arch}`,
      ``,
      `=== Error ===`,
      `Message: ${error?.message || String(error)}`,
      `Stack: ${error?.stack || 'No stack trace'}`,
      ``,
      `=== Context ===`,
      JSON.stringify(context, null, 2),
      ``,
      `=== Memory Usage ===`,
      JSON.stringify(process.memoryUsage(), null, 2),
    ].join('\n')

    try {
      fs.writeFileSync(logFile, logContent)
      console.error(`Crash log written to: ${logFile}`)
    }
    catch (e) {
      console.error('Failed to write crash log:', e)
    }
  }

  /**
   * Set up global error handlers for the main process
   * @param {Function} [cleanupFn] - Optional cleanup function to call before exit
   */
  setupMainProcessHandlers(cleanupFn) {
    // Handle uncaught exceptions in main process
    process.on('uncaughtException', (error, origin) => {
      console.error('Uncaught exception:', error)
      this.writeCrashLog('uncaught-exception', error, { origin })

      if (cleanupFn) {
        try {
          cleanupFn()
        }
        catch (e) {
          console.error('Cleanup failed:', e)
        }
      }

      process.exit(1)
    })

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, _promise) => {
      console.error('Unhandled rejection:', reason)
      this.writeCrashLog('unhandled-rejection', reason instanceof Error ? reason : new Error(String(reason)), { promiseInfo: 'Unhandled promise rejection' },
      )
      // Don't exit for unhandled rejections, just log them
    })
  }

  /**
   * Set up crash handlers for a BrowserWindow's renderer process
   * @param {BrowserWindow} window - The window to monitor
   * @param {string} windowName - Name for identification in logs
   */
  setupRendererHandlers(window, windowName) {
    // Detect when renderer process crashes
    window.webContents.on('render-process-gone', (event, details) => {
      console.error(`Renderer process gone (${windowName}):`, details)
      this.writeCrashLog('renderer-crash', new Error(`Renderer crashed: ${details.reason}`), {
        windowName,
        reason: details.reason,
        exitCode: details.exitCode,
      })
    })

    // Detect when page becomes unresponsive
    window.webContents.on('unresponsive', () => {
      console.error(`Window became unresponsive (${windowName})`)
      this.writeCrashLog('renderer-unresponsive', new Error('Window unresponsive'), {
        windowName,
      })
    })

    // Detect crashes in preload script
    window.webContents.on('preload-error', (event, preloadPath, error) => {
      console.error(`Preload error (${windowName}):`, error)
      this.writeCrashLog('preload-error', error, {
        windowName,
        preloadPath,
      })
    })

    // Optionally log renderer console errors (level 3 = error)
    // Uncomment if you want to capture renderer errors too
    // window.webContents.on('console-message', (event, level, message, line, sourceId) => {
    //   if (level === 3) {
    //     this.writeCrashLog('renderer-console-error', new Error(message), {
    //       windowName,
    //       line,
    //       sourceId,
    //     })
    //   }
    // })
  }

  /**
   * Get the path to the crash logs directory
   * @returns {string|null} Path to crash logs or null if not initialized
   */
  getCrashLogPath() {
    return this.crashLogPath
  }

  /**
   * Get list of recent crash logs
   * @param {number} [limit] - Maximum number of logs to return (default: 10)
   * @returns {Array<{file: string, date: Date, type: string}>} Array of crash log info
   */
  getRecentCrashLogs(limit = 10) {
    if (!this.crashLogPath || !fs.existsSync(this.crashLogPath)) {
      return []
    }

    try {
      const files = fs.readdirSync(this.crashLogPath)
        .filter(f => f.endsWith('.log'))
        .map((f) => {
          const stat = fs.statSync(path.join(this.crashLogPath, f))
          const type = f.split('-')[0]
          return { file: f, date: stat.mtime, type }
        })
        .sort((a, b) => b.date - a.date)
        .slice(0, limit)

      return files
    }
    catch (e) {
      console.error('Failed to read crash logs:', e)
      return []
    }
  }

  /**
   * Read a specific crash log
   * @param {string} filename - Name of the crash log file
   * @returns {string|null} Contents of the crash log or null if not found
   */
  readCrashLog(filename) {
    if (!this.crashLogPath)
      return null

    const logPath = path.join(this.crashLogPath, filename)
    if (!fs.existsSync(logPath))
      return null

    try {
      return fs.readFileSync(logPath, 'utf-8')
    }
    catch (e) {
      console.error('Failed to read crash log:', e)
      return null
    }
  }

  /**
   * Clear old crash logs
   * @param {number} [maxAgeDays] - Delete logs older than this many days (default: 30)
   */
  clearOldLogs(maxAgeDays = 30) {
    if (!this.crashLogPath || !fs.existsSync(this.crashLogPath)) {
      return
    }

    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000
    const now = Date.now()

    try {
      const files = fs.readdirSync(this.crashLogPath)
      for (const file of files) {
        const filePath = path.join(this.crashLogPath, file)
        const stat = fs.statSync(filePath)
        if (now - stat.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath)
          console.log(`Deleted old crash log: ${file}`)
        }
      }
    }
    catch (e) {
      console.error('Failed to clear old crash logs:', e)
    }
  }
}

// Export singleton instance
export const crashReporterService = new CrashReporterService()
