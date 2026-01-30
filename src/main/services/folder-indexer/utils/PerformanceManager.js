import { EventEmitter } from 'node:events'
import { performanceConfig } from '../config/performanceConfig.js'

/**
 * Manages performance settings for the indexer, including auto-adjustment of processing delay.
 *
 * Auto Mode:
 * - Single folder indexing: Uses aggressive settings (low delay, high batch size)
 * - Multiple folders: Scales delay up and batch size down proportionally
 * - Only watching: Uses minimal delay for responsiveness
 *
 * Manual Mode:
 * - Uses user-defined settings until app restart
 * - Provides override capability while preserving auto mode as default
 */
export class PerformanceManager extends EventEmitter {
  constructor(defaultDelay = null) {
    super()
    this.isAutoMode = true
    this.baseDelay = defaultDelay ?? performanceConfig.defaultDelay
    this.currentDelay = this.baseDelay
    this.defaultBaseDelay = performanceConfig.defaultDelay
    this.minDelay = performanceConfig.minDelay
    this.maxDelay = performanceConfig.maxDelay
    this.updateInterval = null

    // Batch processing settings
    this.batchSize = performanceConfig.batching.defaultBatchSize
    this.enableBatching = performanceConfig.batching.enableByDefault

    // Smoothing factors for gradual transitions
    this.delayHistory = []
    this.batchSizeHistory = []
    this.smoothingWindowSize = 3
    this.smoothingFactor = 0.3
  }

  /**
   * Calculate the optimal processing delay based on system state
   * In auto mode, this provides intelligent scaling based on workload
   */
  calculateOptimalDelay(activeWatchers, watchingWatchers) {
    if (!this.isAutoMode)
      return this.baseDelay

    const autoConfig = performanceConfig.auto

    // Case 1: Only watching (all indexing complete)
    if (activeWatchers === 0 && watchingWatchers > 0) {
      return Math.round(this.minDelay * performanceConfig.watchingDelayFactor)
    }

    // Case 2: Single folder indexing - use aggressive settings
    if (activeWatchers === 1) {
      return autoConfig.singleFolderDelay
    }

    // Case 3: Multiple folders - scale delay based on active count
    // Each additional folder increases delay proportionally
    const targetDelay = autoConfig.singleFolderDelay
      * (autoConfig.multiFolderDelayMultiplier ** (activeWatchers - 1))

    // Apply smoothing and constraints
    return this.smoothValue(
      Math.round(Math.min(targetDelay, this.maxDelay)),
      this.delayHistory,
      this.minDelay,
      this.maxDelay,
    )
  }

  /**
   * Apply smoothing to a value using historical data
   */
  smoothValue(newValue, history, minValue, maxValue) {
    // Add the new value to history
    history.push(newValue)

    // Keep only the most recent values
    if (history.length > this.smoothingWindowSize) {
      history.shift()
    }

    // Calculate weighted average
    let sum = 0
    let weightSum = 0
    const weightBase = 1 - this.smoothingFactor

    for (let i = 0; i < history.length; i++) {
      // More recent values get higher weight
      const weight = weightBase ** (history.length - i - 1)
      sum += history[i] * weight
      weightSum += weight
    }

    // Apply constraints
    return Math.max(minValue, Math.min(maxValue, Math.round(sum / weightSum)))
  }

  /**
   * Calculate the optimal batch size based on system load
   * Auto mode uses larger batches when fewer watchers are active
   */
  calculateOptimalBatchSize(activeWatchers) {
    if (!this.isAutoMode)
      return this.batchSize

    const autoConfig = performanceConfig.auto
    const maxBatchSize = performanceConfig.batching.maxBatchSize
    const minBatchSize = performanceConfig.batching.minBatchSize

    // No active watchers - return default
    if (activeWatchers === 0) {
      return performanceConfig.batching.defaultBatchSize
    }

    // Single folder - use aggressive batch size
    if (activeWatchers === 1) {
      return autoConfig.singleFolderBatchSize
    }

    // Multiple folders - reduce batch size proportionally
    // Each additional folder divides batch size
    const targetSize = Math.round(
      autoConfig.singleFolderBatchSize / autoConfig.multiFolderBatchDivisor ** (activeWatchers - 1),
    )

    // Apply smoothing and constraints
    return this.smoothValue(
      Math.max(minBatchSize, Math.min(maxBatchSize, targetSize)),
      this.batchSizeHistory,
      minBatchSize,
      maxBatchSize,
    )
  }

