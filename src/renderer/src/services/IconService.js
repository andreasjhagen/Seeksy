/**
 * Icon Service
 *
 * Centralized service for loading file icons and thumbnails with:
 * - Request deduplication (prevents duplicate IPC calls for the same path)
 * - Request batching (groups multiple requests into single IPC calls)
 * - LRU caching in renderer process (avoids repeated IPC for recently loaded icons)
 * - Automatic cleanup of stale requests
 */

import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'

// LRU Cache implementation for icons
class LRUCache {
  constructor(maxSize = 500) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  get(key) {
    if (!this.cache.has(key)) {
      return undefined
    }
    // Move to end (most recently used)
    const value = this.cache.get(key)
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key, value) {
    // Delete if exists to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Evict oldest if at capacity
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }
    this.cache.set(key, value)
  }

  has(key) {
    return this.cache.has(key)
  }

  delete(key) {
    return this.cache.delete(key)
  }

  clear() {
    this.cache.clear()
  }

  get size() {
    return this.cache.size
  }
}

class IconService {
  constructor() {
    // LRU caches for different icon types
    this.thumbnailCache = new LRUCache(200) // Thumbnails are larger, cache fewer
    this.fileIconCache = new LRUCache(500) // File icons are smaller, cache more

    // Pending requests (for deduplication)
    this.pendingThumbnails = new Map() // path -> Promise
    this.pendingFileIcons = new Map() // path -> Promise

    // Batch queues
    this.thumbnailBatchQueue = new Map() // path -> { resolve, reject }[]
    this.fileIconBatchQueue = new Map() // path -> { resolve, reject }[]

    // Batch processing timers
    this.thumbnailBatchTimer = null
    this.fileIconBatchTimer = null

    // Configuration
    this.batchDelay = 16 // ~1 frame at 60fps
    this.maxBatchSize = 20
  }

  /**
   * Get a thumbnail for an image file
   * @param {string} path - File path
   * @returns {Promise<string|null>} - Base64 encoded thumbnail or null
   */
  async getThumbnail(path) {
    if (!path)
      return null

    // Check cache first
    const cached = this.thumbnailCache.get(path)
    if (cached !== undefined) {
      return cached
    }

    // Check for pending request (deduplication)
    if (this.pendingThumbnails.has(path)) {
      return this.pendingThumbnails.get(path)
    }

    // Create a new promise for this request
    const promise = new Promise((resolve, reject) => {
      // Add to batch queue
      if (!this.thumbnailBatchQueue.has(path)) {
        this.thumbnailBatchQueue.set(path, [])
      }
      this.thumbnailBatchQueue.get(path).push({ resolve, reject })

      // Schedule batch processing
      this._scheduleThumbnailBatch()
    })

    // Store the pending promise for deduplication
    this.pendingThumbnails.set(path, promise)

    // Clean up pending state when done
    promise.finally(() => {
      this.pendingThumbnails.delete(path)
    })

    return promise
  }

  /**
   * Get a file icon
   * @param {string} path - File path
   * @param {string} fileType - Type of file (directory, application, etc.)
   * @returns {Promise<string|null>} - Icon data or null
   */
  async getFileIcon(path, fileType) {
    if (!path || fileType === 'directory' || fileType === 'application') {
      return null
    }

    // Check cache first
    const cached = this.fileIconCache.get(path)
    if (cached !== undefined) {
      return cached
    }

    // Check for pending request (deduplication)
    if (this.pendingFileIcons.has(path)) {
      return this.pendingFileIcons.get(path)
    }

    // Create a new promise for this request
    const promise = new Promise((resolve, reject) => {
      // Add to batch queue
      if (!this.fileIconBatchQueue.has(path)) {
        this.fileIconBatchQueue.set(path, [])
      }
      this.fileIconBatchQueue.get(path).push({ resolve, reject })

      // Schedule batch processing
      this._scheduleFileIconBatch()
    })

    // Store the pending promise for deduplication
    this.pendingFileIcons.set(path, promise)

    // Clean up pending state when done
    promise.finally(() => {
      this.pendingFileIcons.delete(path)
    })

    return promise
  }

  /**
   * Schedule thumbnail batch processing
   * @private
   */
  _scheduleThumbnailBatch() {
    if (this.thumbnailBatchTimer)
      return

    this.thumbnailBatchTimer = setTimeout(() => {
      this._processThumbnailBatch()
      this.thumbnailBatchTimer = null
    }, this.batchDelay)
  }

  /**
   * Schedule file icon batch processing
   * @private
   */
  _scheduleFileIconBatch() {
    if (this.fileIconBatchTimer)
      return

    this.fileIconBatchTimer = setTimeout(() => {
      this._processFileIconBatch()
      this.fileIconBatchTimer = null
    }, this.batchDelay)
  }

