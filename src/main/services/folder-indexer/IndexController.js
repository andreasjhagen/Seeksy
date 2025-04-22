import { EventEmitter } from 'node:events'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileDB } from '../database/database.js'
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
      // Clean up orphaned entries before initializing watchers
      console.log('Starting orphaned entries cleanup...')
      await this.cleanupOrphanedDatabaseEntries()

      const folders = await fileDB.getWatchedFolders()

      // Create all watchers but keep them paused initially
      for (const folder of folders) {
        await this._initWatcher(folder.path, { depth: folder.depth, startPaused: true })
        // Add a small delay between initializations
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      this.initialized = true

      // Start the first watcher if any exist
      this._processWatcherQueue()

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

  async _initWatcher(watchPath, options = { depth: Infinity, startPaused: false }) {
    if (this.watchers.has(watchPath))
      return

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
        if (!watcher.isPaused) {
          await this.restartWatcher(watchPath)
        }
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
  async addWatchPath(watchPath, options = { depth: Infinity }) {
    if (!this.initialized)
      await this.initialize()

    // Queue this watcher if there's already an active indexing watcher
    const shouldQueue = this.currentActiveIndexingWatchPath !== null || this.watcherQueue.length > 0

    const result = await this._initWatcher(watchPath, {
      ...options,
      startPaused: shouldQueue,
    })

    // If there's no current active indexing watcher and this wasn't queued,
    // set it as the active indexing watcher
    if (!shouldQueue && result) {
      this.currentActiveIndexingWatchPath = watchPath
    }

    // If there's no active indexing watcher but we have watchers in queue, process the queue
    if (this.currentActiveIndexingWatchPath === null && this.watcherQueue.length > 0) {
      this._processWatcherQueue()
    }

    return result
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

      // Process in batches
      const batchSize = 100
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize)
        await Promise.all(
          batch.map(async (file) => {
            try {
              // 'file' is the path directly, not an object with a path property
              const filePath = typeof file === 'object' ? file.path : file
              await access(filePath)
            }
            catch {
              const filePath = typeof file === 'object' ? file.path : file
              console.log(`Removing orphaned entry: ${filePath}`)
              await fileDB.removePath(filePath)
              removedCount++
            }
          }),
        )
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
