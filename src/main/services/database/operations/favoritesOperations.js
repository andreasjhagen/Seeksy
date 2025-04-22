export const favoritesOperations = {
  // Cache prepared statements for better performance
  _favoriteStatements: {
    checkFavorite: {},
    getAllFavorites: {},
    addToFavorites: {},
    removeFromFavorites: {},
  },

  // Initialize statements on first use
  _initFavoriteStatements() {
    if (!this._favoriteStatements.checkFavorite.files) {
      // Create statements for checking favorites in each table
      ['files', 'folders', 'applications', 'emojis'].forEach((table) => {
        this._favoriteStatements.checkFavorite[table] = this.db
          .prepare(`SELECT path, isFavorite FROM ${table} WHERE path = ?`)

        // Create statements for fetching all favorites from each table
        this._favoriteStatements.getAllFavorites[table] = this.db
          .prepare(`SELECT *, 
              CASE 
                WHEN '${table}' = 'files' THEN 'file'
                WHEN '${table}' = 'folders' THEN 'folder'
                WHEN '${table}' = 'applications' THEN 'application'
                WHEN '${table}' = 'emojis' THEN 'emoji'
              END as type 
              FROM ${table} 
              WHERE isFavorite = 1 
              ORDER BY favoriteAddedAt DESC`)

        // Create statements for adding and removing favorites
        this._favoriteStatements.addToFavorites[table] = this.db
          .prepare(`UPDATE ${table} 
                    SET isFavorite = 1, favoriteAddedAt = ?
                    WHERE path = ?`)

        this._favoriteStatements.removeFromFavorites[table] = this.db
          .prepare(`UPDATE ${table}
                    SET isFavorite = 0, favoriteAddedAt = NULL
                    WHERE path = ?`)
      })
    }
  },

  /**
   * Check if a single path is favorited
   * @param {string} path - Path to check
   * @returns {object} Result object with isFavorite flag
   */
  isFavorite(path) {
    try {
      this._initFavoriteStatements()

      // Check if path exists in any table as a favorite
      for (const table of ['files', 'folders', 'applications', 'emojis']) {
        const result = this._favoriteStatements.checkFavorite[table].get(path)
        if (result && result.isFavorite) {
          return {
            success: true,
            isFavorite: true,
          }
        }
      }

      return {
        success: true,
        isFavorite: false,
      }
    }
    catch (error) {
      return {
        success: false,
        error: error.message,
        isFavorite: false,
      }
    }
  },

  getFavoriteStatus(paths) {
    try {
      this._initFavoriteStatements()

      // Use a Set for O(1) lookups (more efficient than array)
      const favorites = new Set()

      // Use transaction for batch processing
      this.db.transaction(() => {
        // Query each table for each path
        for (const path of paths) {
          for (const table of ['files', 'folders', 'applications', 'emojis']) {
            const result = this._favoriteStatements.checkFavorite[table].get(path)
            if (result && result.isFavorite) {
              favorites.add(path)
              // Break inner loop if already found as favorite
              break
            }
          }
        }
      })()

      // Convert set back to array for compatibility
      return Array.from(favorites)
    }
    catch (error) {
      throw new Error(`Failed to get favorite status: ${error.message}`)
    }
  },

  getAllFavorites() {
    try {
      this._initFavoriteStatements()
      const favorites = []

      // Use transaction for better performance
      this.db.transaction(() => {
        ['files', 'folders', 'applications', 'emojis'].forEach((table) => {
          const results = this._favoriteStatements.getAllFavorites[table].all()
          favorites.push(...results)
        })
      })()

      return {
        success: true,
        favorites,
      }
    }
    catch (error) {
      return {
        success: false,
        error: error.message,
        favorites: [],
      }
    }
  },

  addToFavorites(path, type) {
    try {
      this._initFavoriteStatements()

      // For emoji type, ensure the emoji exists in the emoji table
      if (type === 'emoji' && path.startsWith('emoji:/')) {
        const emoji = this.getEmoji(path)
        const char = path.replace('emoji:/', '')
        const name = char // Default name is the character itself

        if (!emoji) {
          // Create emoji record if it doesn't exist
          this.upsertEmoji({
            path,
            char,
            name,
            isFavorite: 1,
            favoriteAddedAt: Date.now(),
          })

          return {
            success: true,
            result: { changes: 1 },
            isFavorite: true,
          }
        }
        else {
          // Update existing emoji to be a favorite (in case it exists but isn't favorited)
          const table = this._getTableForType(type)
          const result = this._favoriteStatements.addToFavorites[table].run(Date.now(), path)

          return {
            success: true,
            result,
            isFavorite: true,
          }
        }
      }

      // For application type, ensure the application table is used
      if (type === 'application' || type === 'app') {
        const table = 'applications'
        const result = this._favoriteStatements.addToFavorites[table].run(Date.now(), path)

        return {
          success: true,
          result,
          isFavorite: true,
        }
      }

      const table = this._getTableForType(type)
      const result = this._favoriteStatements.addToFavorites[table].run(Date.now(), path)

      return {
        success: true,
        result,
        isFavorite: true,
      }
    }
    catch (error) {
      console.error('Failed to add to favorites:', error)
      return {
        success: false,
        error: error.message,
        isFavorite: false,
      }
    }
  },

  removeFromFavorites(path) {
    try {
      this._initFavoriteStatements()

      this.db.transaction(() => {
        ['files', 'folders', 'applications', 'emojis'].forEach((table) => {
          this._favoriteStatements.removeFromFavorites[table].run(path)
        })
      })()

      return {
        success: true,
        isFavorite: false,
      }
    }
    catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  },

  // Helper method to determine the correct table for a given type
  _getTableForType(type) {
    switch (type) {
      case 'file': return 'files'
      case 'folder': return 'folders'
      case 'application':
      case 'app': return 'applications'
      case 'emoji': return 'emojis'
      default: throw new Error(`Unknown type: ${type}`)
    }
  },
}
