import fs from 'node:fs'
import path from 'node:path'

export const watchedFolderOperations = {
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
    return this.db.transaction(() => {
      const name = path.basename(folderPath)
      const timestamp = Date.now()
      const lastModified = this._getFolderModifiedDate(folderPath)

      return this.db
        .prepare(
          `
          INSERT OR REPLACE INTO watched_folders 
          (path, name, totalFiles, processedFiles, lastIndexed, lastModified, depth)
          VALUES (?, ?, 0, 0, ?, ?, ?)
        `,
        )
        .run(folderPath, name, timestamp, lastModified, depth)
    })()
  },

  removeWatchFolderFromDb(folderPath) {
    return this.db.prepare('DELETE FROM watched_folders WHERE path = ?').run(folderPath)
  },

  getAllWatchFolderStatus() {
    return this.db.prepare('SELECT * FROM watched_folders').all()
  },

  getWatchedFolders() {
    return this.db
      .prepare(
        `
      SELECT path, name, totalFiles, processedFiles,
             lastModified, lastIndexed, depth
      FROM watched_folders
      WHERE 1=1
    `,
      )
      .all()
  },
}
