import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import vdf from 'vdf-parser'

/**
 * Handles extraction of icons from Steam applications
 */
class SteamIconExtractor {
  constructor() {
    this.steamInstallPath = null
    this.steamLibraries = null
    this.steamApps = null
    this.userDataPaths = null
  }

  /**
   * Gets Steam installation path
   * @returns {Promise<string|null>} Path to Steam installation or null if not found
   */
  async getSteamInstallPath() {
    if (this.steamInstallPath) {
      return this.steamInstallPath
    }

    try {
      // Default Steam installation paths based on platform
      let steamPath
      const platform = process.platform

      if (platform === 'win32') {
        // Check common Windows installation paths
        const possiblePaths = [
          'C:\\Program Files (x86)\\Steam',
          'C:\\Program Files\\Steam',
          'D:\\Steam',
        ]

        for (const path of possiblePaths) {
          try {
            await fs.promises.access(path)
            steamPath = path
            break
          }
          catch {
            // Path doesn't exist, continue to next path
          }
        }
      }
      else if (platform === 'darwin') {
        steamPath = path.join(app.getPath('home'), 'Library/Application Support/Steam')
      }
      else if (platform === 'linux') {
        steamPath = path.join(app.getPath('home'), '.steam/steam')
      }

      if (steamPath) {
        try {
          await fs.promises.access(steamPath)
          this.steamInstallPath = steamPath
          return steamPath
        }
        catch {
          // Path isn't accessible
          return null
        }
      }

      return null
    }
    catch (error) {
      console.error('Error finding Steam path:', error)
      return null
    }
  }

  /**
   * Loads Steam library folders
   * @returns {Promise<Array<string>>} Array of Steam library paths
   */
  async getSteamLibraryFolders() {
    if (this.steamLibraries) {
      return this.steamLibraries
    }

    try {
      const steamPath = await this.getSteamInstallPath()
      if (!steamPath) {
        return []
      }

      const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')

      try {
        await fs.promises.access(libraryFoldersPath)
      }
      catch {
        // libraryfolders.vdf doesn't exist, return just the default library
        this.steamLibraries = [path.join(steamPath, 'steamapps')]
        return this.steamLibraries
      }

      const libraryFoldersContent = await fs.promises.readFile(libraryFoldersPath, 'utf8')
      const parsed = vdf.parse(libraryFoldersContent)

      const libraries = [path.join(steamPath, 'steamapps')] // Default library

      if (parsed.libraryfolders) {
        // For newer Steam library format
        Object.values(parsed.libraryfolders).forEach((library) => {
          if (library.path) {
            libraries.push(path.join(library.path, 'steamapps'))
          }
        })
      }

      this.steamLibraries = libraries
      return libraries
    }
    catch (error) {
      console.error('Error loading Steam libraries:', error)
      return []
    }
  }

