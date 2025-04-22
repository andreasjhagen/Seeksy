// filepath: d:\Web Development\Seeksy\src\renderer\src\composables\useFileIconHandler.js
import { onMounted, ref } from 'vue'
import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'
import { isFileOfType } from '../../../utils/mimeTypeUtils'

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
   * Load thumbnail for an image file
   * @param {string} path - Path to the file
   */
  async function loadThumbnail(path) {
    if (!path || !isImageFile(path))
      return

    try {
      const data = await window.api.invoke(IPC_CHANNELS.GET_THUMBNAIL, path)
      thumbnail.value = data
    }
    catch (error) {
      console.error('Failed to load thumbnail:', error)
    }
  }

  /**
   * Load file icon for a file
   * @param {string} path - Path to the file
   * @param {string} fileType - Type of file (directory, application, etc.)
   */
  async function loadFileIcon(path, fileType) {
    if (!path || fileType === 'directory' || fileType === 'application') {
      return
    }

    try {
      const icon = await window.api.invoke(IPC_CHANNELS.GET_FILE_ICON, path)
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
        if (isImageFile(name)) {
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
    handleIconError,
    loadThumbnail,
    loadFileIcon,
  }
}
