import { EventEmitter } from 'node:events'
import { performanceConfig } from '../config/performanceConfig.js'

/**
 * Manages performance settings for the indexer, including auto-adjustment of processing delay.
 */
export class PerformanceManager extends EventEmitter {
  constructor(defaultDelay = null) {
    super()
    this.isAutoMode = true
    this.baseDelay = defaultDelay ?? performanceConfig.defaultDelay
    this.currentDelay = this.baseDelay
    this.defaultBaseDelay = performanceConfig.defaultDelay // Always use the config value for default
    this.minDelay = performanceConfig.minDelay
    this.maxDelay = performanceConfig.maxDelay
    this.updateInterval = null

    // Batch processing settings
    this.batchSize = performanceConfig.batching.defaultBatchSize
    this.enableBatching = performanceConfig.batching.enableByDefault

    // Smoothing factors
    this.delayHistory = []
    this.batchSizeHistory = []
    this.smoothingWindowSize = 3 // Number of previous values to consider
    this.smoothingFactor = 0.3 // Weight given to new calculations vs history (0-1)

    // Load factors - can be expanded with CPU usage, memory, etc.
    this.loadFactor = 1.0
  }

  /**
   * Calculate the optimal processing delay based on system load factors
   */
  calculateOptimalDelay(activeWatchers, watchingWatchers) {
    if (!this.isAutoMode)
      return this.baseDelay

    // Calculate base load factor (can be extended with CPU/memory metrics)
    this.updateLoadFactor(activeWatchers, watchingWatchers)

    let targetDelay = this.baseDelay

    if (activeWatchers <= 0 && watchingWatchers > 0) {
      // When only watching folders, use lower delay for responsiveness
      targetDelay = Math.round(this.baseDelay * performanceConfig.watchingDelayFactor)
    }
    else {
      // Continuous scaling based on load factor instead of discrete steps
      // Sigmoid-like curve that grows more rapidly as load increases
      const loadScalingFactor = this.loadFactor ** 1.5
      targetDelay = this.baseDelay + (this.maxDelay - this.baseDelay)
      * (1 - 1 / (1 + loadScalingFactor))
    }

    // Apply smoothing with history
    return this.smoothValue(targetDelay, this.delayHistory, this.minDelay, this.maxDelay)
  }

  /**
   * Update the system load factor based on various metrics
   */
  updateLoadFactor(activeWatchers, watchingWatchers) {
    // Base load factor from active watchers (can be extended with more metrics)
    // Continuous scaling from 0 to ~1.0 for normal loads, can exceed 1.0 for heavy loads
    const watcherLoadFactor = activeWatchers === 0
      ? 0
      : (Math.log(1 + activeWatchers) / Math.log(5))

    // Could incorporate CPU usage: cpuUsageFactor = cpuUsagePercent / 100
    // Could incorporate memory usage: memoryFactor = memoryUsagePercent / 100
    // Could incorporate queue size: queueFactor = pendingOperations / 1000

    // For now, just using watcher count as our primary load indicator
    this.loadFactor = watcherLoadFactor

    return this.loadFactor
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
   */
  calculateOptimalBatchSize(activeWatchers) {
    // Start with the default batch size
    const maxBatchSize = performanceConfig.batching.maxBatchSize
    const minBatchSize = performanceConfig.batching.minBatchSize

    // Continuous scaling based on load factor
    const loadImpact = 1 - (1 / (1 + this.loadFactor))
    const targetSize = maxBatchSize - (maxBatchSize - minBatchSize) * loadImpact

    // Apply smoothing
    return this.smoothValue(
      Math.round(targetSize),
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

    // Update load factor first
    this.updateLoadFactor(activeWatchers, watchingWatchers)

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

    // Update load factor first
    this.updateLoadFactor(activeWatchers, watchingWatchers)

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
