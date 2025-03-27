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
      console.log('\x1B[32m%s\x1B[0m', 'startMenuApps: ', startMenuApps.length, startMenuApps)

      // Index Windows Store (UWP) apps
      const windowsStoreApps = await indexWindowsStoreApps()
      console.log('\x1B[35m%s\x1B[0m', 'windowsStoreApps: ', windowsStoreApps.length, windowsStoreApps)

      // Optionally keep Steam games indexing for better integration
      const steamApps = await indexSteamGames()
      console.log('\x1B[36m%s\x1B[0m', 'steamApps: ', steamApps.length, steamApps)

      this.applications.push(
        ...startMenuApps, // Primary source - Start Menu shortcuts with icons
        ...windowsStoreApps, // Windows Store (UWP) apps
        ...steamApps, // Keep Steam games for better integration
      )

      // Deduplicate apps by name (prefer apps with icons)
      const uniqueApps = new Map()
      for (const app of this.applications) {
        const name = app.name.toLowerCase()
        if (!uniqueApps.has(name)
          || (!uniqueApps.get(name).icon && app.icon)
          || (app.applicationType === 'steam')
          || (app.applicationType === 'uwp' && uniqueApps.get(name).applicationType !== 'steam')) {
          uniqueApps.set(name, app)
        }
      }

      this.applications = Array.from(uniqueApps.values())
    }
    catch (error) {
      console.error('Windows indexing failed:', error)
    }
    return this.applications
  }
}

export { WindowsAppIndexing }
