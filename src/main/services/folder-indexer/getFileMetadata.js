import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import MIME_TYPES from '../../../constants/mimeTypes.js'

/**
 * Extracts basic metadata from file stats without reading the file content
 * @param {string} filePath - Path to the file
 * @param {fs.Stats} stats - File stats object from fs.stat or chokidar
 * @returns {object} Object containing file metadata
 */
export async function extractFileMetadata(filePath, stats) {
  try {
    // Basic file information
    const name = path.basename(filePath)
    const folderPath = path.dirname(filePath)

    // Get file extension (without the leading dot)
    const extWithDot = path.extname(filePath)
    const extension = extWithDot ? extWithDot.substring(1).toLowerCase() : ''

    // First try to get MIME type from our constants, then fall back to mime-types
    const mimeType = MIME_TYPES[extWithDot] || 'application/octet-stream'

    // Determine file type from mime type
    let fileType = 'unknown'
    if (mimeType.startsWith('image/'))
      fileType = 'image'
    else if (mimeType.startsWith('video/'))
      fileType = 'video'
    else if (mimeType.startsWith('audio/'))
      fileType = 'audio'
    else if (mimeType.startsWith('text/'))
      fileType = 'text'
    else if (mimeType.includes('pdf'))
      fileType = 'document'
    else if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
      fileType = 'spreadsheet'
    else if (mimeType.includes('presentation') || mimeType.includes('powerpoint'))
      fileType = 'presentation'
    else if (mimeType.includes('document') || mimeType.includes('word'))
      fileType = 'document'

    // Create the metadata object
    const metadata = {
      fileData: {
        path: filePath,
        name,
        folderPath,
        extension,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        createdAt: stats.birthtimeMs,
        accessedAt: stats.atimeMs,
        indexedAt: Date.now(),
        mimeType,
        fileType,
      },
    }

    return metadata
  }
  catch (error) {
    console.error(`Error extracting metadata for ${filePath}:`, error)
    throw error
  }
}

/**
 * Calculates SHA256 hash of a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} SHA256 hash of the file
 */
export async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)

      stream.on('error', reject)

      stream.on('data', (chunk) => {
        hash.update(chunk)
      })

      stream.on('end', () => {
        resolve(hash.digest('hex'))
      })
    }
    catch (error) {
      reject(error)
    }
  })
}

/**
 * Gets essential file metadata including optional hash calculation
 * @param {string} filePath - Path to the file
 * @param {fs.Stats} stats - File stats object (optional)
 * @param {object} options - Options for metadata extraction
 * @param {boolean} options.calculateHash - Whether to calculate file hash
 * @returns {Promise<object>} File metadata
 */
export async function getFileMetadata(filePath, stats = null, options = { calculateHash: false }) {
  try {
    // Get stats if not provided
    const fileStats = stats || await fs.promises.stat(filePath)

    // Extract basic metadata
    const metadata = await extractFileMetadata(filePath, fileStats)

    // Calculate hash if requested
    if (options.calculateHash) {
      try {
        metadata.fileData.sha256Hash = await calculateFileHash(filePath)
      }
      catch (hashError) {
        console.warn(`Could not calculate hash for ${filePath}:`, hashError)
      }
    }

    return metadata
  }
  catch (error) {
    console.error(`Error getting file metadata for ${filePath}:`, error)
    throw error
  }
}
