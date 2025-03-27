import path from 'node:path'

export const folderOperations = {
  getFolderFileCount(folderPath) {
    return this.db
      .prepare('SELECT COUNT(*) as count FROM files WHERE folderPath = ?')
      .get(folderPath)
      .count
  },

  async updateFolderCounts(folderPath) {
    const [directFileCount, directChildCount] = await Promise.all([
      this.db.prepare('SELECT COUNT(*) as count FROM files WHERE folderPath = ?').get(folderPath).count,
      this.db.prepare('SELECT COUNT(*) as count FROM folders WHERE parentPath = ?').get(folderPath).count,
    ])

    // Calculate total counts recursively
    const getTotalCounts = (currentPath) => {
      const subFolders = this.db
        .prepare('SELECT path FROM folders WHERE parentPath = ?')
        .all(currentPath)

      let totalFileCount = this.db
        .prepare('SELECT COUNT(*) as count FROM files WHERE folderPath = ?')
        .get(currentPath)
        .count

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
    this.db
      .prepare(
        `
        UPDATE folders 
        SET directFileCount = ?,
            directChildCount = ?,
            totalFileCount = ?,
            totalChildCount = ?,
            indexedAt = ?
        WHERE path = ?
      `,
      )
      .run(directFileCount, directChildCount, totals.files, totals.children, Date.now(), folderPath)

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
      directFileCount: updates.directFileCount ?? this.getFolderFileCount(folderPath), // Now using the method directly
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
    return this.db.prepare('DELETE FROM folders WHERE path = ?').run(folderPath)
  },

  getFolderInfo(folderPath) {
    return this.db.prepare('SELECT * FROM folders WHERE path = ?').get(folderPath)
  },
}