  /**
   * Process thumbnail batch
   * @private
   */
  async _processThumbnailBatch() {
    if (this.thumbnailBatchQueue.size === 0)
      return

    // Take up to maxBatchSize items from queue
    const batch = new Map()
    let count = 0

    for (const [path, callbacks] of this.thumbnailBatchQueue) {
      batch.set(path, callbacks)
      this.thumbnailBatchQueue.delete(path)
      count++
      if (count >= this.maxBatchSize)
        break
    }

    // Process each thumbnail individually (IPC doesn't support batch yet)
    // But we've already deduplicated, so this is still efficient
    const paths = Array.from(batch.keys())

    await Promise.all(paths.map(async (path) => {
      const callbacks = batch.get(path)
      try {
        const data = await window.api.invoke(IPC_CHANNELS.GET_THUMBNAIL, path)

        // Cache the result
        this.thumbnailCache.set(path, data)

        // Resolve all waiting callbacks
        callbacks.forEach(({ resolve }) => resolve(data))
      }
      catch (error) {
        console.error('Failed to load thumbnail:', error)
        // Cache null to prevent repeated failures
        this.thumbnailCache.set(path, null)
        callbacks.forEach(({ resolve }) => resolve(null))
      }
    }))

    // If there are more items in queue, schedule another batch
    if (this.thumbnailBatchQueue.size > 0) {
      this._scheduleThumbnailBatch()
    }
  }

  /**
   * Process file icon batch
   * @private
   */
  async _processFileIconBatch() {
    if (this.fileIconBatchQueue.size === 0)
      return

    // Take up to maxBatchSize items from queue
    const batch = new Map()
    let count = 0

    for (const [path, callbacks] of this.fileIconBatchQueue) {
      batch.set(path, callbacks)
      this.fileIconBatchQueue.delete(path)
      count++
      if (count >= this.maxBatchSize)
        break
    }

    // Process each icon individually
    const paths = Array.from(batch.keys())

    await Promise.all(paths.map(async (path) => {
      const callbacks = batch.get(path)
      try {
        const icon = await window.api.invoke(IPC_CHANNELS.GET_FILE_ICON, path)

        // Cache the result
        this.fileIconCache.set(path, icon)

        // Resolve all waiting callbacks
        callbacks.forEach(({ resolve }) => resolve(icon))
      }
      catch (error) {
        console.error('Failed to load file icon:', error)
        // Cache null to prevent repeated failures
        this.fileIconCache.set(path, null)
        callbacks.forEach(({ resolve }) => resolve(null))
      }
    }))

    // If there are more items in queue, schedule another batch
    if (this.fileIconBatchQueue.size > 0) {
      this._scheduleFileIconBatch()
    }
  }

  /**
   * Preload thumbnails for a list of files (images and videos)
   * Useful when displaying search results
   * @param {Array<{path: string, name: string}>} files - Files to preload
   */
  preloadThumbnails(files) {
    const thumbnailPaths = files
      .filter(file => this._supportsThumbnail(file.name))
      .map(file => file.path)
      .filter(path => !this.thumbnailCache.has(path))

    // Trigger loading without waiting
    thumbnailPaths.forEach(path => this.getThumbnail(path))
  }

  /**
   * Preload file icons for a list of files
   * @param {Array<{path: string, type?: string}>} files - Files to preload
   */
  preloadFileIcons(files) {
    const paths = files
      .filter(file => file.type !== 'directory' && file.type !== 'application')
      .map(file => file.path)
      .filter(path => !this.fileIconCache.has(path))

    // Trigger loading without waiting
    paths.forEach(path => this.getFileIcon(path))
  }

  /**
   * Check if a file is an image based on extension
   * @param {string} filename - Filename to check
   * @returns {boolean} True if the file is an image
   * @private
   */
  _isImageFile(filename) {
    if (!filename)
      return false
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif']
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    return imageExtensions.includes(ext)
  }

  /**
   * Check if a file is a video based on extension
   * @param {string} filename - Filename to check
   * @returns {boolean} True if the file is a video
   * @private
   */
  _isVideoFile(filename) {
    if (!filename)
      return false
    const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.mpeg', '.mpg', '.m4v', '.3gp']
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    return videoExtensions.includes(ext)
  }

  /**
   * Check if a file is an audio file based on extension
   * @param {string} filename - Filename to check
   * @returns {boolean} True if the file is an audio file
   * @private
   */
  _isAudioFile(filename) {
    if (!filename)
      return false
    const audioExtensions = ['.mp3', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.wav', '.aiff', '.ape', '.opus']
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    return audioExtensions.includes(ext)
  }

  /**
   * Check if a file supports thumbnail generation (images, videos, and audio with cover art)
   * @param {string} filename - Filename to check
   * @returns {boolean} True if the file supports thumbnails
   * @private
   */
  _supportsThumbnail(filename) {
    return this._isImageFile(filename) || this._isVideoFile(filename) || this._isAudioFile(filename)
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.thumbnailCache.clear()
    this.fileIconCache.clear()
  }

  /**
   * Get cache statistics
   * @returns {{thumbnails: number, fileIcons: number}} Cache size statistics
   */
  getCacheStats() {
    return {
      thumbnails: this.thumbnailCache.size,
      fileIcons: this.fileIconCache.size,
    }
  }
}

// Export singleton instance
export const iconService = new IconService()
