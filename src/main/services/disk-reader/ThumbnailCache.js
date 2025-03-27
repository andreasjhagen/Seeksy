import crypto from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import sharp from 'sharp'

export class ThumbnailCache {
  constructor(config = {}) {
    // Initialize cache directory, max cache age, thumbnail size, and last cleanup time
    this.cacheDir = path.join(app.getPath('userData'), 'thumbnail-cache')
    this.maxCacheAge = config.expiry || 14 * 24 * 60 * 60 * 1000 // 14 days
    this.thumbnailSize = config.thumbnailSize || 256
    this.lastCleanup = 0
  }

  async ensureCacheDir() {
    // Ensure the cache directory exists
    if (!existsSync(this.cacheDir)) {
      await fs.mkdir(this.cacheDir, { recursive: true })
    }
  }

  getCacheKey(imagePath) {
    // Generate a cache key based on the image path
    return `${crypto.createHash('md5').update(imagePath).digest('hex')}.jpg`
  }

  async shouldCleanup() {
    // Determine if cache cleanup is needed based on the last cleanup time
    const now = Date.now()
    if (now - this.lastCleanup >= this.maxCacheAge) {
      return true
    }
    return false
  }

  async cleanupOldCache() {
    // Remove old cache files that exceed the max cache age
    try {
      if (!existsSync(this.cacheDir)) {
        return
      }

      const files = await fs.readdir(this.cacheDir)
      const now = Date.now()
      this.lastCleanup = now

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file)
        const stats = await fs.stat(filePath)
        if (now - stats.mtimeMs > this.maxCacheAge) {
          await fs.unlink(filePath)
        }
      }
    }
    catch (error) {
      console.error('Cache cleanup error:', error)
    }
  }

  async get(imagePath) {
    // Retrieve a cached image if it exists
    if (await this.shouldCleanup()) {
      await this.cleanupOldCache()
    }
    const cachePath = path.join(this.cacheDir, this.getCacheKey(imagePath))
    if (existsSync(cachePath)) {
      const imageBuffer = await fs.readFile(cachePath)
      return imageBuffer
    }
    return null
  }

  async set(imagePath, imageBuffer) {
    // Save an image to the cache
    await this.ensureCacheDir()
    const cachePath = path.join(this.cacheDir, this.getCacheKey(imagePath))
    await fs.writeFile(cachePath, imageBuffer)
  }

  async clearCache() {
    // Clear all cached images
    try {
      const files = await fs.readdir(this.cacheDir)
      await Promise.all(files.map(file => fs.unlink(path.join(this.cacheDir, file))))
      return true
    }
    catch (error) {
      console.error('Error clearing cache:', error)
      return false
    }
  }

  async getCacheStats() {
    // Get statistics about the cache, such as total size and file count
    try {
      const files = await fs.readdir(this.cacheDir)
      let totalSize = 0

      for (const file of files) {
        const stats = await fs.stat(path.join(this.cacheDir, file))
        totalSize += stats.size
      }

      return {
        fileCount: files.length,
        totalSize,
        directory: this.cacheDir,
      }
    }
    catch (error) {
      console.error('Error getting cache stats:', error)
      return null
    }
  }

  async generateThumbnail(imagePath) {
    // Generate a thumbnail for an image and cache it
    if (await this.shouldCleanup()) {
      await this.cleanupOldCache()
    }
    try {
      // Check cache first
      const cachedThumbnail = await this.get(imagePath)
      if (cachedThumbnail) {
        return `data:image/jpeg;base64,${cachedThumbnail.toString('base64')}`
      }

      // Generate new thumbnail
      const thumbnail = await sharp(imagePath)
        .rotate() // Auto-orient based on EXIF metadata
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .jpeg()
        .toBuffer()

      // Save to cache
      await this.set(imagePath, thumbnail)

      return `data:image/jpeg;base64,${thumbnail.toString('base64')}`
    }
    catch (error) {
      console.error(`Error generating thumbnail for ${imagePath}:`, error)
      return null
    }
  }
}
