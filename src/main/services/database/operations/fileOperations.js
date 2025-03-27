export const fileOperations = {
  async updateFile(filePath, data) {
    return this.db.transaction(() => {
      // Insert file data
      const { success } = this.upsertFileData(filePath, data.fileData)
      if (!success)
        return null

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

      const result = this.db.prepare(query).run(values)
      return { success: true, changes: result.changes }
    }
    catch (error) {
      console.error(`Error in upsertFileData for ${filePath}:`, error)
      return { success: false, error: error.message }
    }
  },

  getFileWithMetadata(filePath) {
    return this.db.transaction(() => {
      const file = this.db
        .prepare('SELECT * FROM files WHERE path = ?')
        .get(filePath)

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
        })
      }
    })()
  },

  getFileTags(path) {
    return this.db
      .prepare(
        `
        SELECT t.name 
        FROM tags t
        JOIN file_tags ft ON ft.tag_id = t.id
        WHERE ft.file_path = ?
        ORDER BY t.name
      `,
      )
      .all(path)
  },

  removePath(path) {
    return this.db.transaction(() => {
      // Remove files and their metadata, but keep notes
      const result = this.db
        .prepare('DELETE FROM files WHERE path = ? OR folderPath = ?')
        .run(path, path)

      // Clean up empty folders, but keep notes
      this.db
        .prepare(
          `
          DELETE FROM folders 
          WHERE path = ? 
          AND NOT EXISTS (SELECT 1 FROM files WHERE folderPath = ?)
          AND NOT EXISTS (SELECT 1 FROM folders WHERE parentPath = ?)
        `,
        )
        .run(path, path, path)

      return result
    })()
  },

  async getTotalCount() {
    return this.db.prepare('SELECT COUNT(*) as count FROM files').get().count
  },

  getFile(path) {
    const file = this.db.prepare('SELECT * FROM files WHERE path = ?').get(path)
    return file || null
  },

  clearAll() {
    return this.db.prepare('DELETE FROM files').run()
  },

  getAllFiles() {
    return this.db.prepare('SELECT path FROM files').all()
  },

  findSimilarImages(path, { threshold = 0.9, limit = 10 } = {}) {
    try {
      // First get the pHash of our target image
      const sourceImage = this.db
        .prepare('SELECT im.pHash FROM image_metadata im WHERE im.path = ?')
        .get(path)

      if (!sourceImage?.pHash) {
        return { success: false, error: 'No pHash found for source image' }
      }

      // Find other images with their pHashes
      const allImages = this.db
        .prepare(
          `
          SELECT 
            f.path,
            f.name,
            im.pHash,
            im.width,
            im.height,
            im.format
          FROM files f
          JOIN image_metadata im ON f.path = im.path
          WHERE im.pHash IS NOT NULL
          AND f.path != ?
        `,
        )
        .all(path)

      // Calculate Hamming distances and filter by threshold
      const similarities = allImages
        .map((img) => {
          // Calculate normalized Hamming distance (0-1, where 1 is most similar)
          const distance = 1 - this.calculateHammingDistance(sourceImage.pHash, img.pHash) / 64
          return { ...img, similarity: distance }
        })
        .filter(img => img.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)

      return { success: true, results: similarities }
    }
    catch (error) {
      console.error('Error finding similar images:', error)
      return { success: false, error: error.message }
    }
  },

  calculateHammingDistance(hash1, hash2) {
    let distance = 0
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i])
        distance++
    }
    return distance
  },
}
