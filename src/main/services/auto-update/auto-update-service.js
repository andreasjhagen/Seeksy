import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import semver from 'semver'
import { IPC } from '../../ipc/ipcChannels'

const { autoUpdater } = pkg

/**
 * Auto Update Service
 *
 * Manages the auto-update functionality for the application, including:
 * - Checking for updates
 * - Downloading updates
 * - Installing updates
 * - Broadcasting update events to renderer processes
 */
class AutoUpdateService {
  constructor() {
    this.isInitialized = false
    this.updateStatus = {
      updateAvailable: false,
      updateDownloaded: false,
      updateInfo: null,
      error: null,
      currentVersion: app.getVersion(),
      downloadProgress: 0,
      lastCheck: null,
      checkingInProgress: false,
    }
  }

  /**
   * Initialize the auto-update service
   */
  initialize() {
    if (this.isInitialized)
      return
    this.isInitialized = true

    // Configure logger for debugging
    autoUpdater.logger = console

    // Enable more detailed logging
    autoUpdater.autoDownload = false
    autoUpdater.allowDowngrade = false
    autoUpdater.allowPrerelease = false
    autoUpdater.forceDevUpdateConfig = true

    // Log the feed URL for debugging
    const platform = process.platform
    console.log(`Auto Update Service initialized for ${platform} with app version: ${app.getVersion()}`)

    // Set up event listeners
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for update...')
      this._updateStatus({
        checking: true,
        checkingInProgress: true,
        error: null,
      })
    })

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info)
      console.log(`Current version: ${app.getVersion()}, Remote version: ${info.version}`)

      // Double-check with semver to ensure the remote version is actually newer
      const isNewer = semver.gt(info.version, app.getVersion())
      console.log('Is remote version newer?', isNewer)

      this._updateStatus({
        updateAvailable: isNewer,
        updateInfo: info,
        remoteVersion: info.version,
        checking: false,
        checkingInProgress: false,
        lastCheck: new Date().toISOString(),
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available:', info)
      console.log(`Current version: ${app.getVersion()}, Remote version: ${info ? info.version : 'unknown'}`)

      // If we have version info but autoUpdater reports no update,
      // double-check with semver ourselves
      if (info && info.version) {
        const isNewer = semver.gt(info.version, app.getVersion())
        console.log('Manually checked - is remote version newer?', isNewer)

        if (isNewer) {
          // Force update availability if semver says it's newer
          this._updateStatus({
            updateAvailable: true,
            updateInfo: info,
            remoteVersion: info.version,
            checking: false,
            checkingInProgress: false,
            lastCheck: new Date().toISOString(),
            note: 'Update detected by manual version comparison',
          })
          return
        }
      }

      this._updateStatus({
        updateAvailable: false,
        updateInfo: info,
        remoteVersion: info ? info.version : undefined,
        checking: false,
        checkingInProgress: false,
        lastCheck: new Date().toISOString(),
      })
    })

    autoUpdater.on('download-progress', (progressObj) => {
      console.log(`Download progress: ${progressObj.percent.toFixed(2)}%`)
      this._updateStatus({
        downloadProgress: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        downloaded: progressObj.transferred,
        total: progressObj.total,
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info)
      this._updateStatus({
        updateDownloaded: true,
        updateInfo: info,
        downloadProgress: 100,
        remoteVersion: info.version,
      })

      // Show notification that update is ready
      this._showUpdateNotification(info)
    })

    autoUpdater.on('error', (error) => {
      console.error('Auto update error:', error)

      // Enhanced error handling for specific issues
      let errorMessage = error.toString()
      let diagnosticInfo = {}

      // Check for specific error patterns
      if (error.message && error.message.includes('latest.yml')) {
        errorMessage = 'Update metadata file (latest.yml) not found in release artifacts. '
          + 'Check if the GitHub release includes all required files.'
        diagnosticInfo = {
          platform: process.platform,
          expectedFile: process.platform === 'darwin'
            ? 'latest-mac.yml'
            : (process.platform === 'win32' ? 'latest.yml' : 'latest-linux.yml'),
          feedUrl: autoUpdater.getFeedURL?.() || 'Using default feed URL',
          currentVersion: app.getVersion(),
        }
        console.error('Auto update diagnostic info:', diagnosticInfo)
      }

      this._updateStatus({
        error: errorMessage,
        diagnosticInfo,
        checking: false,
        checkingInProgress: false,
        lastCheck: new Date().toISOString(),
      })
    })

    // Check for updates initially (with a slight delay to let the app initialize)
    setTimeout(() => {
      this.checkForUpdates()
    }, 10000)
  }

  /**
   * Check for updates
   * @returns {Promise<object>} Update status
   */
  async checkForUpdates() {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Auto update service not initialized',
        updateAvailable: false,
        currentVersion: app.getVersion(),
      }
    }

    // Prevent multiple checks from running simultaneously
    if (this.updateStatus.checkingInProgress) {
      console.log('Update check already in progress, skipping')
      return {
        success: true, // Changed to true so UI doesn't show error
        checkingInProgress: true,
        currentVersion: app.getVersion(),
        ...this.updateStatus,
      }
    }

    try {
      console.log('Manually checking for updates, current version:', app.getVersion())
      this._updateStatus({
        checkingInProgress: true,
        error: null, // Clear any previous errors
      })

      // Set a timeout to ensure the check doesn't hang indefinitely
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Update check timed out after 30 seconds'))
        }, 30000)
      })

      // Force a reload of update info from GitHub
      const updateCheckPromise = autoUpdater.checkForUpdatesAndNotify()

      // Race the updateCheck against the timeout
      const updateCheckResult = await Promise.race([updateCheckPromise, timeoutPromise])

      // Log detailed info about what was returned
      if (updateCheckResult && updateCheckResult.updateInfo) {
        console.log('Update check result:', JSON.stringify({
          currentVersion: app.getVersion(),
          remoteVersion: updateCheckResult.updateInfo.version,
          files: updateCheckResult.updateInfo.files?.map(f => f.url) || [],
        }, null, 2))

        // Perform our own version check
        const remoteVersion = updateCheckResult.updateInfo.version

        // Ensure we have valid versions to compare
        if (remoteVersion && app.getVersion()) {
          try {
            const hasUpdate = semver.gt(remoteVersion, app.getVersion())
            console.log(`Manual version check: ${app.getVersion()} → ${remoteVersion}, update available: ${hasUpdate}`)

            this._updateStatus({
              updateAvailable: hasUpdate,
              updateInfo: updateCheckResult.updateInfo,
              remoteVersion,
              checking: false,
              checkingInProgress: false,
              lastCheck: new Date().toISOString(),
              note: hasUpdate ? 'Update confirmed by manual version check' : 'No update needed',
            })
          }
          catch (versionError) {
            console.error('Version comparison error:', versionError)
            // Continue without failing if version comparison fails
          }
        }
        else {
          console.warn('Missing version information for comparison:', {
            current: app.getVersion(),
            remote: remoteVersion,
          })
        }
      }
      else {
        // Handle case where checkForUpdatesAndNotify returned but without updateInfo
        console.log('Update check completed but no update info was returned')
        this._updateStatus({
          checking: false,
          checkingInProgress: false,
          lastCheck: new Date().toISOString(),
          note: 'No update info received from server',
        })
      }

      // Ensure check is marked as complete even if events didn't fire
      if (this.updateStatus.checkingInProgress) {
        this._updateStatus({
          checking: false,
          checkingInProgress: false,
          lastCheck: new Date().toISOString(),
        })
      }

      return {
        success: true,
        ...this.updateStatus,
      }
    }
    catch (error) {
      console.error('Error checking for updates:', error)
      this._updateStatus({
        error: error.toString(),
        checking: false,
        checkingInProgress: false,
        lastCheck: new Date().toISOString(),
      })

      return {
        success: false,
        error: error.toString(),
        updateAvailable: false,
        currentVersion: app.getVersion(),
        lastCheck: new Date().toISOString(),
      }
    }
  }

  /**
   * Force check directly from source
   * This is a more aggressive check that bypasses caching
   */
  async forceCheckFromSource() {
    try {
      console.log('Force checking updates from source...')

      // Clear any cached update data
      if (typeof autoUpdater.clearCache === 'function') {
        await autoUpdater.clearCache()
      }

      // Set a very short cache time to force re-fetch
      const originalCacheTime = autoUpdater.cacheLookupTimeout
      autoUpdater.cacheLookupTimeout = 0

      const result = await this.checkForUpdates()

      // Restore original cache timeout
      autoUpdater.cacheLookupTimeout = originalCacheTime

      return result
    }
    catch (error) {
      console.error('Force update check failed:', error)
      return {
        success: false,
        error: error.toString(),
        currentVersion: app.getVersion(),
      }
    }
  }

  /**
   * Download the update
   * @returns {Promise<object>} Download status
   */
  async downloadUpdate() {
    if (!this.updateStatus.updateAvailable || this.updateStatus.updateDownloaded) {
      return {
        success: false,
        error: this.updateStatus.updateDownloaded
          ? 'Update already downloaded'
          : 'No update available',
        ...this.updateStatus,
      }
    }

    try {
      // Download the update
      await autoUpdater.downloadUpdate()

      return {
        success: true,
        ...this.updateStatus,
      }
    }
    catch (error) {
      console.error('Error downloading update:', error)
      this._updateStatus({ error: error.toString() })

      return {
        success: false,
        error: error.toString(),
        ...this.updateStatus,
      }
    }
  }

  /**
   * Install the update
   */
  quitAndInstall() {
    if (this.updateStatus.updateDownloaded) {
      // Quit and install
      autoUpdater.quitAndInstall(false, true)
    }
  }

  /**
   * Update the status and broadcast to renderer processes
   * @param {object} update Status update object
   * @private
   */
  _updateStatus(update) {
    this.updateStatus = {
      ...this.updateStatus,
      ...update,
    }

    // Broadcast update status to all windows
    BrowserWindow.getAllWindows().forEach((window) => {
      if (window.webContents) {
        window.webContents.send(IPC.UPDATER.STATUS, this.updateStatus)
      }
    })
  }

  /**
   * Show a notification when update is downloaded
   * @param {object} info Update info
   * @private
   */
  _showUpdateNotification(info) {
    const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!mainWindow)
      return

    mainWindow.webContents.send(IPC.SYSTEM.SHOW_NOTIFICATION, {
      title: 'Update Ready to Install',
      body: `Version ${info.version} has been downloaded and will be installed on exit.`,
    })
  }
}

export const autoUpdateService = new AutoUpdateService()
