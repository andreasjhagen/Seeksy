import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import { IPC } from '../../ipc/ipcChannels.js'
import { createLogger } from '../../utils/logger.js'

const { autoUpdater } = pkg
const logger = createLogger('AutoUpdater')

/**
 * AutoUpdaterService: Handles application auto-updates
 *
 * Manages checking for updates, downloading, and installing updates
 * from GitHub releases.
 */
class AutoUpdaterService {
  constructor() {
    this.updateAvailable = false
    this.updateDownloaded = false
    this.updateInfo = null
    this.downloadProgress = null
    this.mainWindow = null
    this.settingsWindow = null
    this.tray = null
    this.onTrayUpdateCallback = null
    this.isDev = is.dev

    // Configure auto-updater
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    // Set up event listeners (only in production)
    if (!this.isDev) {
      this.setupEventListeners()
    }
  }

  /**
   * Initialize the service with window references
   */
  initialize(mainWindow, settingsWindow, tray, onTrayUpdateCallback) {
    this.mainWindow = mainWindow
    this.settingsWindow = settingsWindow
    this.tray = tray
    this.onTrayUpdateCallback = onTrayUpdateCallback

    // Check for updates on startup (after a short delay) - only in production
    if (!this.isDev) {
      setTimeout(() => {
        this.checkForUpdates(true) // silent check
      }, 5000)
    }
  }

  /**
   * Set up auto-updater event listeners
   */
  setupEventListeners() {
    autoUpdater.on('checking-for-update', () => {
      logger.info('[AutoUpdater] Checking for updates...')
      this.broadcastToWindows(IPC.UPDATER.CHECKING_FOR_UPDATE)
    })

    autoUpdater.on('update-available', (info) => {
      logger.info('[AutoUpdater] Update available:', info.version)
      this.updateAvailable = true
      this.updateInfo = {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      }
      this.broadcastToWindows(IPC.UPDATER.UPDATE_AVAILABLE, this.updateInfo)

      // Update tray icon/menu
      if (this.onTrayUpdateCallback) {
        this.onTrayUpdateCallback(true, this.updateInfo)
      }
    })

    autoUpdater.on('update-not-available', (_info) => {
      logger.info('[AutoUpdater] No updates available')
      this.updateAvailable = false
      this.broadcastToWindows(IPC.UPDATER.UPDATE_NOT_AVAILABLE, {
        currentVersion: app.getVersion(),
      })
    })

    autoUpdater.on('download-progress', (progressObj) => {
      this.downloadProgress = {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      }
      this.broadcastToWindows(IPC.UPDATER.DOWNLOAD_PROGRESS, this.downloadProgress)
    })

    autoUpdater.on('update-downloaded', (info) => {
      logger.info('[AutoUpdater] Update downloaded:', info.version)
      this.updateDownloaded = true
      this.broadcastToWindows(IPC.UPDATER.UPDATE_DOWNLOADED, {
        version: info.version,
        releaseDate: info.releaseDate,
      })

      // Update tray menu to show "Install and Restart"
      if (this.onTrayUpdateCallback) {
        this.onTrayUpdateCallback(true, this.updateInfo, true)
      }
    })

    autoUpdater.on('error', (error) => {
      logger.error('[AutoUpdater] Error:', error.message)
      this.broadcastToWindows(IPC.UPDATER.ERROR, {
        message: error.message,
      })
    })
  }

  /**
   * Broadcast a message to all windows
   */
  broadcastToWindows(channel, data = {}) {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((window) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send(channel, data)
      }
    })
  }

  /**
   * Check for updates
   * @param {boolean} _silent - If true, don't show notifications for "no update" (reserved for future use)
   */
  async checkForUpdates(_silent = false) {
    // In dev mode, auto-updater doesn't work - use GitHub API instead
    if (this.isDev) {
      return await this.checkForUpdatesViaGitHub()
    }

    try {
      await autoUpdater.checkForUpdates()
      return {
        success: true,
        updateAvailable: this.updateAvailable,
        updateInfo: this.updateInfo,
        currentVersion: app.getVersion(),
      }
    }
    catch (error) {
      logger.error('Check for updates failed:', error)
      return {
        success: false,
        error: error.message,
        currentVersion: app.getVersion(),
      }
    }
  }

  /**
   * Check for updates via GitHub API (for dev mode)
   */
  async checkForUpdatesViaGitHub() {
    try {
      this.broadcastToWindows(IPC.UPDATER.CHECKING_FOR_UPDATE)

      const response = await fetch('https://api.github.com/repos/andreasjhagen/Seeksy/releases/latest')

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`)
      }

      const release = await response.json()
      const currentVersion = app.getVersion().replace(/^v/, '')
      const latestVersion = release.tag_name.replace(/^v/, '')

      // Simple version comparison
      if (this.isNewerVersion(latestVersion, currentVersion)) {
        this.updateAvailable = true
        this.updateInfo = {
          version: latestVersion,
          releaseDate: release.published_at,
          releaseNotes: release.body,
        }
        this.broadcastToWindows(IPC.UPDATER.UPDATE_AVAILABLE, this.updateInfo)

        if (this.onTrayUpdateCallback) {
          this.onTrayUpdateCallback(true, this.updateInfo)
        }
      }
      else {
        this.updateAvailable = false
        this.broadcastToWindows(IPC.UPDATER.UPDATE_NOT_AVAILABLE, {
          currentVersion: app.getVersion(),
        })
      }

      return {
        success: true,
        updateAvailable: this.updateAvailable,
        updateInfo: this.updateInfo,
        currentVersion: app.getVersion(),
      }
    }
    catch (error) {
      logger.error('GitHub update check failed:', error)
      this.broadcastToWindows(IPC.UPDATER.ERROR, {
        message: error.message,
      })
      return {
        success: false,
        error: error.message,
        currentVersion: app.getVersion(),
      }
    }
  }

  /**
   * Compare two semantic versions
   * @returns {boolean} true if version1 is newer than version2
   */
  isNewerVersion(version1, version2) {
    const v1Parts = version1.split('.').map(Number)
    const v2Parts = version2.split('.').map(Number)

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0
      const v2Part = v2Parts[i] || 0
      if (v1Part > v2Part)
        return true
      if (v1Part < v2Part)
        return false
    }
    return false
  }

  /**
   * Download the available update
   */
  async downloadUpdate() {
    // In dev mode, direct to GitHub releases
    if (this.isDev) {
      return {
        success: false,
        error: 'Auto-download is not available in development mode. Please download manually from GitHub.',
      }
    }

    if (!this.updateAvailable) {
      return { success: false, error: 'No update available' }
    }

    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    }
    catch (error) {
      logger.error('[AutoUpdater] Download failed:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Install the downloaded update and restart the app
   */
  installUpdate() {
    if (!this.updateDownloaded) {
      return { success: false, error: 'Update not downloaded yet' }
    }

    autoUpdater.quitAndInstall(false, true)
    return { success: true }
  }

  /**
   * Get current update status
   */
  getUpdateStatus() {
    return {
      updateAvailable: this.updateAvailable,
      updateDownloaded: this.updateDownloaded,
      updateInfo: this.updateInfo,
      downloadProgress: this.downloadProgress,
      currentVersion: app.getVersion(),
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    autoUpdater.removeAllListeners()
  }
}

// Export singleton instance
export const autoUpdaterService = new AutoUpdaterService()
