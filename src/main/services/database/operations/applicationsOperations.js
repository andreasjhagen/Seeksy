export const applicationsOperations = {
  insertSystemApplication(application) {
    const stmt = this.db.prepare(`
            INSERT INTO applications (
                    path, name, displayName, icon, 
                    lastUpdated, isSystem, isCustomAdded, applicationType
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    return stmt.run(
      application.path,
      application.name,
      application.displayName,
      application.icon,
      application.lastUpdated,
      1, // isSystem
      0, // isCustomAdded
      application.applicationType,
    )
  },
  resetSystemApplications() {
    return this.db.prepare(`DELETE FROM applications WHERE isCustomAdded = 0`).run()
  },
}
