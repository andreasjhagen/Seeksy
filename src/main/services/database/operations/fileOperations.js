import { LRUCache } from '../utils/LRUCache.js'

// File metadata cache - stores recently accessed file info
// TTL of 30 seconds to ensure changes are detected reasonably quickly
const fileCache = new LRUCache(2000, 30000)

export const fileOperations = {
  // Cache prepared statements for better performance
  _fileStatements: {
    selectFile: null,
    upsertFile: null,
    getFileMetadata: null,
    getFileTags: null,
    removePath: null,
    removeEmptyFolders: null,
    getTotalCount: null,
    getAllFiles: null,
  },

  // Initialize statements when first needed
  _initFileStatements() {
    if (!this._fileStatements.selectFile) {
      this._fileStatements.selectFile = this.db.prepare('SELECT * FROM files WHERE path = ?')
      this._fileStatements.getFileTags = this.db.prepare(`
        SELECT t.name 
        FROM tags t
        JOIN file_tags ft ON ft.tag_id = t.id
        WHERE ft.file_path = ?
        ORDER BY t.name
      `)
      this._fileStatements.removePath = this.db.prepare('DELETE FROM files WHERE path = ? OR folderPath = ?')
      this._fileStatements.removeEmptyFolders = this.db.prepare(`
        DELETE FROM folders 
        WHERE path = ? 
        AND NOT EXISTS (SELECT 1 FROM files WHERE folderPath = ?)
        AND NOT EXISTS (SELECT 1 FROM folders WHERE parentPath = ?)
      `)
      this._fileStatements.getTotalCount = this.db.prepare('SELECT COUNT(*) as count FROM files')
      this._fileStatements.getAllFiles = this.db.prepare('SELECT path FROM files')
    }
  },

  async updateFile(filePath, data) {
    return this.db.transaction(() => {
      // Insert file data
      const { success } = this.upsertFileData(filePath, data.fileData)
      if (!success)
        return null

      // Invalidate cache after update
      fileCache.delete(filePath)

      return this.getFileWithMetadata(filePath)
    })()
  },

  serializeForDb(obj) {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      acc[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : value
      return acc
    }, {})
  },

  deserializeFromDb(obj) {
    if (!obj)
      return null

    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          acc[key] = JSON.parse(value)
        }
        catch {
          acc[key] = value
        }
      }
      else {
        acc[key] = value
      }
      return acc
    }, {})
  },

  upsertFileData(filePath, fileData) {
    try {
      // Ensure we have valid data
      if (!fileData || typeof fileData !== 'object') {
        throw new Error('Invalid file data')
      }

      // Filter out undefined values and sanitize the data
      const sanitizedData = this.serializeForDb(fileData)

      const columns = Object.keys(sanitizedData)
      if (columns.length === 0) {
        throw new Error('No valid columns to insert')
      }

      const values = Object.values(sanitizedData)
      const query = `
        INSERT INTO files (${columns.join(', ')})
        VALUES (${columns.map(() => '?').join(', ')})
        ON CONFLICT(path) DO UPDATE SET
        ${columns.map(col => `${col} = excluded.${col}`).join(', ')}
      `

      const stmt = this.db.prepare(query)
      const result = stmt.run(values)

      // Invalidate cache for this path
      fileCache.delete(filePath)

      return { success: true, changes: result.changes }
    }
    catch (error) {
      console.error(`Error in upsertFileData for ${filePath}:`, error)
      return { success: false, error: error.message }
    }
  },

  getFileWithMetadata(filePath) {
    this._initFileStatements()
    return this.db.transaction(() => {
      const file = this._fileStatements.selectFile.get(filePath)

      if (!file)
        return null

      return {
        fileData: this.deserializeFromDb({
          path: file.path,
          name: file.name,
          folderPath: file.folderPath,
          size: file.size,
          modifiedAt: file.modifiedAt,
          createdAt: file.createdAt,
          accessedAt: file.accessedAt,
          indexedAt: file.indexedAt,
          mimeType: file.mimeType,
          sha256Hash: file.sha256Hash,
          fileType: file.fileType,
        }),
      }
    })()
  },

  /**
   * Get file data with caching - use this for frequent lookups
   * @param {string} filePath - The path to the file
   * @returns {object|null} File data or null if not found
   */
  getCachedFile(filePath) {
    // Check cache first
    const cached = fileCache.get(filePath)
    if (cached !== undefined) {
      return cached
    }

    // Fetch from database
    const result = this.getFileWithMetadata(filePath)
    fileCache.set(filePath, result)
    return result
  },

  /**
   * Check if a file exists in the database (uses cache)
   * @param {string} filePath - The path to check
   * @returns {boolean} True if file exists
   */
  fileExists(filePath) {
    return this.getCachedFile(filePath) !== null
  },

  /**
   * Clear the file cache (useful when bulk operations complete)
   */
  clearCache() {
    fileCache.clear()
  },

  getFileTags(path) {
    this._initFileStatements()
    return this._fileStatements.getFileTags.all(path)
  },

  removePath(path) {
    this._initFileStatements()
    return this.db.transaction(() => {
      // Invalidate cache for this path and any child paths
      fileCache.deleteByPrefix(path)

      // Remove files and their metadata, but keep notes
      const result = this._fileStatements.removePath.run(path, path)

      // Clean up empty folders, but keep notes
      this._fileStatements.removeEmptyFolders.run(path, path, path)

      return result
    })()
  },

  /**
   * Batch upsert multiple files in a single transaction
   * Much faster than individual upsertFileData calls for bulk operations
   * @param {Array<{path: string, fileData: object}>} files - Array of file objects to upsert
   * @returns {{success: boolean, count: number, errors: Array}} Result of batch operation
   */
  batchUpsertFiles(files) {
    if (!files || files.length === 0) {
      return { success: true, count: 0, errors: [] }
    }

    const errors = []
    let successCount = 0

    try {
      // Run all upserts in a single transaction for ~5-10x performance improvement
      this.db.transaction(() => {
        for (const { path: filePath, fileData } of files) {
          try {
            const result = this.upsertFileData(filePath, fileData)
            if (result.success) {
              successCount++
            }
            else {
              errors.push({ path: filePath, error: result.error })
            }
          }
          catch (error) {
            errors.push({ path: filePath, error: error.message })
          }
        }
      })()

      // Invalidate cache for all affected paths
      for (const { path: filePath } of files) {
        fileCache.delete(filePath)
      }

      return { success: true, count: successCount, errors }
    }
    catch (error) {
      console.error('Batch upsert transaction failed:', error)
      return { success: false, count: successCount, errors: [...errors, { error: error.message }] }
    }
  },

  async getTotalCount() {
    this._initFileStatements()
    return this._fileStatements.getTotalCount.get().count
  },

  getFile(path) {
    this._initFileStatements()
    const file = this._fileStatements.selectFile.get(path)
    return file || null
  },

  clearAll() {
    return this.db.prepare('DELETE FROM files').run()
  },

  getAllFiles() {
    try {
      this._initFileStatements()
      // Make sure the statement exists before calling .all() on it
      if (!this._fileStatements.getAllFiles) {
        console.error('getAllFiles statement not initialized properly')
        // Fallback to creating the statement directly if needed
        const stmt = this.db.prepare('SELECT path FROM files')
        return stmt.all()
      }
      return this._fileStatements.getAllFiles.all()
    }
    catch (error) {
      console.error('Error in getAllFiles:', error)
      // Return empty array as fallback to prevent crashes
      return []
    }
  },

  // Stub function for image similarity - to maintain API compatibility
  findSimilarImages(path, { threshold = 0.9, limit = 10 } = {}) {
    return {
      success: false,
      error: 'Image similarity feature is not available - image_metadata table not found in the database',
    }
  },

  // Keep this utility function for future use
  calculateHammingDistance(hash1, hash2) {
    let distance = 0
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i])
        distance++
    }
    return distance
  },
}
