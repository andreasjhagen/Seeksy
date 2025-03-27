import MIME_TYPES from '../constants/mimeTypes.js'

/**
 * Get file extension from a path (browser-compatible version)
 * @param {string} filePath - Path to the file
 * @returns {string} - File extension with dot
 */
export function getExtension(filePath) {
  if (!filePath)
    return ''
  const lastDotIndex = filePath.lastIndexOf('.')
  if (lastDotIndex === -1 || lastDotIndex === 0)
    return ''
  return filePath.substring(lastDotIndex).toLowerCase()
}

/**
 * Get MIME type for a file path
 * @param {string} filePath - Path to the file
 * @returns {string} - MIME type
 */
export function getMimeType(filePath) {
  const ext = getExtension(filePath)
  return MIME_TYPES[ext] || 'application/octet-stream'
}

/**
 * Get content type category from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string} - Content type category
 */
export function getContentType(mimeType) {
  if (!mimeType)
    return 'unknown'

  if (mimeType.startsWith('text/'))
    return 'text'
  if (mimeType.startsWith('image/'))
    return 'image'
  if (mimeType.startsWith('video/'))
    return 'video'
  if (mimeType.startsWith('audio/'))
    return 'audio'

  // Document types
  if (mimeType === 'application/pdf')
    return 'pdf'
  if (mimeType === 'application/msword'
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mimeType === 'application/rtf'
    || mimeType === 'application/vnd.oasis.opendocument.text') {
    return 'document'
  }

  // Spreadsheet types
  if (mimeType === 'application/vnd.ms-excel'
    || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mimeType === 'application/vnd.oasis.opendocument.spreadsheet') {
    return 'spreadsheet'
  }

  // Presentation types
  if (mimeType === 'application/vnd.ms-powerpoint'
    || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return 'presentation'
  }

  return 'unknown'
}

/**
 * Formats file size in a human-readable way
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0)
    return '0 Bytes'

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))

  return `${Number.parseFloat((bytes / 1024 ** i).toFixed(2))} ${units[i]}`
}

/**
 * Get basename of a file path (browser-compatible version)
 * @param {string} filePath - Path to the file
 * @returns {string} - Base name of the file
 */
export function getBasename(filePath) {
  if (!filePath)
    return ''
  // Handle both forward and backward slashes
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1]
}

/**
 * Get file type from file object
 * @param {object} file - File object
 * @returns {string} - File type (directory, image, document, etc.)
 */
export function getFileType(file) {
  // Check if it's a directory first
  if (file.isDirectory || file.type === 'folder') {
    return 'directory'
  }

  // If file has a specific type property already defined, use it
  if (file.fileType) {
    return file.fileType
  }

  // Otherwise determine from mime type
  if (file.mimeType) {
    return getContentType(file.mimeType)
  }

  // Fallback to checking file extension
  if (file.path || file.name) {
    const fileName = file.path || file.name
    const mimeType = getMimeType(fileName)
    return getContentType(mimeType)
  }

  return 'unknown'
}

/**
 * Check if a file is of a specific type
 * @param {string} filePath - Path to the file
 * @param {string} type - Type to check against ('image', 'video', etc.)
 * @returns {boolean} - Whether the file is of the specified type
 */
export function isFileOfType(filePath, type) {
  const mimeType = getMimeType(filePath)
  const contentType = getContentType(mimeType)
  return contentType === type
}
