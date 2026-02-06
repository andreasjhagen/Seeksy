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
      updateSortOrder: {},
      findPath: null,
      getMaxSortOrder: null,
    }

    // Create table-specific statements
    for (const table of TABLES) {
      const type = table === 'applications' ? 'application' : table.slice(0, -1)

      this._statements.check[table] = this.db.prepare(
        `SELECT path, isFavorite FROM ${table} WHERE path = ?`,
      )

      // Order by favoriteSortOrder first (if set), then by favoriteAddedAt as fallback
      this._statements.getAll[table] = this.db.prepare(`
        SELECT *, '${type}' as type 
        FROM ${table} 
        WHERE isFavorite = 1 
        ORDER BY COALESCE(favoriteSortOrder, 999999999), favoriteAddedAt DESC
      `)

      this._statements.add[table] = this.db.prepare(`
        UPDATE ${table} 
        SET isFavorite = 1, favoriteAddedAt = ?, favoriteSortOrder = ?
        WHERE path = ?
      `)

      this._statements.remove[table] = this.db.prepare(`
        UPDATE ${table}
        SET isFavorite = 0, favoriteAddedAt = NULL, favoriteSortOrder = NULL
        WHERE path = ?
      `)

      this._statements.updateSortOrder[table] = this.db.prepare(`
        UPDATE ${table}
        SET favoriteSortOrder = ?
        WHERE path = ?
      `)
    }

    // Get max sort order across all favorites tables
    this._statements.getMaxSortOrder = this.db.prepare(`
      SELECT MAX(maxOrder) as maxOrder FROM (
        SELECT MAX(favoriteSortOrder) as maxOrder FROM files WHERE isFavorite = 1
        UNION ALL
        SELECT MAX(favoriteSortOrder) FROM folders WHERE isFavorite = 1
        UNION ALL
        SELECT MAX(favoriteSortOrder) FROM applications WHERE isFavorite = 1
        UNION ALL
        SELECT MAX(favoriteSortOrder) FROM emojis WHERE isFavorite = 1
      )
    `)

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

      // Sort by favoriteSortOrder first (lower = higher priority), then by favoriteAddedAt as fallback
      favorites.sort((a, b) => {
        const orderA = a.favoriteSortOrder ?? Number.MAX_SAFE_INTEGER
        const orderB = b.favoriteSortOrder ?? Number.MAX_SAFE_INTEGER
        if (orderA !== orderB)
          return orderA - orderB
        // Fallback to favoriteAddedAt descending (most recent first)
        return (b.favoriteAddedAt || 0) - (a.favoriteAddedAt || 0)
      })

      return { success: true, favorites }
    }
    catch (error) {
      return { success: false, error: error.message, favorites: [] }
    }
  },

  /**
   * Get the next available sort order for a new favorite
   * @private
   * @returns {number} The next sort order value
   */
  _getNextSortOrder() {
    const result = this._statements.getMaxSortOrder.get()
    return (result?.maxOrder ?? -1) + 1
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
      const sortOrder = this._getNextSortOrder()

      // Handle emoji special case - may need to create the record first
      if (type === 'emoji' && path.startsWith('emoji:/')) {
        return this._addEmojiToFavorites(path, timestamp, sortOrder)
      }

      // For all other types, just update the existing record
      const table = this._getTable(type)
      const result = this._statements.add[table].run(timestamp, sortOrder, path)

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
  _addEmojiToFavorites(path, timestamp, sortOrder) {
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
        favoriteSortOrder: sortOrder,
      })
      return { success: true, result: { changes: 1 }, isFavorite: true }
    }

    // Update existing emoji
    const result = this._statements.add.emojis.run(timestamp, sortOrder, path)
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

  /**
   * Reorder favorites by updating their sort order
   * @param {Array<{path: string, type: string}>} orderedFavorites - Array of favorites in desired order
   * @returns {object} Result of the operation
   */
  reorderFavorites(orderedFavorites) {
    try {
      this._initStatements()

      this.db.transaction(() => {
        for (let i = 0; i < orderedFavorites.length; i++) {
          const { path, type } = orderedFavorites[i]
          const table = this._getTable(type)
          this._statements.updateSortOrder[table].run(i, path)
        }
      })()

      return { success: true }
    }
    catch (error) {
      console.error('Failed to reorder favorites:', error)
      return { success: false, error: error.message }
    }
  },
}
