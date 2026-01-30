import { EventEmitter } from 'node:events'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { checkWatchedFolderOverlap } from '../../utils/pathUtils.js'
import { fileDB } from '../database/database.js'
import { appSettings } from '../electron-store/AppSettingsStore.js'
import { performanceConfig } from './config/performanceConfig.js'
import { watcherConfig } from './config/watcherConfig.js'
import { FolderWatcher } from './FolderWatcher.js'
import { PerformanceManager } from './utils/PerformanceManager.js'
import { StatusManager } from './utils/StatusManager.js'

export class IndexController extends EventEmitter {
  constructor() {
    super()
    this.watchers = new Map()
    this.folders = new Map()
    this.active = new Set()
    this.initialized = false
    this._initializing = false // Add this flag to track initialization in progress
    this.watcherQueue = [] // Queue for sequential watcher starting
    this.isProcessingQueue = false // Flag to track if we're currently processing the queue
    this.currentActiveIndexingWatchPath = null // Track the currently active indexing watcher

    // Create status manager to handle throttled updates
    this.statusManager = new StatusManager(
      status => this.emit('status-update', status),
      watcherConfig.status.defaultUpdateInterval,
    )

    // Create performance manager using config
    this.performanceManager = new PerformanceManager(performanceConfig.defaultDelay)
    this._setupPerformanceManager()
  }

  _setupPerformanceManager() {
    this.performanceManager.on('settings-updated', (settings) => {
      // Propagate performance settings to all watchers
      for (const watcher of this.watchers.values()) {
        if (settings.delay !== undefined) {
          watcher.setProcessingDelay(settings.delay)
        }
        if (settings.batchSize !== undefined) {
          watcher.setBatchSize(settings.batchSize)
        }
        if (settings.enableBatching !== undefined) {
          watcher.setEnableBatching(settings.enableBatching)
        }
      }
    })

    this.performanceManager.on('mode-changed', (isAuto) => {
      if (isAuto) {
        // When auto mode is enabled, immediately update settings based on current status
        const status = this.getStatus()
        const newSettings = this.performanceManager.updatePerformanceSettings(status)

        // Apply the new settings to all watchers
        for (const watcher of this.watchers.values()) {
          watcher.setProcessingDelay(newSettings.delay)
          watcher.setBatchSize(newSettings.batchSize)
        }
      }
    })
  }