  /**
   * Update performance settings based on current system state
   */
  updatePerformanceSettings(stats) {
    if (!this.isAutoMode) {
      return {
        delay: this.currentDelay,
        batchSize: this.batchSize,
      }
    }

    const activeWatchers = stats.activeIndexingWatchers || 0
    const watchingWatchers = stats.watchingWatchers || 0

    const newDelay = this.calculateOptimalDelay(activeWatchers, watchingWatchers)
    const newBatchSize = this.calculateOptimalBatchSize(activeWatchers)

    let changed = false

    // Only update delay if there's a significant change (>10ms)
    if (Math.abs(this.currentDelay - newDelay) > 10) {
      this.currentDelay = newDelay
      changed = true
    }

    // Update batch size if changed
    if (this.batchSize !== newBatchSize) {
      this.batchSize = newBatchSize
      changed = true
    }

    if (changed) {
      this.emit('settings-updated', {
        delay: this.currentDelay,
        batchSize: this.batchSize,
        enableBatching: this.enableBatching,
      })
    }

    return {
      delay: this.currentDelay,
      batchSize: this.batchSize,
    }
  }

  /**
   * Update the processing delay based on current system state
   */
  updateDelay(stats) {
    if (!this.isAutoMode)
      return this.currentDelay

    const activeWatchers = stats.activeIndexingWatchers || 0
    const watchingWatchers = stats.watchingWatchers || 0

    const newDelay = this.calculateOptimalDelay(activeWatchers, watchingWatchers)

    // Only update if there's a significant change (>10ms)
    if (Math.abs(this.currentDelay - newDelay) > 10) {
      this.currentDelay = newDelay
      this.emit('delay-updated', this.currentDelay)
    }

    return this.currentDelay
  }

  /**
   * Set the processing delay manually
   */
  setProcessingDelay(delay) {
    const validDelay = Math.max(this.minDelay, Math.min(this.maxDelay, delay))

    if (this.isAutoMode) {
      // In auto mode, we update the base delay
      this.baseDelay = validDelay
      // Also recalculate current delay based on new base delay
      this.updateDelay({
        activeIndexingWatchers: 0,
        watchingWatchers: 0,
      })
    }
    else {
      // In manual mode, we update both base and current delay
      this.baseDelay = validDelay
      this.currentDelay = validDelay
    }

    this.emit('delay-updated', this.currentDelay)
    return this.currentDelay
  }

  /**
   * Set the batch size manually
   */
  setBatchSize(size) {
    const validSize = Math.max(
      performanceConfig.batching.minBatchSize,
      Math.min(performanceConfig.batching.maxBatchSize, size),
    )

    this.batchSize = validSize
    this.emit('settings-updated', {
      delay: this.currentDelay,
      batchSize: this.batchSize,
      enableBatching: this.enableBatching,
    })

    return this.batchSize
  }

  /**
   * Enable or disable batching
   */
  setEnableBatching(enabled) {
    if (this.enableBatching === enabled)
      return

    this.enableBatching = enabled
    this.emit('settings-updated', {
      delay: this.currentDelay,
      batchSize: this.batchSize,
      enableBatching: this.enableBatching,
    })

    return true
  }

  /**
   * Toggle auto performance mode
   */
  setAutoMode(enabled) {
    if (this.isAutoMode === enabled)
      return

    this.isAutoMode = enabled

    if (enabled) {
      // When switching to auto mode, start from current delay as the base delay
      // and let the next status update recalculate
      this.baseDelay = this.currentDelay
    }
    else {
      // Going back to manual - preserve current delay settings
      // This allows users to start manual adjustments from the last auto value
      this.baseDelay = this.currentDelay
    }

    this.emit('delay-updated', this.currentDelay)
    this.emit('mode-changed', enabled)
    return true
  }

  /**
   * Get current performance settings
   */
  getSettings() {
    return {
      isAutoMode: this.isAutoMode,
      baseDelay: this.baseDelay,
      currentDelay: this.currentDelay,
      defaultDelay: this.defaultBaseDelay,
      minDelay: this.minDelay,
      maxDelay: this.maxDelay,
      batchSize: this.batchSize,
      enableBatching: this.enableBatching,
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }
}
