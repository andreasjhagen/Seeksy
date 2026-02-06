import { EventEmitter } from 'node:events'
import { stat } from 'node:fs/promises'
import chokidar from 'chokidar'
import { fileDB } from '../database/database.js'
import { countFolderContent } from '../disk-reader/utils/countFiles.js'
import { createIgnorePatterns } from './config/exclusionPatterns.js'
import { performanceConfig } from './config/performanceConfig.js'
import { watcherConfig } from './config/watcherConfig.js'
import { FileProcessor } from './FileProcessor.js'

// Queue size limit to prevent unbounded growth
const MAX_QUEUE_SIZE = 10000

export class FolderWatcher extends EventEmitter {
  constructor(watchPath, options = {}) {
    super()
    this.watchPath = watchPath
    this.depth = options.depth ?? Infinity
    this.processor = new FileProcessor()

    // State
    this.isPaused = false
    this.initialScanComplete = false
    this.isProcessing = false
    this.processingQueue = []
    this.directoryQueue = [] // Separate queue for directories (lower priority)
    this.queueOverflowPaused = false // Track if we paused due to queue overflow

    // Batch processing options
    this.batchSize = options.batchSize ?? watcherConfig.processing.defaultBatchSize
    this.enableBatching = options.enableBatching ?? watcherConfig.processing.enableBatching
    this.batchCollectTime = options.batchCollectTime ?? watcherConfig.processing.batchCollectTime
    this.batchTimer = null
    this.pendingEvents = new Map() // Stores latest event for each path

    // Stats - pre-counted total for stable progress calculation
    this.stats = {
      totalFiles: 0, // Will be set by pre-count before indexing starts
      processedFiles: 0,
      state: 'initializing',
      preCountComplete: false, // Track if we've finished counting
    }

    // Configuration
    this.processingDelay = options.processingDelay ?? watcherConfig.processing.defaultDelay
    this.statusUpdateInterval = options.statusUpdateInterval ?? watcherConfig.status.defaultUpdateInterval

    this.processor.on('error', error => this.emit('error', error))
  }

