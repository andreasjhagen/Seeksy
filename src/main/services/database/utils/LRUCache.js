/**
 * Simple LRU (Least Recently Used) Cache implementation
 *
 * Provides a bounded cache with automatic eviction of least recently used items.
 * Supports optional case-insensitive keys for Windows path compatibility.
 */

// Determine if we're on Windows for case-insensitive key handling
const isWindows = process.platform === 'win32'

export class LRUCache {
  /**
   * Create a new LRU cache
   * @param {number} maxSize - Maximum number of items to store
   * @param {number} ttl - Time to live in milliseconds (0 = no expiry)
   * @param {boolean} caseInsensitive - Whether keys should be case-insensitive (default: auto-detect based on OS)
   */
  constructor(maxSize = 1000, ttl = 0, caseInsensitive = isWindows) {
    this.maxSize = maxSize
    this.ttl = ttl
    this.caseInsensitive = caseInsensitive
    this.cache = new Map()
  }

  /**
   * Normalize a key for consistent lookups
   * @param {string} key - Original key
   * @returns {string} Normalized key
   * @private
   */
  _normalizeKey(key) {
    if (!key)
      return key
    // Normalize path separators and case for Windows compatibility
    let normalized = key.replace(/\\/g, '/')
    if (this.caseInsensitive) {
      normalized = normalized.toLowerCase()
    }
    return normalized
  }

  /**
   * Get an item from the cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const normalizedKey = this._normalizeKey(key)
    const item = this.cache.get(normalizedKey)

    if (!item) {
      return undefined
    }

    // Check TTL if enabled
    if (this.ttl > 0 && Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(normalizedKey)
      return undefined
    }

    // Move to end (most recently used)
    this.cache.delete(normalizedKey)
    this.cache.set(normalizedKey, { value: item.value, timestamp: Date.now() })

    return item.value
  }

  /**
   * Set an item in the cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    const normalizedKey = this._normalizeKey(key)

    // Delete existing entry (if any) to update position
    if (this.cache.has(normalizedKey)) {
      this.cache.delete(normalizedKey)
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(normalizedKey, { value, timestamp: Date.now() })
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is not expired
   */
  has(key) {
    const normalizedKey = this._normalizeKey(key)

    if (!this.cache.has(normalizedKey)) {
      return false
    }

    // Check TTL if enabled
    const item = this.cache.get(normalizedKey)
    if (this.ttl > 0 && Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(normalizedKey)
      return false
    }

    return true
  }

  /**
   * Delete an item from the cache
   * @param {string} key - Cache key
   * @returns {boolean} Whether the item was deleted
   */
  delete(key) {
    const normalizedKey = this._normalizeKey(key)
    return this.cache.delete(normalizedKey)
  }

  /**
   * Delete all items matching a prefix
   * @param {string} prefix - Key prefix to match
   * @returns {number} Number of items deleted
   */
  deleteByPrefix(prefix) {
    const normalizedPrefix = this._normalizeKey(prefix)
    let count = 0
    for (const key of this.cache.keys()) {
      // Keys in cache are already normalized, so just compare directly
      if (key.startsWith(normalizedPrefix)) {
        this.cache.delete(key)
        count++
      }
    }
    return count
  }

  /**
   * Clear the entire cache
   */
  clear() {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      caseInsensitive: this.caseInsensitive,
    }
  }
}
