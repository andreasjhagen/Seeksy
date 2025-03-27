import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import { shell } from 'electron'
import { fileDB } from '../database/database.js'
import FileIconExtractor from '../disk-reader/FileIconExtractor.js'
import { LinuxAppIndexing } from './platforms/LinuxAppIndexing.js'
import { WindowsAppIndexing } from './platforms/WindowsAppIndexing.js'

const execPromise = util.promisify(exec)

class ApplicationLauncher {
  constructor() {
    this.applications = []
    this.appIndexer = null
    this.setupPlatform()
    this.iconExtractor = new FileIconExtractor(process.platform)
  }

  setupPlatform() {
    this.platform = process.platform

    if (this.platform === 'win32') {
      this.appIndexer = new WindowsAppIndexing()
    }
    else if (this.platform === 'linux') {
      this.appIndexer = new LinuxAppIndexing()
    }
  }

  async indexApplications() {
    try {
      if (!this.appIndexer) {
        return []
      }

      const indexerData = await this.appIndexer.index()

      // Deduplicate applications by path and validate executables
      const uniqueApps = new Map()
      for (const app of indexerData) {
        // Normalize the path to avoid case sensitivity issues
        const normalizedPath = app.path.toLowerCase()
        // Keep the most recently updated version if duplicate exists
        if (
          !uniqueApps.has(normalizedPath)
          || uniqueApps.get(normalizedPath).lastUpdated < app.lastUpdated
        ) {
          uniqueApps.set(normalizedPath, app)
        }
      }

      // Convert back to array
      this.applications = Array.from(uniqueApps.values())

      // Process icons for apps with iconSource but no icon
      for (const app of this.applications) {
        if (!app.icon && app.iconSource) {
          try {
            app.icon = await this.iconExtractor.extractIcon(app.iconSource)
          }
          catch (error) {
            console.warn(`Failed to extract icon for ${app.name}:`, error.message)
          }
        }
      }

      // Only delete non-custom applications
      await fileDB.resetSystemApplications()

      for (const app of this.applications) {
        try {
          fileDB.insertSystemApplication(app)
        }
        catch (error) {
          console.warn(`Failed to insert app ${app.path}:`, error.message)
        }
      }

      return this.applications
    }
    catch (error) {
      console.error('Indexing failed:', error)
      this.applications = []
      return this.applications
    }
  }

  async searchApps(query) {
    return await fileDB.searchApplications(query)
  }

  async launchApp(appInfo) {
    try {
      if (this.platform === 'linux') {
        if (appInfo.applicationType === 'desktop') {
          await execPromise(`gtk-launch ${path.basename(appInfo.path, '.desktop')}`)
        }
        else if (appInfo.applicationType === 'flatpak') {
          await execPromise(`flatpak run ${appInfo.path}`)
        }
        else {
          await shell.openPath(appInfo.path)
        }
      }
      else if (this.platform === 'win32') {
        if (appInfo.path.startsWith('steam://')) {
          await shell.openExternal(appInfo.path)
        }
        else if (appInfo.applicationType === 'uwp' && appInfo.requiresProtocolLaunch && appInfo.protocolUri) {
          // Launch UWP apps using their protocol URI via explorer
          await execPromise(`explorer.exe "${appInfo.protocolUri}"`)
        }
        else if (appInfo.applicationType === 'store') {
          await execPromise(`Start-Process "${appInfo.path}"`, { shell: 'powershell.exe' })
        }
        else if (appInfo.applicationType === 'exe' || appInfo.applicationType === 'lnk') {
          // Launch .exe files with their original working directory
          const workingDir = appInfo.workingDirectory || path.dirname(appInfo.path)
          await execPromise(`start "" "${appInfo.path}"`, { cwd: workingDir })
        }
        else {
          await shell.openPath(appInfo.path)
        }
      }
      return true
    }
    catch (error) {
      console.error('Launch failed:', error)
      return false
    }
  }
}

export const applicationLauncher = new ApplicationLauncher()
