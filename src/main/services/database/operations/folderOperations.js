import path from 'node:path'

export const folderOperations = {
  // Cache prepared statements for better performance
  _folderStatements: {
    getFolderFileCount: null,
    getDirectCounts: null,
    getSubFolders: null,
    getFileCount: null,
    updateFolder: null,
    removeFolder: null,
    getFolderInfo: null,
  },

  // Initialize statements when first needed
  _initFolderStatements() {
    if (!this._folderStatements.getFolderFileCount) {
      this._folderStatements.getFolderFileCount = this.db.prepare('SELECT COUNT(*) as count FROM files WHERE folderPath = ?')
      this._folderStatements.getDirectCounts = this.db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM files WHERE folderPath = ?) as fileCount,
          (SELECT COUNT(*) FROM folders WHERE parentPath = ?) as childCount
      `)
      this._folderStatements.getSubFolders = this.db.prepare('SELECT path FROM folders WHERE parentPath = ?')
      this._folderStatements.getFileCount = this.db.prepare('SELECT COUNT(*) as count FROM files WHERE folderPath = ?')
      this._folderStatements.updateFolder = this.db.prepare(`
        UPDATE folders 
        SET directFileCount = ?,
            directChildCount = ?,
            totalFileCount = ?,
            totalChildCount = ?,
            indexedAt = ?
        WHERE path = ?
      `)
      this._folderStatements.removeFolder = this.db.prepare('DELETE FROM folders WHERE path = ?')
      this._folderStatements.getFolderInfo = this.db.prepare('SELECT * FROM folders WHERE path = ?')
    }
  },

  getFolderFileCount(folderPath) {
    this._initFolderStatements()
    return this._folderStatements.getFolderFileCount.get(folderPath).count
  },

  async updateFolderCounts(folderPath) {
    this._initFolderStatements()

    // Get direct counts with a single query for better performance
    const { fileCount: directFileCount, childCount: directChildCount }
      = this._folderStatements.getDirectCounts.get(folderPath, folderPath)

    // Calculate total counts recursively with cached prepared statements
    const getTotalCounts = (currentPath) => {
      const subFolders = this._folderStatements.getSubFolders.all(currentPath)
      let totalFileCount = this._folderStatements.getFileCount.get(currentPath).count
      let totalChildCount = subFolders.length

      for (const { path: subPath } of subFolders) {
        const subCounts = getTotalCounts(subPath)
        totalFileCount += subCounts.files
        totalChildCount += subCounts.children
      }

      return { files: totalFileCount, children: totalChildCount }
    }

    const totals = getTotalCounts(folderPath)

    // Update the current folder
    this._folderStatements.updateFolder.run(
      directFileCount,
      directChildCount,
      totals.files,
      totals.children,
      Date.now(),
      folderPath,
    )

    // Update parent folder
    const parentPath = path.dirname(folderPath)
    if (parentPath !== folderPath) {
      await this.updateFolderCounts(parentPath)
    }
  },

  // Adds or updates a folder in the database
  async updateFolder(folderPath, updates = {}) {
    const existingFolder = this.db.prepare('SELECT * FROM folders WHERE path = ?').get(folderPath)

    // If folder exists and modification date hasn't changed, skip update
    if (existingFolder && existingFolder.modifiedAt === updates.modifiedAt) {
      return null
    }

    const parentPath = path.dirname(folderPath)
    const name = path.basename(folderPath)

    // Preserve existing values if not provided in updates
    const finalUpdates = {
      name,
      parentPath: parentPath === folderPath ? null : parentPath,
      modifiedAt: updates.modifiedAt || Date.now(),
      indexedAt: Date.now(),
      directChildCount: updates.directChildCount ?? existingFolder?.directChildCount ?? 0,
      directFileCount: updates.directFileCount ?? this.getFolderFileCount(folderPath),
      watchedFolderPath: updates.watchedFolderPath ?? existingFolder?.watchedFolderPath ?? null,
    }

    const result = this.db
      .prepare(
        `
        INSERT OR REPLACE INTO folders (
          path, name, parentPath, modifiedAt, indexedAt,
          directChildCount, directFileCount, watchedFolderPath
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        folderPath,
        finalUpdates.name,
        finalUpdates.parentPath,
        finalUpdates.modifiedAt,
        finalUpdates.indexedAt,
        finalUpdates.directChildCount,
        finalUpdates.directFileCount,
        finalUpdates.watchedFolderPath,
      )

    // Update parent folder counts only if there was an actual update
    if (result.changes > 0 && parentPath !== folderPath) {
      await this.updateFolderCounts(parentPath)
    }

    return result
  },

  removeFolder(folderPath) {
    this._initFolderStatements()
    return this._folderStatements.removeFolder.run(folderPath)
  },

  getFolderInfo(folderPath) {
    this._initFolderStatements()
    return this._folderStatements.getFolderInfo.get(folderPath)
  },
}
