import { indexStartMenuApps } from './windows/start-menu-indexer'
import { indexSteamGames } from './windows/steam-apps-indexer'
import { indexWindowsStoreApps } from './windows/windows-store-apps-indexer'

class WindowsAppIndexing {
  constructor() {
    this.applications = []
  }

  async index() {
    this.applications = []
    try {
      // Use the new Start Menu indexer to scan .lnk files
      const startMenuApps = await indexStartMenuApps()
      console.log('\x1B[32m%s\x1B[0m', 'startMenuApps: ', startMenuApps.length)

      // Index Windows Store (UWP) apps
      const windowsStoreApps = await indexWindowsStoreApps()
      console.log('\x1B[35m%s\x1B[0m', 'windowsStoreApps: ', windowsStoreApps.length)

      // Optionally keep Steam games indexing for better integration
      const steamApps = await indexSteamGames()
      console.log('\x1B[36m%s\x1B[0m', 'steamApps: ', steamApps.length)

      this.applications.push(
        ...startMenuApps, // Primary source - Start Menu shortcuts with icons
        ...windowsStoreApps, // Windows Store (UWP) apps
        ...steamApps, // Keep Steam games for better integration
      )

      // Deduplicate apps by path (unique identifier), with fallback to name+type for paths that differ
      const uniqueApps = new Map()

      for (const app of this.applications) {
        // Normalize path for comparison
        const normalizedPath = app.path.toLowerCase()

        // Create a compound key: prefer path, but for same names use type distinction
        const pathKey = normalizedPath
        const nameTypeKey = `${app.name.toLowerCase()}:${app.applicationType || 'unknown'}`

        // Check if this path already exists
        if (uniqueApps.has(pathKey)) {
          const existing = uniqueApps.get(pathKey)
          // Keep the one with icon, or newer lastUpdated
          if ((!existing.icon && app.icon)
            || (app.lastUpdated > (existing.lastUpdated || 0))) {
            uniqueApps.set(pathKey, app)
          }
        }
        // Check if same name+type combination exists (potential duplicate with different paths)
        else if (uniqueApps.has(nameTypeKey)) {
          const existing = uniqueApps.get(nameTypeKey)
          // Keep both if they're truly different apps (different paths)
          // But prefer Steam apps, then UWP, then others
          const priority = { steam: 1, uwp: 2, exe: 3, lnk: 4, store: 5 }
          const existingPriority = priority[existing.applicationType] || 99
          const newPriority = priority[app.applicationType] || 99

          if (newPriority < existingPriority) {
            // Remove old name-type key and add new one by path
            uniqueApps.delete(nameTypeKey)
            uniqueApps.set(pathKey, app)
          }
          else {
            // Keep existing, but also add by path if paths are different
            if (normalizedPath !== existing.path.toLowerCase()) {
              uniqueApps.set(pathKey, app)
            }
          }
        }
        else {
          // New app - add by path
          uniqueApps.set(pathKey, app)
        }
      }

      this.applications = Array.from(uniqueApps.values())
      console.log('\x1B[33m%s\x1B[0m', 'Total unique apps after deduplication:', this.applications.length)
    }
    catch (error) {
      console.error('Windows indexing failed:', error)
    }
    return this.applications
  }
}

export { WindowsAppIndexing }
