export const favoritesOperations = {
  getFavoriteStatus(paths) {
    try {
      // Assuming paths is an array and db is accessible through this context
      const favorites = []
      // Query each table for each path
      for (const path of paths) {
        ;['files', 'folders', 'applications'].forEach((table) => {
          const result = this.db
            .prepare(`SELECT path, isFavorite FROM ${table} WHERE path = ?`)
            .get(path)
          if (result && result.isFavorite) {
            favorites.push(path)
          }
        })
      }
      return favorites
    }
    catch (error) {
      throw new Error(`Failed to get favorite status: ${error.message}`)
    }
  },

  getAllFavorites() {
    try {
      const favorites = [];
      ['files', 'folders', 'applications'].forEach((table) => {
        const results = this.db
          .prepare(`SELECT *, 
            CASE 
              WHEN '${table}' = 'files' THEN 'file'
              WHEN '${table}' = 'folders' THEN 'folder'
              WHEN '${table}' = 'applications' THEN 'application'
            END as type 
            FROM ${table} 
            WHERE isFavorite = 1 
            ORDER BY favoriteAddedAt DESC`)
          .all()
        favorites.push(...results)
      })
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
      const table = type === 'file' ? 'files' : type === 'folder' ? 'folders' : 'applications'
      const result = this.db
        .prepare(
          `UPDATE ${table} 
           SET isFavorite = 1, favoriteAddedAt = ?
           WHERE path = ?`,
        )
        .run(Date.now(), path)

      return {
        success: true,
        result,
        isFavorite: true,
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

  removeFromFavorites(path) {
    try {
      ;['files', 'folders', 'applications'].forEach((table) => {
        this.db
          .prepare(
            `UPDATE ${table}
             SET isFavorite = 0, favoriteAddedAt = NULL
             WHERE path = ?`,
          )
          .run(path)
      })

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
}
