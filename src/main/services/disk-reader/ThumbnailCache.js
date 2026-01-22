import crypto from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'
import sharp from 'sharp'

// Set the ffmpeg path from ffmpeg-static
ffmpeg.setFfmpegPath(ffmpegPath)

// Supported video extensions for thumbnail generation
const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.mkv',
  '.mpeg',
  '.mpg',
  '.m4v',
  '.3gp',
])

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

  async generateThumbnail(filePath) {
    // Generate a thumbnail for an image or video and cache it
    if (await this.shouldCleanup()) {
      await this.cleanupOldCache()
    }
    try {
      // Check cache first
      const cachedThumbnail = await this.get(filePath)
      if (cachedThumbnail) {
        return `data:image/jpeg;base64,${cachedThumbnail.toString('base64')}`
      }

      // Determine if this is a video file
      const ext = path.extname(filePath).toLowerCase()
      const isVideo = VIDEO_EXTENSIONS.has(ext)

      let thumbnail
      if (isVideo) {
        thumbnail = await this._generateVideoThumbnail(filePath)
      }
      else {
        thumbnail = await this._generateImageThumbnail(filePath)
      }

      if (!thumbnail) {
        return null
      }

      // Save to cache
      await this.set(filePath, thumbnail)

      return `data:image/jpeg;base64,${thumbnail.toString('base64')}`
    }
    catch (error) {
      console.error(`Error generating thumbnail for ${filePath}:`, error)
      return null
    }
  }

  /**
   * Generate thumbnail for an image file using sharp
   * @private
   */
  async _generateImageThumbnail(imagePath) {
    return await sharp(imagePath)
      .rotate() // Auto-orient based on EXIF metadata
      .resize(this.thumbnailSize, this.thumbnailSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .jpeg()
      .toBuffer()
  }

  /**
   * Generate thumbnail for a video file using ffmpeg
   * Extracts a frame at 10% into the video
   * @private
   */
  async _generateVideoThumbnail(videoPath) {
    // Create a temporary file for the extracted frame
    const tempDir = os.tmpdir()
    const tempFile = path.join(tempDir, `seeksy-thumb-${crypto.randomBytes(8).toString('hex')}.jpg`)

    try {
      // Extract a frame from the video
      await this._extractVideoFrame(videoPath, tempFile)

      // Read and resize the extracted frame using sharp
      const thumbnail = await sharp(tempFile)
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        })
        .jpeg({ quality: 80 })
        .toBuffer()

      return thumbnail
    }
    finally {
      // Clean up temp file
      try {
        if (existsSync(tempFile)) {
          await fs.unlink(tempFile)
        }
      }
      catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Extract a single frame from a video using ffmpeg
   * @private
   */
  _extractVideoFrame(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
      // First, get video duration to calculate 10% timestamp
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          // If probe fails, try extracting from the beginning
          this._extractFrameAtTime(videoPath, outputPath, '00:00:01')
            .then(resolve)
            .catch(reject)
          return
        }

        const duration = metadata?.format?.duration || 0
        // Extract frame at 10% into the video, or 1 second if video is short
        const seekTime = Math.max(1, duration * 0.1)
        const timestamp = this._formatTimestamp(seekTime)

        this._extractFrameAtTime(videoPath, outputPath, timestamp)
          .then(resolve)
          .catch(reject)
      })
    })
  }

  /**
   * Extract a frame at a specific timestamp
   * @private
   */
  _extractFrameAtTime(videoPath, outputPath, timestamp) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .outputOptions([
          '-vf',
          `scale=${this.thumbnailSize}:${this.thumbnailSize}:force_original_aspect_ratio=decrease`,
          '-q:v',
          '2', // High quality JPEG
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err) => {
          // If seeking fails, try from the beginning
          if (timestamp !== '00:00:00') {
            ffmpeg(videoPath)
              .seekInput('00:00:00')
              .frames(1)
              .outputOptions([
                '-vf',
                `scale=${this.thumbnailSize}:${this.thumbnailSize}:force_original_aspect_ratio=decrease`,
                '-q:v',
                '2',
              ])
              .output(outputPath)
              .on('end', resolve)
              .on('error', reject)
              .run()
          }
          else {
            reject(err)
          }
        })
        .run()
    })
  }

  /**
   * Format seconds to HH:MM:SS timestamp
   * @private
   */
  _formatTimestamp(seconds) {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
}
