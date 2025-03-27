import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import { app } from 'electron'
import sharp from 'sharp'
import SteamIconExtractor from './SteamIconExtractor'

const mkdirAsync = util.promisify(fs.mkdir)
const ICONS_DIR = path.join(app.getPath('userData'), 'app-icons')
const CUSTOM_ICONS_DIR = path.join(app.getAppPath(), 'custom-app-icons')

/**
 * Creates a hash of a file path for use in icon file names
 * @param {string} filePath - The file path to hash
 * @returns {string} An 8-character hash of the file path
 * @private
 */
function createPathHash(filePath) {
  return crypto.createHash('md5').update(filePath.toLowerCase()).digest('hex').slice(0, 8)
}

/**
 * Handles extraction and caching of file icons from various sources
 */
class FileIconExtractor {
  /**
   * Creates a new FileIconExtractor instance
   */
  constructor() {
    this.steamIconExtractor = new SteamIconExtractor()
  }

  /**
   * Searches for and processes custom icons for applications
   * @param {string} baseName - The base name of the application/file to find an icon for
   * @returns {Promise<string|null>} URL to the processed icon or null if no custom icon found
   */
  async findCustomIcon(baseName) {
    try {
      // Check if custom icons directory exists
      try {
        await fs.promises.access(CUSTOM_ICONS_DIR)
      }
      catch {
        return null
      }

      // Read all files in the custom icons directory
      const files = await fs.promises.readdir(CUSTOM_ICONS_DIR)

      // Try to find a matching icon file
      const iconFile = files.find((file) => {
        const fileBaseName = path.parse(file).name.toLowerCase()
        return fileBaseName === baseName.toLowerCase() && file.endsWith('.png')
      })

      if (iconFile) {
        // Copy the icon to the app's icon cache
        const sourcePath = path.join(CUSTOM_ICONS_DIR, iconFile)
        const pathHash = createPathHash(sourcePath)
        const destFile = path.join(ICONS_DIR, `${baseName}_${pathHash}.png`)

        await sharp(sourcePath)
          .resize(256, 256, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toFormat('png')
          .toFile(destFile)

        return `app-icon://${encodeURIComponent(path.basename(destFile))}`
      }

      return null
    }
    catch (error) {
      console.warn('Custom icon lookup failed:', error)
      return null
    }
  }

  /**
   * Extracts a Steam icon for a given steam URL
   * @param {string} steamUrl - Steam URL (e.g., steam://rungameid/123456)
   * @returns {Promise<string>} URL to the processed icon or empty string if extraction fails
   */
  async extractSteamIcon(steamUrl) {
    try {
      const appId = SteamIconExtractor.parseAppIdFromUrl(steamUrl)
      if (!appId) {
        return ''
      }

      // Get icon path from Steam
      const iconPath = await this.steamIconExtractor.findSteamAppIconPath(appId)
      if (!iconPath) {
        return ''
      }

      // Process the icon using the standard extraction method
      // We only pass the path here, not the steam:// URL
      return this.extractFileIcon(iconPath)
    }
    catch (error) {
      console.error(`Error extracting Steam icon for ${steamUrl}:`, error)
      return ''
    }
  }

  /**
   * Processes a file to extract its icon
   * @param {string} sourcePath - Path to the source file
   * @returns {Promise<string>} URL to the processed icon or empty string if extraction fails
   */
  async extractFileIcon(sourcePath) {
    try {
      // Check if icons directory exists
      try {
        await fs.promises.access(ICONS_DIR)
      }
      catch {
        await mkdirAsync(ICONS_DIR, { recursive: true })
      }

      const baseName = path.parse(sourcePath).name.replace(/[^a-z0-9]/gi, '_')

      // First try to find a custom icon
      const customIcon = await this.findCustomIcon(baseName)
      if (customIcon) {
        return customIcon
      }

      const pathHash = createPathHash(sourcePath)
      const destFile = path.join(ICONS_DIR, `${baseName}_${pathHash}.png`)

      // Check if file exists before processing
      try {
        await fs.promises.access(sourcePath)
      }
      catch (error) {
        console.debug(`Icon file not accessible: ${sourcePath}`, error.message)
        return ''
      }

      const ext = path.extname(sourcePath).toLowerCase()
      if (ext === '.ico') {
        // Handle ICO files using Electron first
        const nativeIcon = await app.getFileIcon(sourcePath, { size: 'large' })
        const tempPngBuffer = nativeIcon.toPNG()

        // Then process with sharp for consistent sizing
        await sharp(tempPngBuffer)
          .resize(256, 256, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toFormat('png')
          .toFile(destFile)

        return `app-icon://${encodeURIComponent(path.basename(destFile))}`
      }

      try {
        if (['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
          await sharp(sourcePath, { density: 300 })
            .resize(256, 256, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .toFormat('png')
            .toFile(destFile)
          return `app-icon://${encodeURIComponent(path.basename(destFile))}`
        }
      }
      catch (sharpError) {
        console.debug('Sharp processing failed, trying Electron getFileIcon.', sharpError.message)
      }

      // Fallback to Electron's getFileIcon
      try {
        const nativeIcon = await app.getFileIcon(sourcePath, { size: 'large' })
        await fs.promises.writeFile(destFile, nativeIcon.toPNG())
        return `app-icon://${encodeURIComponent(path.basename(destFile))}`
      }
      catch (electronError) {
        console.error(`Electron icon extraction failed for:${sourcePath}`, electronError.message)
        return ''
      }
    }
    catch (error) {
      console.error(`Icon processing error for ${sourcePath}:`, error.message)
      return ''
    }
  }

  /**
   * Main method to extract an icon from a source path or URL
   * @param {string} sourcePath - Path or URL to extract icon from
   * @returns {Promise<string>} URL to the processed icon or empty string if extraction fails
   */
  async extractIcon(sourcePath) {
    // Handle Steam URLs
    if (SteamIconExtractor.isSteamUrl(sourcePath)) {
      return this.extractSteamIcon(sourcePath)
    }
    
    // Handle regular file paths
    return this.extractFileIcon(sourcePath)
  }
}

export default FileIconExtractor
