/**
 * Favorites Operations Module
 *
 * Provides optimized database operations for managing favorites across
 * multiple entity types (files, folders, applications, emojis).
 */

// Mapping between type names and table names
const TYPE_TABLE_MAP = {
  file: 'files',
  folder: 'folders',
  application: 'applications',
  app: 'applications',
  emoji: 'emojis',
}

// Ordered list of tables to check (most common first)
const TABLES = ['files', 'folders', 'applications', 'emojis']

export const favoritesOperations = {
  // Cache prepared statements for better performance
  _statements: null,

  /**
   * Initialize all prepared statements on first use
   * Uses a single initialization flag for cleaner code
   */
  _initStatements() {
    if (this._statements)
      return

    this._statements = {
      check: {},
      getAll: {},
      add: {},
      remove: {},
      findPath: null,
    }

    // Create table-specific statements
    for (const table of TABLES) {
      const type = table === 'applications' ? 'application' : table.slice(0, -1)

      this._statements.check[table] = this.db.prepare(
        `SELECT path, isFavorite FROM ${table} WHERE path = ?`,
      )

      this._statements.getAll[table] = this.db.prepare(`
        SELECT *, '${type}' as type 
        FROM ${table} 
        WHERE isFavorite = 1 
        ORDER BY favoriteAddedAt DESC
      `)

      this._statements.add[table] = this.db.prepare(`
        UPDATE ${table} 
        SET isFavorite = 1, favoriteAddedAt = ?
        WHERE path = ?
      `)

      this._statements.remove[table] = this.db.prepare(`
        UPDATE ${table}
        SET isFavorite = 0, favoriteAddedAt = NULL
        WHERE path = ?
      `)
    }

    // Combined query to find which table contains a path
    this._statements.findPath = this.db.prepare(`
      SELECT 'files' as tbl FROM files WHERE path = ?
      UNION ALL
      SELECT 'folders' FROM folders WHERE path = ?
      UNION ALL
      SELECT 'applications' FROM applications WHERE path = ?
      UNION ALL
      SELECT 'emojis' FROM emojis WHERE path = ?
      LIMIT 1
    `)
  },

  /**
   * Get the table name for a given type
   * @param {string} type - The item type
   * @returns {string} The table name
   */
  _getTable(type) {
    const table = TYPE_TABLE_MAP[type]
    if (!table)
      throw new Error(`Unknown type: ${type}`)
    return table
  },

  /**
   * Find which table contains a path
   * @param {string} path - The path to find
   * @returns {string|null} The table name or null
   */
  _findPathTable(path) {
    const result = this._statements.findPath.get(path, path, path, path)
    return result?.tbl || null
  },

  /**
   * Check if a single path is favorited
   * @param {string} path - Path to check
   * @returns {object} Result object with isFavorite flag
   */
  isFavorite(path) {
    try {
      this._initStatements()

      // Check each table until we find the path
      for (const table of TABLES) {
        const result = this._statements.check[table].get(path)
        if (result) {
          return {
            success: true,
            isFavorite: Boolean(result.isFavorite),
          }
        }
      }

      return { success: true, isFavorite: false }
    }
    catch (error) {
      return { success: false, error: error.message, isFavorite: false }
    }
  },

  /**
   * Get favorite status for multiple paths (batch operation)
   * @param {string[]} paths - Array of paths to check
   * @returns {string[]} Array of paths that are favorited
   */
  getFavoriteStatus(paths) {
    if (!paths?.length)
      return []

    try {
      this._initStatements()
      const favorites = new Set()

      this.db.transaction(() => {
        for (const path of paths) {
          for (const table of TABLES) {
            const result = this._statements.check[table].get(path)
            if (result?.isFavorite) {
              favorites.add(path)
              break // Found in this table, no need to check others
            }
          }
        }
      })()

      return Array.from(favorites)
    }
    catch (error) {
      throw new Error(`Failed to get favorite status: ${error.message}`)
    }
  },

  /**
   * Get all favorited items across all tables
   * @returns {object} Result with success flag and favorites array
   */
  getAllFavorites() {
    try {
      this._initStatements()
      const favorites = []

      this.db.transaction(() => {
        for (const table of TABLES) {
          favorites.push(...this._statements.getAll[table].all())
        }
      })()

      // Sort by favoriteAddedAt descending (most recent first)
      favorites.sort((a, b) => (b.favoriteAddedAt || 0) - (a.favoriteAddedAt || 0))

      return { success: true, favorites }
    }
    catch (error) {
      return { success: false, error: error.message, favorites: [] }
    }
  },

  /**
   * Add an item to favorites
   * @param {string} path - Path to the item
   * @param {string} type - Type of item (file, folder, application, emoji)
   * @returns {object} Result of the operation
   */
  addToFavorites(path, type) {
    try {
      this._initStatements()
      const timestamp = Date.now()

      // Handle emoji special case - may need to create the record first
      if (type === 'emoji' && path.startsWith('emoji:/')) {
        return this._addEmojiToFavorites(path, timestamp)
      }

      // For all other types, just update the existing record
      const table = this._getTable(type)
      const result = this._statements.add[table].run(timestamp, path)

      return {
        success: result.changes > 0,
        result,
        isFavorite: result.changes > 0,
      }
    }
    catch (error) {
      console.error('Failed to add to favorites:', error)
      return { success: false, error: error.message, isFavorite: false }
    }
  },

  /**
   * Handle adding emoji to favorites with auto-creation
   * @private
   */
  _addEmojiToFavorites(path, timestamp) {
    const emoji = this.getEmoji(path)
    const char = path.replace('emoji:/', '')

    if (!emoji) {
      // Create emoji record if it doesn't exist
      this.upsertEmoji({
        path,
        char,
        name: char,
        isFavorite: 1,
        favoriteAddedAt: timestamp,
      })
      return { success: true, result: { changes: 1 }, isFavorite: true }
    }

    // Update existing emoji
    const result = this._statements.add.emojis.run(timestamp, path)
    return { success: true, result, isFavorite: true }
  },

  /**
   * Remove an item from favorites
   * @param {string} path - Path to the item
   * @returns {object} Result of the operation
   */
  removeFromFavorites(path) {
    try {
      this._initStatements()

      // Update all tables in a single transaction
      // This is efficient because SQLite UPDATE on non-existent rows is a no-op
      this.db.transaction(() => {
        for (const table of TABLES) {
          this._statements.remove[table].run(path)
        }
      })()

      return { success: true, isFavorite: false }
    }
    catch (error) {
      return { success: false, error: error.message }
    }
  },
}
