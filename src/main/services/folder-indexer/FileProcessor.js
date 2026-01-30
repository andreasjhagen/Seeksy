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
import { getCacheKey, pathStartsWith } from '../../utils/pathUtils.js'
import { fileDB } from '../database/database.js'
import { getFileMetadata } from './getFileMetadata.js'

// Create a dedicated logger for the file processor
const logger = createLogger('FileProcessor')

// Default batch size for database writes
const DB_BATCH_SIZE = 50

export class FileProcessor extends EventEmitter {
  /**
   * Creates a new FileProcessor instance
   */
  constructor() {
    super()
    this.processedPaths = new Set()
    this.processingPaths = new Map() // Track paths being processed

    // Batch write buffer for improved database performance
    this._pendingWrites = []
    this._batchSize = DB_BATCH_SIZE

    // Cache for watched folders - sorted by path length descending
    this._watchedFoldersCache = null
    this._watchedFoldersCacheTime = 0
    this._watchedFoldersCacheTTL = 30000 // 30 seconds TTL
  }

  /**
   * Clears the processedPaths set to free memory after initial scan
   * Should be called when transitioning from 'indexing' to 'watching' state
   */
  clearProcessedPaths() {
    const count = this.processedPaths.size
    this.processedPaths.clear()
    // Also flush any pending writes
    this.flushPendingWrites()
    logger.info(`Cleared ${count} entries from processedPaths cache`)
  }

  /**
   * Flush pending writes to the database
   * Call this after processing a batch of files or when transitioning states
   */
  flushPendingWrites() {
    if (this._pendingWrites.length === 0) {
      return { success: true, count: 0 }
    }

    const writes = this._pendingWrites
    this._pendingWrites = []

    logger.debug(`Flushing ${writes.length} pending writes to database`)
    const result = fileDB.batchUpsertFiles(writes)

    if (result.errors.length > 0) {
      logger.warn(`Batch write completed with ${result.errors.length} errors`)
    }

    return result
  }

  /**
   * Queue a file for batch writing to the database
   * Automatically flushes when batch size is reached
   * @param {string} filePath - Path to the file
   * @param {object} fileData - File metadata to write
   */
  _queueFileWrite(filePath, fileData) {
    this._pendingWrites.push({ path: filePath, fileData })

    // Auto-flush when batch is full
    if (this._pendingWrites.length >= this._batchSize) {
      this.flushPendingWrites()
    }
  }

  /**
   * Invalidate the watched folders cache
   * Call this when watched folders are added/removed
   */
  invalidateWatchedFoldersCache() {
    this._watchedFoldersCache = null
    this._watchedFoldersCacheTime = 0
  }

  // Path tracking helper methods using normalized keys
  _hasProcessedPath(filePath) {
    return this.processedPaths.has(getCacheKey(filePath))
  }

  _addProcessedPath(filePath) {
    this.processedPaths.add(getCacheKey(filePath))
  }

  _deleteProcessedPath(filePath) {
    this.processedPaths.delete(getCacheKey(filePath))
  }

  _hasProcessingPath(filePath) {
    return this.processingPaths.has(getCacheKey(filePath))
  }

  _setProcessingPath(filePath) {
    this.processingPaths.set(getCacheKey(filePath), Date.now())
  }

  _deleteProcessingPath(filePath) {
    this.processingPaths.delete(getCacheKey(filePath))
  }

