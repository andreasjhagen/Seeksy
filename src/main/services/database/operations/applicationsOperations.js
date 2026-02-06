export const applicationsOperations = {
  // Cache prepared statements for better performance
  _appStatements: {
    insertSystemApp: null,
    resetSystemApps: null,
    getFavorites: null,
    restoreFavorite: null,
    restoreFavoriteByName: null,
  },

  // Initialize statements when first needed
  _initAppStatements() {
    if (!this._appStatements.insertSystemApp) {
      this._appStatements.insertSystemApp = this.db.prepare(`
        INSERT INTO applications (
          path, name, displayName, description, keywords, categories,
          icon, lastUpdated, isSystem, isCustomAdded, applicationType
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      this._appStatements.resetSystemApps = this.db.prepare(
        `DELETE FROM applications WHERE isCustomAdded = 0`,
      )

      // Include name for fallback matching when paths change
      this._appStatements.getFavorites = this.db.prepare(
        `SELECT path, name, favoriteAddedAt FROM applications WHERE isFavorite = 1 AND isCustomAdded = 0`,
      )

      this._appStatements.restoreFavorite = this.db.prepare(
        `UPDATE applications SET isFavorite = 1, favoriteAddedAt = ? WHERE path = ?`,
      )

      // Fallback: restore by name if path doesn't match (handles path format changes)
      this._appStatements.restoreFavoriteByName = this.db.prepare(
        `UPDATE applications SET isFavorite = 1, favoriteAddedAt = ? WHERE name = ? AND isFavorite = 0`,
      )
    }
  },

  /**
   * Get all favorited system applications before reset
   * @returns {Array<{path: string, name: string, favoriteAddedAt: number}>} Array of favorited app info with timestamps
   */
  getSystemAppFavorites() {
    this._initAppStatements()
    return this._appStatements.getFavorites.all()
  },

  /**
   * Restore favorite status for applications after re-indexing
   * Uses path matching first, falls back to name matching if path doesn't exist
   * @param {Array<{path: string, name: string, favoriteAddedAt: number}>} favorites - Array of favorited app info with timestamps
   */
  restoreSystemAppFavorites(favorites) {
    if (!favorites || favorites.length === 0)
      return

    this._initAppStatements()

    this.db.transaction(() => {
      for (const fav of favorites) {
        // Try to restore by exact path first
        const result = this._appStatements.restoreFavorite.run(fav.favoriteAddedAt, fav.path)

        // If path didn't match (app might have different path format now), try by name
        if (result.changes === 0 && fav.name) {
          this._appStatements.restoreFavoriteByName.run(fav.favoriteAddedAt, fav.name)
        }
      }
    })()
  },

  insertSystemApplication(application) {
    this._initAppStatements()

    // Serialize arrays to JSON strings for storage
    const keywords = Array.isArray(application.keywords)
      ? JSON.stringify(application.keywords)
      : application.keywords || null
    const categories = Array.isArray(application.categories)
      ? JSON.stringify(application.categories)
      : application.categories || null

    return this._appStatements.insertSystemApp.run(
      application.path,
      application.name,
      application.displayName,
      application.description || null,
      keywords,
      categories,
      application.icon,
      application.lastUpdated,
      1, // isSystem
      0, // isCustomAdded
      application.applicationType,
    )
  },

  resetSystemApplications() {
    this._initAppStatements()
    return this._appStatements.resetSystemApps.run()
  },
}
