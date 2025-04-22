import fs from 'node:fs'
import path from 'node:path'

export const watchedFolderOperations = {
  // Cache prepared statements for better performance
  _watchStatements: {
    addFolder: null,
    removeFolder: null,
    getAllStatus: null,
    getWatchedFolders: null,
  },

  // Initialize statements when first needed
  _initWatchStatements() {
    if (!this._watchStatements.addFolder) {
      this._watchStatements.addFolder = this.db.prepare(`
        INSERT OR REPLACE INTO watched_folders 
        (path, name, totalFiles, processedFiles, lastIndexed, lastModified, depth)
        VALUES (?, ?, 0, 0, ?, ?, ?)
      `)

      this._watchStatements.removeFolder = this.db.prepare(
        'DELETE FROM watched_folders WHERE path = ?',
      )

      this._watchStatements.getAllStatus = this.db.prepare(
        'SELECT * FROM watched_folders',
      )

      this._watchStatements.getWatchedFolders = this.db.prepare(`
        SELECT path, name, totalFiles, processedFiles,
               lastModified, lastIndexed, depth
        FROM watched_folders
        WHERE 1=1
      `)
    }
  },

  // Helper function to get folder's last modified date
  _getFolderModifiedDate(folderPath) {
    try {
      const stats = fs.statSync(folderPath)
      return stats.mtimeMs
    }
    catch (error) {
      console.error('Error getting folder modified date:', error)
      return Date.now()
    }
  },

  addWatchFolder(folderPath, depth = Infinity) {
    this._initWatchStatements()

    return this.db.transaction(() => {
      const name = path.basename(folderPath)
      const timestamp = Date.now()
      const lastModified = this._getFolderModifiedDate(folderPath)

      return this._watchStatements.addFolder.run(
        folderPath,
        name,
        timestamp,
        lastModified,
        depth,
      )
    })()
  },

  removeWatchFolderFromDb(folderPath) {
    this._initWatchStatements()
    return this._watchStatements.removeFolder.run(folderPath)
  },

  getAllWatchFolderStatus() {
    this._initWatchStatements()
    return this._watchStatements.getAllStatus.all()
  },

  getWatchedFolders() {
    this._initWatchStatements()
    return this._watchStatements.getWatchedFolders.all()
  },
}