  async initialize() {
    try {
      this.stats.state = 'scanning'
      this.emitStatus()

      // Add the watched folder itself to the folders table so it appears in search results
      await this._addWatchedFolderToDatabase()

      // Pre-count files first for stable progress calculation
      // This prevents progress bar jumps as the total is known before indexing starts
      await this._preCountFiles()

      // Setup watcher and status updates
      this.setupWatcher()
      this.startStatusUpdates()

      return this.getStatus()
    }
    catch (error) {
      this.stats.state = 'error'
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Adds the watched folder itself to the folders table
   * This ensures the watched folder shows up in search results
   * @private
   */
  async _addWatchedFolderToDatabase() {
    try {
      const stats = await stat(this.watchPath)
      await fileDB.updateFolder(this.watchPath, {
        modifiedAt: stats.mtimeMs,
        watchedFolderPath: this.watchPath, // The watched folder is its own parent
      })
    }
    catch (error) {
      console.error(`Failed to add watched folder to database: ${this.watchPath}`, error)
      // Non-critical error, continue with initialization
    }
  }

  /**
   * Pre-counts files in the watch path to establish a stable total for progress calculation
   * This prevents progress bar jumps during indexing
   * @private
   */
  async _preCountFiles() {
    try {
      const { fileCount, folderCount } = await countFolderContent(this.watchPath, this.depth)
      // Total includes both files and folders since we index both
      this.stats.totalFiles = fileCount + folderCount
      this.stats.preCountComplete = true
    }
    catch (error) {
      console.error(`Failed to pre-count files in: ${this.watchPath}`, error)
      // Non-critical - we'll fall back to incremental counting if this fails
      this.stats.preCountComplete = false
    }
  }

  setupWatcher() {
    const watcherOptions = {
      ignored: createIgnorePatterns(),
      depth: this.depth === Infinity ? undefined : this.depth,
      persistent: true,
      followSymlinks: watcherConfig.watcher.followSymlinks,
      ignorePermissionErrors: true,
      awaitWriteFinish: {
        stabilityThreshold: watcherConfig.watcher.stabilityThreshold,
        pollInterval: watcherConfig.watcher.pollInterval,
      },
      usePolling: watcherConfig.watcher.usePolling,
      atomic: true,
      disableGlobbing: true,
      alwaysStat: true, // Enable this option to always receive stats objects with file events
    }

    this.watcher = chokidar
      .watch(this.watchPath, watcherOptions)
      .on('add', (path, stats) => this.queueFileEvent('add', path, stats))
      .on('addDir', (path, stats) => {
        // Queue directories separately for lower-priority processing
        // Skip the root watched path itself
        if (path !== this.watchPath && !this.isPaused) {
          this.directoryQueue.push({ event: 'addDir', path, stats })
          // Only increment totalFiles if pre-count failed or this is after initial scan
          if (!this.stats.preCountComplete || this.initialScanComplete) {
            this.stats.totalFiles++
          }
        }
      })
      .on('change', (path, stats) => this.queueFileEvent('change', path, stats))
      .on('unlink', path => this.queueFileEvent('remove', path))
      .on('unlinkDir', (path) => {
        if (path !== this.watchPath) {
          this.queueFileEvent('removeDir', path)
        }
      })
      .on('ready', () => {
        this.initialScanComplete = true

        // Start processing directories after files are discovered
        const hasWork = this.processingQueue.length > 0 || this.directoryQueue.length > 0
        this.stats.state = hasWork ? 'indexing' : 'watching'
        this.emitStatus()
        this.emit('ready')
        this.emit('initial-scan-complete', this.getStatus())

        if (hasWork && !this.isProcessing) {
          this.processQueue()
        }
      })
      .on('error', (error) => {
        this.stats.state = 'error'
        this.emit('error', error)
      })
  }

  queueFileEvent(event, path, stats = null) {
    // Chokidar already filters based on createIgnorePatterns(), no need for duplicate check
    if (this.isPaused)
      return

    // Backpressure: if queue is too large, apply throttling
    if (this.processingQueue.length >= MAX_QUEUE_SIZE && !this.queueOverflowPaused) {
      this.queueOverflowPaused = true
      console.warn(`Queue overflow (${MAX_QUEUE_SIZE} items) - applying backpressure`)
      // Flush pending events immediately to catch up
      if (this.pendingEvents.size > 0) {
        this.flushPendingEvents()
      }
    }

    // Update stats based on event
    // Only adjust totalFiles if pre-count failed (fallback to incremental counting)
    // or if this is a change after the initial scan (file added/removed while watching)
    if (!this.stats.preCountComplete || this.initialScanComplete) {
      if (event === 'add' && !this.stats.preCountComplete) {
        this.stats.totalFiles++
      }
      else if (event === 'add' && this.initialScanComplete) {
        // New file added after initial scan - increment total
        this.stats.totalFiles++
      }
      else if (event === 'remove' || event === 'removeDir') {
        this.stats.totalFiles = Math.max(0, this.stats.totalFiles - 1)
      }
    }

    if (this.enableBatching && this.initialScanComplete) {
      // Store or update the event for this path
      this.pendingEvents.set(path, { event, path, stats })

      // Clear existing timer and start a new one
      if (this.batchTimer)
        clearTimeout(this.batchTimer)
      this.batchTimer = setTimeout(() => this.flushPendingEvents(), this.batchCollectTime)
    }
    else {
      // Add to processing queue with stats if available
      this.processingQueue.push({ event, path, stats })
    }

    // Update state if needed
    if (this.stats.state === 'watching') {
      this.stats.state = 'indexing'
      this.emitStatus()
    }

    // Start queue processing if not already running and not batching
    // or if we're batching but this is during initial scan
    if (!this.isProcessing && !this.isPaused
      && (!this.enableBatching || !this.initialScanComplete)) {
      this.processQueue()
    }
  }

  flushPendingEvents() {
    if (this.pendingEvents.size === 0)
      return

    // Add all pending events to the queue
    this.processingQueue.push(...this.pendingEvents.values())

    // Clear the pending events
    this.pendingEvents.clear()
    this.batchTimer = null

    // Start processing if not already in progress
    if (!this.isProcessing && !this.isPaused) {
      this.processQueue()
    }
  }

  async processQueue() {
    if (this.isPaused || this.isProcessing)
      return

    this.isProcessing = true

    try {
      // Process file events first (higher priority)
      await this._processFileQueue()

      // Process directory events (lower priority, after all file events)
      await this._processDirectoryQueue()

      // Update state when all queues are empty
      if (this._areQueuesEmpty() && !this.isPaused && this.initialScanComplete) {
        this.stats.state = 'watching'
        this.processor.clearProcessedPaths()
        this.emit('processing-complete', this.getStatus())
      }

      // Reset overflow flag when queue is under control
      if (this.queueOverflowPaused && this.processingQueue.length < MAX_QUEUE_SIZE / 2) {
        this.queueOverflowPaused = false
        console.log('Queue backpressure released')
      }
    }
    finally {
      this.isProcessing = false
      this.emitStatus()

      // If items were added during processing, restart the queue
      if (this.processingQueue.length > 0 && !this.isPaused) {
        setTimeout(() => this.processQueue(), 10)
      }
      else if (this.pendingEvents.size > 0 && this.enableBatching) {
        // Check if we have pending events to flush
        this.flushPendingEvents()
      }
    }
  }

  /**
   * Process the file event queue (add, change, remove events)
   * @private
   */
  async _processFileQueue() {
    while (this.processingQueue.length > 0 && !this.isPaused) {
      const batchSize = this._getCurrentBatchSize()
      const batch = this.processingQueue.splice(0, batchSize)

      // Group batch by event type for efficient processing
      const adds = batch.filter(item => item.event === 'add')
      const changes = batch.filter(item => item.event === 'change')
      const removes = batch.filter(item => item.event === 'remove' || item.event === 'removeDir')

      // Process removes first (faster operations)
      if (removes.length > 0) {
        await this._processRemovals(removes)
      }

      // Process adds and changes
      const upserts = [...adds, ...changes]
      if (upserts.length > 0) {
        await this._processUpserts(upserts)
        this.processor.flushPendingWrites()
      }

      this.emitStatus()

      if (!this.isPaused && this.processingQueue.length > 0) {
        await this._delay(this.processingDelay)
      }
    }
  }

  /**
   * Process the directory queue (lower priority than files)
   * @private
   */
  async _processDirectoryQueue() {
    while (this.directoryQueue.length > 0 && !this.isPaused) {
      const batchSize = performanceConfig.batching.initialScanBatchSize
      const batch = this.directoryQueue.splice(0, batchSize)

      await Promise.all(batch.map(async ({ path, stats }) => {
        try {
          await this.processor.processPath(path, stats)
          this.stats.processedFiles++
        }
        catch (error) {
          console.error(`Error processing directory ${path}:`, error)
        }
      }))

      this.processor.flushPendingWrites()
      this.emitStatus()

      if (!this.isPaused && this.directoryQueue.length > 0) {
        await this._delay(this.processingDelay)
      }
    }
  }

  /**
   * Process removal events (files and directories)
   * @private
   */
  async _processRemovals(removes) {
    await Promise.all(removes.map(async ({ path }) => {
      try {
        await this.processor.removePath(path)
        this.stats.processedFiles = Math.max(0, this.stats.processedFiles - 1)
      }
      catch (error) {
        console.error(`Error removing ${path}:`, error)
      }
    }))
  }

  /**
   * Process add/change events (files)
   * @private
   */
  async _processUpserts(items) {
    await Promise.all(items.map(async ({ event, path, stats }) => {
      try {
        await this.processor.processPath(path, stats)
        if (event === 'add') {
          this.stats.processedFiles++
        }
      }
      catch (error) {
        console.error(`Error processing ${path}:`, error)
      }
    }))
  }

  /**
   * Get the current batch size based on scan state
   * @private
   */
  _getCurrentBatchSize() {
    const batchActuallyEnabled = this.enableBatching && this.initialScanComplete
    return batchActuallyEnabled
      ? this.batchSize
      : performanceConfig.batching.initialScanBatchSize
  }

  /**
   * Check if all queues are empty
   * @private
   */
  _areQueuesEmpty() {
    return this.processingQueue.length === 0 && this.directoryQueue.length === 0
  }

  /**
   * Async delay helper
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  startStatusUpdates() {
    this.stopStatusUpdates()
    this.statusUpdateTimer = setInterval(() => {
      if (this.stats.state === 'indexing') {
        this.emitStatus()
      }
    }, this.statusUpdateInterval)
  }

  stopStatusUpdates() {
    if (this.statusUpdateTimer) {
      clearInterval(this.statusUpdateTimer)
      this.statusUpdateTimer = null
    }
  }

  emitStatus() {
    this.emit('status-update', this.getStatus())
  }

  getStatus() {
    return {
      path: this.watchPath,
      totalFiles: this.stats.totalFiles,
      processedFiles: this.stats.processedFiles,
      state: this.stats.state,
      progress: this.calculateProgress(),
      isPaused: this.isPaused,
      initialScanComplete: this.initialScanComplete,
      depth: this.depth,
      pendingTasks: this.processingQueue.length + this.directoryQueue.length,
    }
  }

  calculateProgress() {
    return this.stats.totalFiles > 0
      ? Math.min(100, Math.round((this.stats.processedFiles / this.stats.totalFiles) * 100))
      : 0
  }

  async pause() {
    if (this.isPaused)
      return false

    this.isPaused = true
    this.stats.state = 'paused'
    this.stopStatusUpdates()

    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }

    this.emitStatus()
    this.emit('paused')
    return true
  }

  async resume() {
    if (!this.isPaused)
      return false

    try {
      // Reset state for fresh scan
      this.initialScanComplete = false
      this.stats.totalFiles = 0
      this.stats.processedFiles = 0
      this.stats.preCountComplete = false
      this.processingQueue = []
      this.directoryQueue = []
      this.stats.state = 'scanning'
      this.queueOverflowPaused = false

      // Pre-count files first for stable progress calculation
      await this._preCountFiles()

      // Set up watcher and updates
      this.setupWatcher()
      this.startStatusUpdates()
      this.isPaused = false

      this.emitStatus()
      this.emit('resumed')
      return true
    }
    catch (error) {
      console.error('Error during watcher resume:', error)
      return false
    }
  }

  async cleanup() {
    this.stopStatusUpdates()

    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }

    // Flush any pending events before cleanup
    if (this.pendingEvents.size > 0) {
      this.flushPendingEvents()
    }

    this.isPaused = true
    this.stats.state = 'closed'
    this.processingQueue = []
    this.directoryQueue = []
    this.isProcessing = false

    return true
  }

  setProcessingDelay(delay) {
    this.processingDelay = delay
    return true
  }

  setBatchSize(size) {
    if (size > 0) {
      this.batchSize = size
      return true
    }
    return false
  }

  setEnableBatching(enable) {
    const wasEnabled = this.enableBatching
    this.enableBatching = enable

    // If we're turning batching on, start the timer
    if (!wasEnabled && enable && this.pendingEvents.size > 0) {
      this.flushPendingEvents()
    }

    return true
  }
}
