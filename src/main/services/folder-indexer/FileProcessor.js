/**
 * File Processor
 *
 * Handles the processing of files and directories for indexing.
 * Extracts metadata and stores information in the database.
 * Tracks processed paths to avoid duplicate work.
 */

import { EventEmitter } from 'node:events'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '../../utils/logger.js'
import { fileDB } from '../database/database.js'
import { getFileMetadata } from './getFileMetadata.js'

// Create a dedicated logger for the file processor
const logger = createLogger('FileProcessor')

export class FileProcessor extends EventEmitter {
  /**
   * Creates a new FileProcessor instance
   */
  constructor() {
    super()
    this.processedPaths = new Set()
    this.processingPaths = new Map() // Track paths being processed
    
    // Cache for watched folders - sorted by path length descending
    this._watchedFoldersCache = null
    this._watchedFoldersCacheTime = 0
    this._watchedFoldersCacheTTL = 30000 // 30 seconds TTL
  }

  /**
   * Invalidate the watched folders cache
   * Call this when watched folders are added/removed
   */
  invalidateWatchedFoldersCache() {
    this._watchedFoldersCache = null
    this._watchedFoldersCacheTime = 0
  }

  /**
   * Process a file or directory path
   *
   * @param {string} filePath - Path to process
   * @param {object} [providedStats] - Pre-retrieved fs.Stats object (optional)
   * @returns {Promise<object>} Result of the processing operation
   */
  async processPath(filePath, providedStats = null) {
    // Skip if already being processed
    if (this.processingPaths.has(filePath)) {
      logger.debug(`Skipping already processing path: ${filePath}`)
      return { success: true, path: filePath, status: 'already-processing' }
    }

    try {
      this.processingPaths.set(filePath, Date.now())

      const stats = providedStats || await this._safeFileStat(filePath)
      if (!stats) {
        logger.warn(`File not accessible: ${filePath}`)
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

  /**
   * Removes a path and its related data from the database
   *
   * @param {string} path - Path to remove
   * @returns {Promise<object>} Result of the removal operation
   */
  async removePath(path) {
    try {
      logger.info(`Removing from database: ${path}`)
      const result = await fileDB.removePath(path)
      this.processedPaths.delete(path)
      return { success: true, type: 'removed', path, affected: result }
    }
    catch (error) {
      return this._handleError('removal', path, error)
    }
  }

  // Core Processing Methods
  /**
   * Processes a file, extracting metadata and storing in database
   *
   * @param {string} filePath - Path to the file
   * @param {object} stats - fs.Stats object for the file
   * @returns {Promise<object>} Result of the processing operation
   */
  async processFile(filePath, stats) {
    if (this.processedPaths.has(filePath)) {
      logger.debug(`Skipping already processed file: ${filePath}`)
      return { success: true, type: 'file', path: filePath, status: 'already-processed' }
    }

    try {
      // Process parent folder first
      await this._ensureParentFolderProcessed(filePath)

      // Check if file exists in DB
      const existingFile = await fileDB.getFile(filePath)
      logger.debug(`Scanning file: ${filePath}`)

      // Skip unchanged files
      if (existingFile && existingFile.modifiedAt === stats.mtimeMs) {
        this.processedPaths.add(filePath)
        logger.debug(`Skipping unchanged file: ${filePath}`)
        return { success: true, type: 'file', path: filePath, status: 'unchanged' }
      }

      // Process file metadata using the stats object
      const fileDetails = await getFileMetadata(filePath, stats)
      if (!fileDetails) {
        logger.warn(`Failed to process file metadata: ${filePath}`)
        return { success: false, type: 'error', path: filePath, error: 'Failed to process file metadata' }
      }

      // Add watched folder path
      const watchedFolder = await this._findWatchedParentFolder(filePath)
      fileDetails.fileData.watchedFolderPath = watchedFolder?.path || null

      await this._saveFileToDatabase(filePath, fileDetails)
      this.processedPaths.add(filePath)

      logger.debug(`Successfully processed file: ${filePath} (${existingFile ? 'updated' : 'indexed'})`)
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

  /**
   * Processes a directory, updating database information
   *
   * @param {string} dirPath - Path to the directory
   * @param {object} stats - fs.Stats object for the directory
   * @returns {Promise<object>} Result of the processing operation
   */
  async processDirectory(dirPath, stats) {
    try {
      const watchedFolder = await this._findWatchedParentFolder(dirPath)
      await fileDB.updateFolder(dirPath, {
        modifiedAt: stats.mtimeMs,
        watchedFolderPath: watchedFolder?.path || null,
      })
      this.processedPaths.add(dirPath)
      logger.debug(`Processed directory: ${dirPath}`)
      return { success: true, type: 'directory', path: dirPath }
    }
    catch (error) {
      return this._handleError('directory', dirPath, error)
    }
  }

  // Helper Methods
  /**
   * Saves file metadata to the database
   *
   * @param {string} filePath - Path to the file
   * @param {object} fileDetails - Metadata to save
   * @private
   */
  async _saveFileToDatabase(filePath, fileDetails) {
    logger.debug(`Saving to database: ${filePath}`)
    const dbResult = await fileDB.updateFile(filePath, fileDetails)
    if (!dbResult) {
      throw new Error('Failed to update file in database')
    }
  }

  /**
   * Finds the parent watched folder for a given path
   * Uses cached watched folders list for performance
   *
   * @param {string} itemPath - Path to check
   * @returns {Promise<object | null>} The parent watched folder or null
   * @private
   */
  async _findWatchedParentFolder(itemPath) {
    const now = Date.now()
    
    // Refresh cache if expired or not initialized
    if (!this._watchedFoldersCache || (now - this._watchedFoldersCacheTime) > this._watchedFoldersCacheTTL) {
      const watchedFolders = await fileDB.getAllWatchFolderStatus()
      // Sort by path length descending to find the most specific parent folder
      // Do this once on cache refresh instead of every lookup
      this._watchedFoldersCache = watchedFolders.sort((a, b) => b.path.length - a.path.length)
      this._watchedFoldersCacheTime = now
    }
    
    return this._watchedFoldersCache.find(folder => itemPath.startsWith(folder.path))
  }

  /**
   * Ensures the parent folder is processed before processing a file
   *
   * @param {string} filePath - Path to the file
   * @private
   */
  async _ensureParentFolderProcessed(filePath) {
    const folderPath = path.dirname(filePath)
    if (!this.processedPaths.has(folderPath)) {
      logger.debug(`Processing parent folder first: ${folderPath}`)
      const folderStats = await this._safeFileStat(folderPath)
      if (folderStats) {
        await this.processDirectory(folderPath, folderStats)
      }
    }
  }

  /**
   * Safely retrieves file stats, returns null if file not accessible
   *
   * @param {string} filePath - Path to check
   * @returns {Promise<object | null>} fs.Stats object or null
   * @private
   */
  async _safeFileStat(filePath) {
    try {
      return await stat(filePath)
    }
    catch (error) {
      logger.debug(`Cannot access file/directory: ${filePath}`, error.code)
      return null
    }
  }

  /**
   * Handles and formats error information
   *
   * @param {string} operation - Type of operation that failed
   * @param {string} path - Path being processed
   * @param {Error} error - Error object
   * @returns {object} Formatted error details
   * @private
   */
  _handleError(operation, path, error) {
    const errorDetails = {
      success: false,
      type: 'error',
      operation,
      path,
      error: error.message,
      timestamp: Date.now(),
    }
    logger.error(`Error during ${operation} of ${path}: ${error.message}`)
    this.emit('error', errorDetails)
    return errorDetails
  }
}
