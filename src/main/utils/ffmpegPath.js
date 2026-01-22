/**
 * FFmpeg Path Utility
 *
 * Handles resolving the correct path to the ffmpeg binary across different
 * environments (development vs production) and platforms.
 *
 * In production, ffmpeg-static is extracted to extraResources and the path
 * inside the asar archive is invalid. This utility finds the correct path.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import ffmpegStaticPath from 'ffmpeg-static'

/**
 * Cached ffmpeg path to avoid repeated filesystem checks
 */
let cachedFfmpegPath = null
let ffmpegChecked = false

/**
 * Get the correct ffmpeg binary path for the current environment
 * @returns {string|null} Path to ffmpeg binary or null if not found
 */
export function getFfmpegPath() {
  // Return cached path if already resolved
  if (ffmpegChecked) {
    return cachedFfmpegPath
  }

  ffmpegChecked = true

  // In development, use the path from ffmpeg-static directly
  if (!app.isPackaged) {
    if (ffmpegStaticPath && existsSync(ffmpegStaticPath)) {
      cachedFfmpegPath = ffmpegStaticPath
      console.log('FFmpeg (dev):', cachedFfmpegPath)
      return cachedFfmpegPath
    }
  }

  // In production, the binary is in extraResources/node_modules/ffmpeg-static
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

  // Try the extraResources path first (this is where electron-builder puts it)
  const extraResourcesPath = path.join(
    process.resourcesPath,
    'node_modules',
    'ffmpeg-static',
    binaryName,
  )

  if (existsSync(extraResourcesPath)) {
    cachedFfmpegPath = extraResourcesPath
    console.log('FFmpeg (extraResources):', cachedFfmpegPath)
    return cachedFfmpegPath
  }

  // Fallback: try the unpacked asar path
  if (ffmpegStaticPath) {
    const unpackedPath = ffmpegStaticPath.replace('app.asar', 'app.asar.unpacked')
    if (existsSync(unpackedPath)) {
      cachedFfmpegPath = unpackedPath
      console.log('FFmpeg (asar.unpacked):', cachedFfmpegPath)
      return cachedFfmpegPath
    }
  }

  // Final fallback: check if ffmpeg is in system PATH
  // This returns 'ffmpeg' which will work if it's installed system-wide
  console.warn('ffmpeg-static not found, falling back to system ffmpeg')
  cachedFfmpegPath = 'ffmpeg'
  return cachedFfmpegPath
}

/**
 * Check if ffmpeg is available
 * @returns {boolean} True if ffmpeg binary exists at the resolved path
 */
export function isFfmpegAvailable() {
  const ffmpegPath = getFfmpegPath()

  if (!ffmpegPath) {
    return false
  }

  // If it's the system fallback, we can't easily verify without spawning
  if (ffmpegPath === 'ffmpeg') {
    return true // Assume available, will fail gracefully if not
  }

  return existsSync(ffmpegPath)
}

/**
 * Reset the cached ffmpeg path (useful for testing)
 */
export function resetFfmpegCache() {
  cachedFfmpegPath = null
  ffmpegChecked = false
}