  async initialize() {
    // Check both initialized and _initializing flags
    if (this.initialized || this._initializing)
      return true

    this._initializing = true // Set flag to prevent concurrent initialization

    try {
      const folders = await fileDB.getWatchedFolders()

      // First, check if all watched folders still exist and clean up missing ones
      const validFolders = []
      for (const folder of folders) {
        try {
          await access(folder.path)
          validFolders.push(folder)
        }
        catch {
          // Folder no longer exists - clean it up
          console.log(`[IndexController] Watched folder no longer exists, removing: ${folder.path}`)
          await this._cleanupMissingWatchedFolder(folder.path)
        }
      }

      // Create watchers only for valid (existing) folders
      for (const folder of validFolders) {
        await this._initWatcher(folder.path, { depth: folder.depth, startPaused: true })
        // Add a small delay between initializations
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      this.initialized = true

      // Start the first watcher if any exist
      this._processWatcherQueue()

      // Run orphan cleanup in background after UI is responsive
      // This doesn't block startup
      this._scheduleOrphanCleanup()

      return true
    }
    catch (error) {
      console.error('Failed to initialize indexer:', error)
      return false
    }
    finally {
      this._initializing = false // Reset the flag regardless of success or failure
    }
  }

  /**
   * Schedule orphan cleanup to run in the background
   * Waits for initial indexing to complete before running
   */
  _scheduleOrphanCleanup() {
    // Wait 5 seconds after init, then run cleanup when no active indexing
    setTimeout(async () => {
      // Wait until no active indexing watchers
      const checkAndRun = async () => {
        const status = this.getStatus()
        if (status.activeIndexingWatchers === 0) {
          console.log('Starting background orphan cleanup...')
          await this.cleanupOrphanedDatabaseEntries()
        }
        else {
          // Check again in 10 seconds
          setTimeout(checkAndRun, 10000)
        }
      }
      await checkAndRun()
    }, 5000)
  }

  async _initWatcher(watchPath, options = { depth: Infinity, startPaused: false }) {
    if (this.watchers.has(watchPath))
      return true // Already exists, consider it initialized

    try {
      const watcher = new FolderWatcher(watchPath, {
        ...options,
        processingDelay: watcherConfig.processing.defaultDelay,
        statusUpdateInterval: watcherConfig.status.defaultUpdateInterval,
        batchSize: this.performanceManager.batchSize,
        enableBatching: this.performanceManager.enableBatching,
        batchCollectTime: watcherConfig.processing.batchCollectTime,
      })

      this.folders.set(watchPath, {
        depth: options.depth,
        name: path.basename(watchPath),
      })
      this.watchers.set(watchPath, watcher)

      // Set up event handling
      this._setupWatcherEvents(watcher, watchPath)

      await watcher.initialize()

      if (options.startPaused) {
        await watcher.pause()
        // Add to queue for sequential starting
        this.watcherQueue.push(watchPath)
      }
      else {
        this.active.add(watchPath)
      }

      this._updateStatus()
      return true
    }
    catch (error) {
      console.error(`Watcher initialization failed for ${watchPath}:`, error)
      return false
    }
  }

  _setupWatcherEvents(watcher, watchPath) {
    watcher
      .on('status-update', (status) => {
        this._updateStatus()

        // Check if this watcher has finished indexing
        if (status.state === 'watching'
          && this.active.has(watchPath)
          && this.currentActiveIndexingWatchPath === watchPath) {
          // This watcher has finished indexing, clear the current active indexing watcher
          this.currentActiveIndexingWatchPath = null
          // Process the next watcher in queue
          setTimeout(() => this._processWatcherQueue(), 100)
        }
      })
      .on('paused', () => {
        this.active.delete(watchPath)
        // If this was the active indexing watcher, clear it
        if (this.currentActiveIndexingWatchPath === watchPath) {
          this.currentActiveIndexingWatchPath = null
        }
        this.emit('watcher-paused', watchPath)
        this._updateStatus()
      })
      .on('resumed', () => {
        this.active.add(watchPath)
        // If we're resuming a watcher and no other watcher is actively indexing, set this as the current active
        if (!this.currentActiveIndexingWatchPath) {
          this.currentActiveIndexingWatchPath = watchPath
        }
        this.emit('watcher-resumed', watchPath)
        this._updateStatus()
      })
      .on('error', async (error) => {
        console.error(`Watcher error for ${watchPath}:`, error)
        // Clear the active indexing watcher if this was it, so queue can proceed
        if (this.currentActiveIndexingWatchPath === watchPath) {
          this.currentActiveIndexingWatchPath = null
        }
        if (!watcher.isPaused) {
          await this.restartWatcher(watchPath)
        }
        // Process next watcher in queue if this one failed
        setTimeout(() => this._processWatcherQueue(), 100)
      })
      .on('ready', () => {
        this.emit('watcher-ready', watchPath)
        this._updateStatus()
      })
      .on('processing-complete', () => {
        // This event ensures we know when all discovered files are fully processed
        this.emit('watcher-processing-complete', watchPath)
        this._updateStatus()
      })
  }

  _updateStatus() {
    this.statusManager.throttleUpdate(() => {
      const status = this.getStatus()

      // In auto mode, update the performance settings based on current status
      if (this.performanceManager.isAutoMode) {
        this.performanceManager.updatePerformanceSettings(status)
      }

      return status
    })
  }

  // Updated method to process the watcher queue
  async _processWatcherQueue() {
    // If we're already processing the queue or there are no watchers in queue, return
    if (this.isProcessingQueue || this.watcherQueue.length === 0) {
      return
    }

    // If there's currently an active indexing watcher, don't start another one
    if (this.currentActiveIndexingWatchPath) {
      return
    }

    this.isProcessingQueue = true

    try {
      // Get the next watcher path from the queue
      const nextWatchPath = this.watcherQueue.shift()
      const watcher = this.watchers.get(nextWatchPath)

      if (watcher && watcher.isPaused) {
        console.log(`Starting next watcher in queue: ${nextWatchPath}`)
        // Set this as the current active indexing watcher before resuming
        this.currentActiveIndexingWatchPath = nextWatchPath
        await this.resumeWatcher(nextWatchPath, false) // Pass false to indicate this is queue-based, not manual
      }
    }
    finally {
      this.isProcessingQueue = false
    }
  }

  // Public API methods
  /**
   * Add a new watched folder path
   * @param {string} watchPath - Path to watch
   * @param {object} options - Watch options
   * @param {number} options.depth - Maximum depth to watch (Infinity for unlimited)
   * @returns {Promise<object>} Result object with success boolean and optional error
   */
  async addWatchPath(watchPath, options = { depth: Infinity }) {
    if (!this.initialized)
      await this.initialize()

    // Check for overlapping watched folders
    const existingFolders = await fileDB.getWatchedFolders()
    const overlapCheck = checkWatchedFolderOverlap(watchPath, options.depth, existingFolders)

    if (overlapCheck.overlaps) {
      console.warn(`[IndexController] Cannot add watch path - overlap detected: ${overlapCheck.reason}`)
      return {
        success: false,
        error: overlapCheck.reason,
        overlappingFolder: overlapCheck.existingFolder?.path,
      }
    }

    // Queue this watcher if there's already an active indexing watcher or watchers in queue
    const shouldQueue = this.currentActiveIndexingWatchPath !== null || this.watcherQueue.length > 0

    console.log(`[IndexController] addWatchPath: ${watchPath}, shouldQueue=${shouldQueue}, currentActive=${this.currentActiveIndexingWatchPath}, queueLength=${this.watcherQueue.length}`)

    const result = await this._initWatcher(watchPath, {
      ...options,
      startPaused: shouldQueue,
    })

    console.log(`[IndexController] _initWatcher result for ${watchPath}: ${result}`)

    if (!result) {
      return { success: false, error: 'Failed to initialize watcher' }
    }

    // If this watcher started immediately (not queued), set it as active indexing watcher
    if (!shouldQueue) {
      this.currentActiveIndexingWatchPath = watchPath
      console.log(`[IndexController] Set ${watchPath} as currentActiveIndexingWatchPath`)
    }
    else {
      // If there's no active indexing watcher but we have watchers in queue, process the queue
      if (this.currentActiveIndexingWatchPath === null && this.watcherQueue.length > 0) {
        this._processWatcherQueue()
      }
    }

    // Invalidate watched folders cache in all active watchers' FileProcessors
    this._invalidateWatchedFoldersCaches()

    return { success: true }
  }

  /**
   * Invalidate the watched folders cache in all watchers' FileProcessors
   * Call this when watched folders are added or removed
   * @private
   */
  _invalidateWatchedFoldersCaches() {
    for (const watcher of this.watchers.values()) {
      if (watcher.processor) {
        watcher.processor.invalidateWatchedFoldersCache()
      }
    }
  }

  async removeWatchPath(watchPath) {
    const watcher = this.watchers.get(watchPath)
    if (!watcher)
      return false

    try {
      await watcher.cleanup()
      this.watchers.delete(watchPath)
      this.folders.delete(watchPath)
      this.active.delete(watchPath)
      await fileDB.removeWatchFolderFromDb(watchPath)

      // Invalidate watched folders cache in remaining watchers
      this._invalidateWatchedFoldersCaches()

      this._updateStatus()
      return true
    }
    catch (error) {
      console.error(`Failed to remove watch path ${watchPath}:`, error)
      return false
    }
  }

  // Add this watcher to the queue if it was manually paused
  async pauseWatcher(watchPath) {
    const watcher = this.watchers.get(watchPath)
    if (!watcher || watcher.isPaused)
      return false

    const success = await watcher.pause()
    if (success) {
      this._updateStatus() // Ensure status is updated immediately
    }
    return success
  }

  // Update to ensure we handle the currentActiveIndexingWatchPath correctly
  async resumeWatcher(watchPath, forceImmediate = true) {
    const watcher = this.watchers.get(watchPath)
    if (!watcher || !watcher.isPaused)
      return false

    // Only queue watchers for non-forced resume operations (internal queue processing)
    // For user-initiated resumes (forceImmediate=true), bypass queuing and resume immediately
    if (!forceImmediate && this.currentActiveIndexingWatchPath && this.currentActiveIndexingWatchPath !== watchPath) {
      this.watcherQueue.push(watchPath)
      return true
    }

    // When forced (user interaction) or no active watcher, resume immediately
    return watcher.resume()
  }

  async restartWatcher(watchPath) {
    const watcher = this.watchers.get(watchPath)
    if (!watcher)
      return false

    await watcher.pause()
    await new Promise(resolve => setTimeout(resolve, 1000))
    return watcher.resume()
  }

  async pauseAll() {
    // Execute pauses sequentially to avoid race conditions
    let allSuccess = true
    for (const path of this.watchers.keys()) {
      const success = await this.pauseWatcher(path)
      if (!success)
        allSuccess = false
    }
    this._updateStatus() // Force status update
    return allSuccess
  }

  async resumeAll(forceImmediate = false) {
    const results = await Promise.all(
      Array.from(this.watchers.keys()).map(path => this.resumeWatcher(path, forceImmediate)),
    )
    return results.every(Boolean)
  }

  getStatus() {
    const folderStats = this._getFolderStats()
    const aggregatedStats = this._calculateAggregatedStats(folderStats)

    return {
      folders: folderStats,
      ...aggregatedStats,
      isPaused: this.active.size === 0 && this.watchers.size > 0,
      totalWatchers: this.watchers.size,
      activeIndexingWatchers: this._countActiveIndexingWatchers(folderStats),
      watchingWatchers: this._countWatchingWatchers(folderStats),
      status: StatusManager.determineGlobalStatus(folderStats),
    }
  }

  _getFolderStats() {
    return Array.from(this.watchers.entries()).map(([watchPath, watcher]) => {
      const folderInfo = this.folders.get(watchPath) || {
        depth: Infinity,
        name: path.basename(watchPath),
      }

      return {
        path: watchPath,
        name: folderInfo.name,
        isActive: this.active.has(watchPath),
        depth: folderInfo.depth,
        ...watcher.getStatus(),
      }
    })
  }

  _calculateAggregatedStats(folderStats) {
    return folderStats.reduce(
      (acc, stat) => ({
        totalFiles: acc.totalFiles + stat.totalFiles,
        processedFiles: acc.processedFiles + stat.processedFiles,
      }),
      { totalFiles: 0, processedFiles: 0 },
    )
  }

  _countActiveIndexingWatchers(folderStats) {
    return folderStats.filter(
      f => !f.isPaused && ['scanning', 'indexing', 'initializing'].includes(f.state),
    ).length
  }

  _countWatchingWatchers(folderStats) {
    return folderStats.filter(
      f => !f.isPaused && f.state === 'watching',
    ).length
  }

  getWatcherStatus(watchPath) {
    const watcher = this.watchers.get(watchPath)
    return watcher
      ? {
          exists: true,
          path: watchPath,
          name: path.basename(watchPath),
          isActive: this.active.has(watchPath),
          ...watcher.getStatus(),
        }
      : {
          exists: false,
          path: watchPath,
          state: 'not-found',
        }
  }

  /**
   * Clean up a watched folder that no longer exists on disk
   * Removes the watched folder entry from the database.
   * Related files and folders are automatically cleaned up via CASCADE DELETE.
   * @param {string} watchPath - Path of the watched folder that was removed/renamed
   * @private
   */
  async _cleanupMissingWatchedFolder(watchPath) {
    try {
      console.log(`[IndexController] Cleaning up missing watched folder: ${watchPath}`)

      // Remove the watched folder entry from the database
      // Files and folders with this watchedFolderPath will be automatically
      // cleaned up via the CASCADE DELETE foreign key constraint
      await fileDB.removeWatchFolderFromDb(watchPath)

      console.log(`[IndexController] Successfully removed missing watched folder from database: ${watchPath}`)

      // Add to persistent storage for UI notification (survives app restarts)
      appSettings.addRemovedWatchedFolder(watchPath)

      // Emit an event so live UI updates can happen
      this.emit('watched-folder-removed', { path: watchPath, reason: 'folder-not-found' })

      return { success: true }
    }
    catch (error) {
      console.error(`[IndexController] Error cleaning up missing watched folder ${watchPath}:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Get the list of removed watched folders (for UI notification)
   * @returns {string[]} List of removed folder paths
   */
  getRemovedWatchedFolders() {
    return appSettings.getRemovedWatchedFolders()
  }

  /**
   * Clear the list of removed watched folders (after user dismisses notification)
   */
  clearRemovedWatchedFolders() {
    appSettings.clearRemovedWatchedFolders()
  }

  async cleanup() {
    // Clean up all watchers in parallel
    await Promise.all(
      Array.from(this.watchers.values()).map(watcher => watcher.cleanup()),
    )

    // Clean up status manager
    this.statusManager.cleanup()

    // Clean up performance manager
    this.performanceManager.cleanup()

    this.watchers.clear()
    this.folders.clear()
    this.active.clear()
    this.initialized = false
    this.currentActiveIndexingWatchPath = null
    this.watcherQueue = []
  }

  async cleanupOrphanedDatabaseEntries() {
    try {
      const files = await fileDB.getAllFiles()
      let removedCount = 0
      console.log(`Checking ${files.length} files for orphaned entries...`)

      // Process in larger batches for better parallelism
      const batchSize = 200
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize)
        const results = await Promise.allSettled(
          batch.map(async (file) => {
            const filePath = typeof file === 'object' ? file.path : file
            try {
              await access(filePath)
              return { exists: true, path: filePath }
            }
            catch {
              return { exists: false, path: filePath }
            }
          }),
        )

        // Remove orphaned entries
        const orphaned = results
          .filter(r => r.status === 'fulfilled' && !r.value.exists)
          .map(r => r.value.path)

        for (const filePath of orphaned) {
          console.log(`Removing orphaned entry: ${filePath}`)
          await fileDB.removePath(filePath)
          removedCount++
        }

        // Yield to event loop between batches
        if (i + batchSize < files.length) {
          await new Promise(resolve => setImmediate(resolve))
        }
      }

      console.log(`Cleanup complete: Removed ${removedCount} orphaned entries out of ${files.length} checked`)
      return { success: true, type: 'cleanup', checkedEntries: files.length, removedEntries: removedCount }
    }
    catch (error) {
      console.error('Error during orphaned entries cleanup:', error)
      this.emit('error', { type: 'cleanup-error', error })
      return { success: false, type: 'error', operation: 'cleanup', error: error.message }
    }
  }

  async setProcessingDelay(delay) {
    return this.performanceManager.setProcessingDelay(delay)
  }

  setAutoPerformanceMode(enabled) {
    return this.performanceManager.setAutoMode(enabled)
  }

  getPerformanceSettings() {
    return this.performanceManager.getSettings()
  }

  setBatchSize(size) {
    return this.performanceManager.setBatchSize(size)
  }

  setEnableBatching(enabled) {
    return this.performanceManager.setEnableBatching(enabled)
  }
}
