/**
 * StatusManager - Handles throttled status updates and status calculations
 */
export class StatusManager {
  constructor(updateCallback, interval = 1000) {
    this.updateCallback = updateCallback
    this.updateInterval = interval
    this.updateTimer = null
    this.updatePending = false
  }

  /**
   * Throttle status updates to prevent excessive updates
   * @param {Function} getStatusFn - Function that returns the current status object
   */
  throttleUpdate(getStatusFn) {
    if (this.updateTimer) {
      this.updatePending = true
      return
    }

    this.updateCallback(getStatusFn())
    
    this.updateTimer = setTimeout(() => {
      this.updateTimer = null
      if (this.updatePending) {
        this.updatePending = false
        this.throttleUpdate(getStatusFn)
      }
    }, this.updateInterval)
  }

  /**
   * Force an immediate status update
   * @param {Function} getStatusFn - Function that returns the current status object
   */
  forceUpdate(getStatusFn) {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer)
      this.updateTimer = null
    }
    this.updatePending = false
    this.updateCallback(getStatusFn())
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer)
      this.updateTimer = null
      this.updatePending = false
    }
  }

  /**
   * Set a new update interval
   */
  setInterval(interval) {
    this.updateInterval = interval
    this.cleanup()
  }
  
  /**
   * Determine global status based on folder stats
   */
  static determineGlobalStatus(folderStats) {
    if (folderStats.length === 0)
      return 'idle'

    // Check for various states in priority order
    if (folderStats.some(s => s.state === 'error'))
      return 'error'
    if (folderStats.some(s => s.state === 'scanning'))
      return 'scanning'
    if (folderStats.some(s => s.state === 'indexing'))
      return 'indexing'
    if (folderStats.some(s => s.state === 'initializing'))
      return 'initializing'
    if (folderStats.every(s => s.state === 'paused' || s.isPaused))
      return 'paused'

    // If none of the above, all must be in watching state
    return 'watching'
  }
}
