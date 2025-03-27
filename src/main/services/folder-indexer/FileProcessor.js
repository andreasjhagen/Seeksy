import { EventEmitter } from 'node:events'
import { access, stat } from 'node:fs/promises'
import path from 'node:path'
import { getFileMetadata } from './getFileMetadata.js'

export class FileProcessor extends EventEmitter {
  constructor(db) {
    super()
    this.db = db
    this.processedPaths = new Set()
    this.processingPaths = new Map() // Track paths being processed
  }

  // Public API
  async processPath(filePath, providedStats = null) {
    // Skip if already being processed
    if (this.processingPaths.has(filePath)) {
      return { success: true, path: filePath, status: 'already-processing' }
    }

    try {
      this.processingPaths.set(filePath, Date.now())

      const stats = providedStats || await this._safeFileStat(filePath)
      if (!stats) {
        return { success: false, path: filePath, error: 'File not accessible' }
      }

      // Process directory or file
      const result = stats.isDirectory()
        ? await this.processDirectory(filePath, stats)
        : await this.processFile(filePath, stats)

      return result
    }
    catch (error) {
      return this._handleError('processing', filePath, error)
    }
    finally {
      this.processingPaths.delete(filePath)
    }
  }

  async removePath(path) {
    try {
      console.log(`Removing from database: ${path}`)
      const result = await this.db.removePath(path)
      this.processedPaths.delete(path)
      return { success: true, type: 'removed', path, affected: result }
    }
    catch (error) {
      return this._handleError('removal', path, error)
    }
  }

  // Core Processing Methods
  async processFile(filePath, stats) {
    if (this.processedPaths.has(filePath)) {
      return { success: true, type: 'file', path: filePath, status: 'already-processed' }
    }

    try {
      // Process parent folder first
      await this._ensureParentFolderProcessed(filePath)

      // Check if file exists in DB
      const existingFile = await this.db.getFile(filePath)
      console.log(`Scanning file: ${filePath}`)

      // Skip unchanged files
      if (existingFile && existingFile.modifiedAt === stats.mtimeMs) {
        this.processedPaths.add(filePath)
        console.log(`Skipping unchanged file: ${filePath}`)
        return { success: true, type: 'file', path: filePath, status: 'unchanged' }
      }

      // Process file metadata using the stats object
      const fileDetails = await getFileMetadata(filePath, stats)
      if (!fileDetails) {
        return { success: false, type: 'error', path: filePath, error: 'Failed to process file metadata' }
      }

      // Add watched folder path
      const watchedFolder = await this._findWatchedParentFolder(filePath)
      fileDetails.fileData.watchedFolderPath = watchedFolder?.path || null

      await this._saveFileToDatabase(filePath, fileDetails)
      this.processedPaths.add(filePath)

      return {
        success: true,
        type: 'file',
        path: filePath,
        status: existingFile ? 'updated' : 'indexed',
      }
    }
    catch (error) {
      return this._handleError('file-processing', filePath, error)
    }
  }

  async processDirectory(dirPath, stats) {
    try {
      const watchedFolder = await this._findWatchedParentFolder(dirPath)
      await this.db.updateFolder(dirPath, {
        modifiedAt: stats.mtimeMs,
        watchedFolderPath: watchedFolder?.path || null,
      })
      this.processedPaths.add(dirPath)
      return { success: true, type: 'directory', path: dirPath }
    }
    catch (error) {
      return this._handleError('directory', dirPath, error)
    }
  }

  // Helper Methods
  async _saveFileToDatabase(filePath, fileDetails) {
    console.log(`Uploading to database: ${filePath}`)
    const dbResult = await this.db.updateFile(filePath, fileDetails)
    if (!dbResult) {
      throw new Error('Failed to update file in database')
    }
  }

  async _findWatchedParentFolder(itemPath) {
    const watchedFolders = await this.db.getAllWatchFolderStatus()
    // Sort by path length descending to find the most specific parent folder
    const sortedFolders = watchedFolders.sort((a, b) => b.path.length - a.path.length)
    return sortedFolders.find(folder => itemPath.startsWith(folder.path))
  }

  async _ensureParentFolderProcessed(filePath) {
    const folderPath = path.dirname(filePath)
    if (!this.processedPaths.has(folderPath)) {
      const folderStats = await this._safeFileStat(folderPath)
      if (folderStats) {
        await this.processDirectory(folderPath, folderStats)
      }
    }
  }

  async _safeFileStat(filePath) {
    try {
      return await stat(filePath)
    }
    catch (error) {
      return null
    }
  }

  _handleError(operation, path, error) {
    const errorDetails = {
      success: false,
      type: 'error',
      operation,
      path,
      error: error.message,
      timestamp: Date.now(),
    }
    this.emit('error', errorDetails)
    return errorDetails
  }
}
