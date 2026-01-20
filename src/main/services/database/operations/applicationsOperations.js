export const applicationsOperations = {
  // Cache prepared statements for better performance
  _appStatements: {
    insertSystemApp: null,
    resetSystemApps: null,
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
    }
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
