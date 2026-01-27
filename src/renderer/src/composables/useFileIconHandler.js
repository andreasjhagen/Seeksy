/**
 * Composable for file icon and thumbnail management
 *
 * Uses centralized IconService for:
 * - Request deduplication (prevents duplicate IPC calls)
 * - Request batching (groups requests for efficiency)
 * - LRU caching (avoids repeated IPC for recently loaded icons)
 */
import { onMounted, ref } from 'vue'
import { isFileOfType } from '../../../utils/mimeTypeUtils'
import { iconService } from '../services/IconService'

/**
 * Composable for file icon and thumbnail management
 * Handles loading thumbnails and icons for file results
 */
export function useFileIconHandler(file, options = {}) {
  const thumbnail = ref(null)
  const fileIcon = ref(null)
  const hasIconError = ref(false)

  /**
   * Check if a file is an image based on its name/extension
   * @param {string} filename - The file name to check
   * @returns {boolean} - Whether the file appears to be an image
   */
  function isImageFile(filename) {
    return isFileOfType(filename, 'image')
  }

  /**
   * Check if a file is a video based on its name/extension
   * @param {string} filename - The file name to check
   * @returns {boolean} - Whether the file appears to be a video
   */
  function isVideoFile(filename) {
    return isFileOfType(filename, 'video')
  }

  /**
   * Check if a file is an audio file based on its name/extension
   * @param {string} filename - The file name to check
   * @returns {boolean} - Whether the file appears to be an audio file
   */
  function isAudioFile(filename) {
    return isFileOfType(filename, 'audio')
  }

  /**
   * Check if a file supports thumbnail generation (images, videos, and audio with cover art)
   * @param {string} filename - The file name to check
   * @returns {boolean} - Whether the file supports thumbnails
   */
  function supportsThumbnail(filename) {
    return isImageFile(filename) || isVideoFile(filename) || isAudioFile(filename)
  }

  /**
   * Handle errors with icon loading
   * @param {Event} event - The error event
   */
  function handleIconError(event) {
    if (event?.target) {
      event.target.src = ''
    }
    hasIconError.value = true
  }

  /**
   * Load thumbnail for an image or video file using centralized IconService
   * Benefits: deduplication, batching, and caching
   * @param {string} path - Path to the file
   */
  async function loadThumbnail(path) {
    if (!path || !supportsThumbnail(path))
      return

    try {
      const data = await iconService.getThumbnail(path)
      thumbnail.value = data
    }
    catch (error) {
      console.error('Failed to load thumbnail:', error)
    }
  }

  /**
   * Load file icon for a file using centralized IconService
   * Benefits: deduplication, batching, and caching
   * @param {string} path - Path to the file
   * @param {string} fileType - Type of file (directory, application, etc.)
   */
  async function loadFileIcon(path, fileType) {
    if (!path || fileType === 'directory' || fileType === 'application') {
      return
    }

    try {
      const icon = await iconService.getFileIcon(path, fileType)
      fileIcon.value = icon
    }
    catch (error) {
      console.error('Failed to load file icon:', error)
    }
  }

  // Auto-load icons and thumbnails on component mount if file is provided
  if (file && options.autoLoad !== false) {
    onMounted(() => {
      const path = file.path
      const name = file.name

      if (path && name) {
        if (supportsThumbnail(name)) {
          loadThumbnail(path)
        }

        loadFileIcon(path, file.type)
      }
    })
  }

  return {
    thumbnail,
    fileIcon,
    hasIconError,
    isImageFile,
    isVideoFile,
    isAudioFile,
    supportsThumbnail,
    handleIconError,
    loadThumbnail,
    loadFileIcon,
  }
}
