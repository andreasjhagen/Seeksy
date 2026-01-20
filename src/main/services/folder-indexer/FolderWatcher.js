import { EventEmitter } from 'node:events'
import chokidar from 'chokidar'
import { createIgnorePatterns } from './config/exclusionPatterns.js'
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
    this.queueOverflowPaused = false // Track if we paused due to queue overflow

    // Batch processing options
    this.batchSize = options.batchSize ?? watcherConfig.processing.defaultBatchSize
    this.enableBatching = options.enableBatching ?? watcherConfig.processing.enableBatching
    this.batchCollectTime = options.batchCollectTime ?? watcherConfig.processing.batchCollectTime
    this.batchTimer = null
    this.pendingEvents = new Map() // Stores latest event for each path

    // Stats - use discovered count instead of pre-counting
    this.stats = {
      totalFiles: 0, // Will be updated incrementally during scan
      processedFiles: 0,
      state: 'initializing',
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

      // Skip pre-counting - we'll discover files incrementally for better UX
      // The totalFiles count will be updated as chokidar discovers files

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
      .on('change', (path, stats) => this.queueFileEvent('change', path, stats))
      .on('unlink', path => this.queueFileEvent('remove', path))
      .on('ready', () => {
        this.initialScanComplete = true
        this.stats.state = this.processingQueue.length > 0 ? 'indexing' : 'watching'
        this.emitStatus()
        this.emit('ready')
        this.emit('initial-scan-complete', this.getStatus())

        if (this.processingQueue.length > 0 && !this.isProcessing) {
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

    // Update stats based on event - increment discovery count for add events
    if (event === 'add') {
      this.stats.totalFiles++
    }
    else if (event === 'remove') {
      this.stats.totalFiles = Math.max(0, this.stats.totalFiles - 1)
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
      while (this.processingQueue.length > 0 && !this.isPaused) {
        // Process in batches if enabled and not during initial scan
        const batchActuallyEnabled = this.enableBatching && this.initialScanComplete
        const batchSize = batchActuallyEnabled ? this.batchSize : 1
        const batch = this.processingQueue.splice(0, batchSize)

        // Group batch by event type for more efficient processing
        const adds = batch.filter(item => item.event === 'add')
        const changes = batch.filter(item => item.event === 'change')
        const removes = batch.filter(item => item.event === 'remove')

        // Process removes first as they're typically faster
        if (removes.length > 0) {
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

        // Process adds and changes
        if (adds.length > 0 || changes.length > 0) {
          const items = [...adds, ...changes]
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

        this.emitStatus()

        // Add delay between batches
        if (!this.isPaused && this.processingQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, this.processingDelay))
        }
      }

      // Update state when queue is empty
      if (this.processingQueue.length === 0 && !this.isPaused && this.initialScanComplete) {
        this.stats.state = 'watching'
        // Clear processedPaths after initial scan to free memory
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
      pendingTasks: this.processingQueue.length || 0,
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
      // Reset state without pre-counting - discover files incrementally
      this.initialScanComplete = false
      this.stats.totalFiles = 0
      this.stats.processedFiles = 0
      this.processingQueue = []
      this.stats.state = 'scanning'
      this.queueOverflowPaused = false

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
