import { existsSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { app, dialog, shell } from 'electron'
import { getContentType, getMimeType } from '../../../utils/mimeTypeUtils.js'
import FileIconExtractor from '../../services/disk-reader/FileIconExtractor.js'
import { ThumbnailCache } from '../../services/disk-reader/ThumbnailCache'
import { countFolderContent } from '../../services/disk-reader/utils/countFiles'
import { BaseHandler } from '../BaseHandler'
import { IPC } from '../ipcChannels'

const thumbnailCache = new ThumbnailCache({
  expiry: 24 * 60 * 60 * 1000,
  thumbnailSize: 256,
})

export class DiskReaderHandler extends BaseHandler {
  constructor() {
    super()
    this.registerHandlers({
      [IPC.FRONTEND.OPEN_FOLDER_DIALOG]: this.handleOpenFolderDialog.bind(this),
      [IPC.FRONTEND.GET_THUMBNAIL]: this.handleGetThumbnail.bind(this),
      [IPC.FRONTEND.OPEN_FILE]: this.handleOpenFile.bind(this),
      [IPC.FRONTEND.SHOW_IN_EXPLORER]: this.handleShowInExplorer.bind(this),
      [IPC.FRONTEND.SHOW_APP_DATA_EXPLORER]: this.handleShowAppDataExplorer.bind(this),
      [IPC.FRONTEND.GET_FILE_ICON]: this.handleGetFileIcon.bind(this),
      [IPC.FRONTEND.COUNT_FOLDER_FILES]: this.handleCountFolderFiles.bind(this),
      [IPC.FRONTEND.GET_FILE_CONTENT]: this.handleGetFileContent.bind(this),
    })
  }

  async handleOpenFolderDialog(_, options = { multiSelection: false }) {
    const properties = ['openDirectory']

    if (options.multiSelection) {
      properties.push('multiSelections')
    }

    const result = await dialog.showOpenDialog({
      properties,
    })

    return result.canceled
      ? null
      : (options.multiSelection ? result.filePaths : result.filePaths[0])
  }

  async handleGetThumbnail(_, filePath) {
    return thumbnailCache.generateThumbnail(filePath)
  }

  async handleOpenFile(_, filePath) {
    try {
      await shell.openPath(filePath)
      return true
    }
    catch (error) {
      console.error('Error opening file:', error)
      return false
    }
  }

  async handleShowInExplorer(_, path) {
    try {
      shell.showItemInFolder(path)
      return true
    }
    catch (error) {
      console.error('Error showing item in folder:', error)
      return false
    }
  }

  async handleShowAppDataExplorer() {
    try {
      shell.showItemInFolder(app.getPath('userData'))
      return true
    }
    catch (error) {
      console.error('Error showing app data folder:', error)
      return false
    }
  }

  async handleGetFileIcon(_, filePath) {
    try {
      const iconExtractor = new FileIconExtractor()
      return await iconExtractor.extractIcon(filePath)
    }
    catch (error) {
      console.error('Failed to get file icon:', error)
      return null
    }
  }

  async handleCountFolderFiles(_, { path, depth }) {
    try {
      if (!existsSync(path))
        return { error: 'Folder does not exist' }

      const fileCount = await countFolderContent(path, depth)
      return { fileCount }
    }
    catch (error) {
      console.error('Error counting files in folder:', error)
      return { error: error.message }
    }
  }

  async handleGetFileContent(_, filePath) {
    try {
      if (!existsSync(filePath)) {
        return { error: 'File not found' }
      }

      const mimeType = getMimeType(filePath)
      const contentType = getContentType(mimeType)
      const ext = path.extname(filePath).toLowerCase()
      const stats = await fs.stat(filePath)

      // Special handling for .url files (Windows Internet Shortcuts)
      if (ext === '.url') {
        try {
          const content = readFileSync(filePath, { encoding: 'utf-8', flag: 'r' })
          const urlMatch = content.match(/URL=(.+)/i)
          const url = urlMatch ? urlMatch[1].trim() : ''

          if (url) {
            return {
              type: 'url',
              content: url,
              title: path.basename(filePath, ext),
            }
          }
          else {
            return {
              type: 'text',
              content: content.slice(0, 5000),
            }
          }
        }
        catch (error) {
          console.error('Error parsing URL file:', error)
          return { type: 'error', error: 'Failed to parse URL shortcut file' }
        }
      }

      // Handle text files
      if (contentType === 'text') {
        // Read only the first portion of the file for performance
        const content = readFileSync(filePath, { encoding: 'utf-8', flag: 'r' }).slice(0, 5000)
        const isTruncated = content.length === 5000
        return {
          type: 'text',
          content: isTruncated ? `${content}...\n\n[Content truncated. Open file to see more]` : content,
        }
      }

      // Handle images, videos, audio files, and PDFs
      else if (['image', 'video', 'audio'].includes(contentType)) {
        const buffer = await fs.readFile(filePath)
        const base64Data = buffer.toString('base64')
        return {
          type: contentType,
          content: `data:${mimeType};base64,${base64Data}`,
        }
      }

      // Default handling for all other file types
      else {
        // Get file icon if possible
        let fileIcon = null
        try {
          const iconExtractor = new FileIconExtractor()
          fileIcon = await iconExtractor.extractIcon(filePath)
        }
        catch (error) {
          console.error('Failed to get file icon:', error)
        }

        return {
          type: ['document', 'spreadsheet', 'presentation'].includes(contentType) ? contentType : 'unknown',
          fileType: path.extname(filePath).substring(1).toUpperCase(),
          fileSize: stats.size,
          fileIcon,
          name: path.basename(filePath),
          path: filePath,
        }
      }
    }
    catch (error) {
      console.error('Error getting file content:', error)
      return {
        type: 'error',
        error: error.message,
      }
    }
  }
}

export default function setupDiskReaderHandlers() {
  return new DiskReaderHandler()
}