  /**
   * Process a file or directory path
   *
   * @param {string} filePath - Path to process
   * @param {object} [providedStats] - Pre-retrieved fs.Stats object (optional)
   * @returns {Promise<object>} Result of the processing operation
   */
  async processPath(filePath, providedStats = null) {
    // Skip if already being processed (using normalized key for consistency)
    if (this._hasProcessingPath(filePath)) {
      logger.debug(`Skipping already processing path: ${filePath}`)
      return { success: true, path: filePath, status: 'already-processing' }
    }

    try {
      this._setProcessingPath(filePath)

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
      this._deleteProcessingPath(filePath)
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
      this._deleteProcessedPath(path)
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
    if (this._hasProcessedPath(filePath)) {
      logger.debug(`Skipping already processed file: ${filePath}`)
      return { success: true, type: 'file', path: filePath, status: 'already-processed' }
    }

    try {
      // Get watched folder once (used for both parent processing and file metadata)
      const watchedFolder = await this._findWatchedParentFolder(filePath)

      // Process parent folders first (pass watched folder to avoid duplicate lookup)
      await this._ensureParentFolderProcessed(filePath, watchedFolder)

      // Check if file exists in DB (use cached lookup for better performance)
      const existingFile = await fileDB.getCachedFile(filePath)
      logger.debug(`Scanning file: ${filePath}`)

      // Skip unchanged files
      if (existingFile && existingFile.modifiedAt === stats.mtimeMs) {
        this._addProcessedPath(filePath)
        logger.debug(`Skipping unchanged file: ${filePath}`)
        return { success: true, type: 'file', path: filePath, status: 'unchanged' }
      }

      // Process file metadata using the stats object
      const fileDetails = await getFileMetadata(filePath, stats)
      if (!fileDetails) {
        logger.warn(`Failed to process file metadata: ${filePath}`)
        return { success: false, type: 'error', path: filePath, error: 'Failed to process file metadata' }
      }

      // Add watched folder path (reuse the already-fetched value)
      fileDetails.fileData.watchedFolderPath = watchedFolder?.path || null

      await this._saveFileToDatabase(filePath, fileDetails)
      this._addProcessedPath(filePath)

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
      this._addProcessedPath(dirPath)
      logger.debug(`Processed directory: ${dirPath}`)
      return { success: true, type: 'directory', path: dirPath }
    }
    catch (error) {
      return this._handleError('directory', dirPath, error)
    }
  }

  // Helper Methods
  /**
   * Saves file metadata to the database (queued for batch write)
   *
   * @param {string} filePath - Path to the file
   * @param {object} fileDetails - Metadata to save
   * @private
   */
  async _saveFileToDatabase(filePath, fileDetails) {
    logger.debug(`Queueing for batch write: ${filePath}`)
    this._queueFileWrite(filePath, fileDetails.fileData)
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

    // Use pathStartsWith for proper cross-platform path comparison
    // This handles path separator differences (/ vs \) and case sensitivity on Windows
    // e.g., "/home/foo" should not match "/home/foobar"
    return this._watchedFoldersCache.find(folder => pathStartsWith(itemPath, folder.path))
  }

  /**
   * Ensures all parent folders up to (but not including) the watched folder are processed
   *
   * @param {string} filePath - Path to the file
   * @param {object|null} watchedFolder - Pre-fetched watched folder (optional, for performance)
   * @private
   */
  async _ensureParentFolderProcessed(filePath, watchedFolder = null) {
    // Use provided watched folder or find it
    const watched = watchedFolder ?? await this._findWatchedParentFolder(filePath)
    const watchedPath = watched?.path

    // Quick check: if immediate parent is already processed, likely all ancestors are too
    const immediateParent = path.dirname(filePath)
    if (this._hasProcessedPath(immediateParent)) {
      return
    }

    // Collect all parent folders that need processing (from immediate parent up to watched folder)
    const foldersToProcess = []
    let currentPath = immediateParent
    let iterationGuard = 0
    const maxIterations = 100 // Safety guard against infinite loops

    while (currentPath && currentPath !== watchedPath && currentPath !== path.dirname(currentPath)) {
      // Safety guard against infinite loops (e.g., symlink cycles, unusual paths)
      if (++iterationGuard > maxIterations) {
        logger.warn(`Max iterations reached while processing parent folders for: ${filePath}`)
        break
      }

      if (!this._hasProcessedPath(currentPath)) {
        foldersToProcess.push(currentPath)
      }
      currentPath = path.dirname(currentPath)
    }

    // If nothing to process, return early
    if (foldersToProcess.length === 0) {
      return
    }

    // Process folders from root-most to leaf (reverse order) so parents are indexed before children
    for (const folderPath of foldersToProcess.reverse()) {
      logger.debug(`Processing parent folder: ${folderPath}`)
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
