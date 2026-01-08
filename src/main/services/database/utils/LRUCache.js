/**
 * Simple LRU (Least Recently Used) Cache implementation
 *
 * Provides a bounded cache with automatic eviction of least recently used items
 */
export class LRUCache {
  /**
   * Create a new LRU cache
   * @param {number} maxSize - Maximum number of items to store
   * @param {number} ttl - Time to live in milliseconds (0 = no expiry)
   */
  constructor(maxSize = 1000, ttl = 0) {
    this.maxSize = maxSize
    this.ttl = ttl
    this.cache = new Map()
  }

  /**
   * Get an item from the cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const item = this.cache.get(key)

    if (!item) {
      return undefined
    }

    // Check TTL if enabled
    if (this.ttl > 0 && Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key)
      return undefined
    }

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, { value: item.value, timestamp: Date.now() })

    return item.value
  }

  /**
   * Set an item in the cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    // Delete existing entry (if any) to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(key, { value, timestamp: Date.now() })
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is not expired
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false
    }

    // Check TTL if enabled
    const item = this.cache.get(key)
    if (this.ttl > 0 && Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key)
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
    return this.cache.delete(key)
  }

  /**
   * Delete all items matching a prefix
   * @param {string} prefix - Key prefix to match
   * @returns {number} Number of items deleted
   */
  deleteByPrefix(prefix) {
    let count = 0
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
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
    }
  }
}