  /**
   * Loads Steam app information
   * @returns {Promise<object | null>} Map of Steam app IDs to app info
   */
  async loadSteamApps() {
    if (this.steamApps) {
      return this.steamApps
    }

    try {
      const libraries = await this.getSteamLibraryFolders()
      const steamApps = {}

      for (const library of libraries) {
        try {
          const files = await fs.promises.readdir(library)

          for (const file of files) {
            if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
              try {
                const appId = file.replace('appmanifest_', '').replace('.acf', '')
                const manifestPath = path.join(library, file)
                const manifestContent = await fs.promises.readFile(manifestPath, 'utf8')
                const parsed = vdf.parse(manifestContent)

                if (parsed.AppState) {
                  steamApps[appId] = {
                    name: parsed.AppState.name,
                    installDir: parsed.AppState.installdir,
                    library,
                  }
                }
              }
              catch (err) {
                console.debug(`Error parsing Steam app manifest ${file}:`, err)
              }
            }
          }
        }
        catch (err) {
          console.debug(`Error reading Steam library ${library}:`, err)
        }
      }

      this.steamApps = steamApps
      return steamApps
    }
    catch (error) {
      console.error('Error loading Steam apps:', error)
      return null
    }
  }

  /**
   * Gets Steam user data directories
   * @returns {Promise<string[]>} Array of Steam user data paths
   */
  async getSteamUserDataPaths() {
    if (this.userDataPaths) {
      return this.userDataPaths
    }

    try {
      const steamPath = await this.getSteamInstallPath()
      if (!steamPath) {
        return []
      }

      const userDataPath = path.join(steamPath, 'userdata')
      try {
        await fs.promises.access(userDataPath)
        const userDirs = await fs.promises.readdir(userDataPath)

        // Filter directories that are numeric (Steam user IDs)
        const validUserDirs = userDirs.filter(dir => /^\d+$/.test(dir))
        this.userDataPaths = validUserDirs.map(dir => path.join(userDataPath, dir))
        return this.userDataPaths
      }
      catch (err) {
        console.debug('Steam userdata directory not accessible:', err)
        return []
      }
    }
    catch (error) {
      console.error('Error finding Steam user data paths:', error)
      return []
    }
  }

  /**
   * Finds icon path for a Steam application with enhanced search
   * @param {string} appId - Steam application ID
   * @returns {Promise<string|null>} Path to the icon file or null if not found
   */
  async findSteamAppIconPath(appId) {
    try {
      if (!appId) {
        return null
      }

      // 1. First check Steam's own icon cache
      const steamIconPath = await this.findSteamCacheIcon(appId)
      if (steamIconPath) {
        return steamIconPath
      }

      // 2. Then check Steam grid/library images
      const gridImagePath = await this.findSteamGridImage(appId)
      if (gridImagePath) {
        return gridImagePath
      }

      // 3. Finally check the actual game installation directory
      const apps = await this.loadSteamApps()
      if (!apps || !apps[appId]) {
        console.debug(`Steam app ${appId} not found in library`)
        return null
      }

      const appInfo = apps[appId]
      const appPath = path.join(appInfo.library, 'common', appInfo.installDir)

      // Check if the app directory exists
      try {
        await fs.promises.access(appPath)
      }
      catch {
        console.debug(`Steam app directory not found: ${appPath}`)
        return null
      }

      // Look for common icon file locations with expanded search
      return await this.findIconInGameDirectory(appPath, appInfo.installDir)
    }
    catch (error) {
      console.error(`Error finding Steam icon for app ${appId}:`, error)
      return null
    }
  }

  /**
   * Find icon in Steam's icon cache
   * @param {string} appId - Steam application ID
   * @returns {Promise<string|null>} Path to cached icon or null if not found
   */
  async findSteamCacheIcon(appId) {
    try {
      const steamPath = await this.getSteamInstallPath()
      if (!steamPath) {
        return null
      }

      // Steam icon cache locations
      const iconCachePaths = [
        path.join(steamPath, 'steam', 'games'), // Primary location
        path.join(steamPath, 'steam', 'cached'), // Alternative location
        path.join(steamPath, 'resource', 'icons'), // Another possible location
      ]

      for (const cachePath of iconCachePaths) {
        try {
          await fs.promises.access(cachePath)

          // Check for common icon naming patterns
          const iconFormats = [
            `${appId}.ico`,
            `${appId}.png`,
            `${appId}_icon.jpg`,
            `icon_${appId}.png`,
          ]

          for (const format of iconFormats) {
            const iconPath = path.join(cachePath, format)
            try {
              await fs.promises.access(iconPath)
              return iconPath
            }
            catch {
              // Icon not found, continue to next format
            }
          }
        }
        catch {
          // Cache directory not accessible, continue to next one
        }
      }

      return null
    }
    catch (error) {
      console.debug(`Error finding cached Steam icon for app ${appId}:`, error)
      return null
    }
  }

  /**
   * Find Steam grid/library images
   * @param {string} appId - Steam application ID
   * @returns {Promise<string|null>} Path to grid image or null if not found
   */
  async findSteamGridImage(appId) {
    try {
      const userPaths = await this.getSteamUserDataPaths()

      for (const userPath of userPaths) {
        const gridPath = path.join(userPath, 'config', 'grid')

        try {
          await fs.promises.access(gridPath)

          // Check for common grid image formats in preferred order
          const gridFormats = [
            `${appId}.png`, // Standard grid image
            `${appId}p.png`, // Portrait grid image
            `${appId}_hero.png`, // Hero banner
            `${appId}_logo.png`, // Game logo
            `${appId}.jpg`,
            `${appId}p.jpg`,
            `${appId}_hero.jpg`,
            `${appId}_logo.jpg`,
          ]

          for (const format of gridFormats) {
            const imagePath = path.join(gridPath, format)
            try {
              await fs.promises.access(imagePath)
              return imagePath
            }
            catch {
              // Grid image not found, try next format
            }
          }
        }
        catch {
          // Grid folder doesn't exist or isn't accessible
        }
      }

      return null
    }
    catch (error) {
      console.debug(`Error finding Steam grid image for app ${appId}:`, error)
      return null
    }
  }

  /**
   * Find icons within a game's installation directory
   * @param {string} appPath - Path to game installation directory
   * @param {string} installDir - Installation directory name
   * @returns {Promise<string|null>} Path to the game icon or null if not found
   */
  async findIconInGameDirectory(appPath, installDir) {
    // Common subdirectories to check for icons
    const subDirs = [
      '', // Root directory
      'icons',
      'icon',
      'resources',
      'assets',
      'images',
      'data',
      path.join('resources', 'app'),
      path.join('resources', 'icons'),
      '_CommonRedist',
    ]

    // File names to check, ordered by preference
    const iconNames = [
      `${installDir}.ico`,
      'icon.ico',
      'game.ico',
      'app.ico',
      'launcher.ico',
      'logo.ico',
      `${installDir}.png`,
      'icon.png',
      'logo.png',
      'header.jpg',
      'header.png',
      'icon.jpg',
      'logo.jpg',
    ]

    // Check all subdirectories for icon files
    for (const subDir of subDirs) {
      const checkPath = path.join(appPath, subDir)

      try {
        await fs.promises.access(checkPath)

        for (const iconName of iconNames) {
          const iconPath = path.join(checkPath, iconName)
          try {
            await fs.promises.access(iconPath)
            return iconPath
          }
          catch {
            // Icon not found, try next one
          }
        }

        // If still in the root directory and no specific icon found, check all files
        if (subDir === '') {
          try {
            const files = await fs.promises.readdir(checkPath)

            // First look for any icon files
            const iconFiles = files.filter(file =>
              file.endsWith('.ico')
              || file.endsWith('.png')
              || file.endsWith('.jpg')
              || file.endsWith('.jpeg'),
            )

            if (iconFiles.length > 0) {
              return path.join(checkPath, iconFiles[0])
            }

            // Then check for exe files as a last resort
            const exeFiles = files.filter(file => file.endsWith('.exe'))

            if (exeFiles.length > 0) {
              // Prioritize exe files that might be the main launcher
              const mainExe = exeFiles.find(file =>
                file.toLowerCase().includes('launcher')
                || file.toLowerCase() === `${installDir.toLowerCase()}.exe`,
              ) || exeFiles[0]

              return path.join(checkPath, mainExe)
            }
          }
          catch {
            // Could not read directory
          }
        }
      }
      catch {
        // Directory doesn't exist or isn't accessible
      }
    }

    return null
  }

  /**
   * Parses Steam URL to extract app ID
   * @param {string} steamUrl - Steam URL (e.g., steam://rungameid/123456)
   * @returns {string|null} Steam app ID or null if invalid URL
   */
  static parseAppIdFromUrl(steamUrl) {
    if (!steamUrl || typeof steamUrl !== 'string')
      return null

    // Handle steam://rungameid/123456 format
    if (steamUrl.startsWith('steam://rungameid/')) {
      return steamUrl.replace('steam://rungameid/', '').trim()
    }

    // Could add support for other Steam URL formats here

    return null
  }

  /**
   * Checks if a given URL is a Steam URL
   * @param {string} url - URL to check
   * @returns {boolean} True if URL is a Steam URL
   */
  static isSteamUrl(url) {
    return url && typeof url === 'string' && url.startsWith('steam://')
  }
}

export default SteamIconExtractor
