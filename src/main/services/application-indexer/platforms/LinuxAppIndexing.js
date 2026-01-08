import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import { parse } from 'ini'
import FileIconExtractor from '../../disk-reader/FileIconExtractor.js'

const execPromise = util.promisify(exec)
const readFileAsync = util.promisify(fs.readFile)
const readdirAsync = util.promisify(fs.readdir)
const statAsync = util.promisify(fs.stat)
const accessAsync = util.promisify(fs.access)

class LinuxAppIndexing {
  constructor() {
    this.applications = []
    this.iconExtractor = new FileIconExtractor()
    this.iconThemes = ['hicolor', 'Adwaita', 'gnome', 'breeze', 'elementary', 'oxygen']
    this.iconSizes = ['256x256', '128x128', '96x96', '64x64', '48x48', '32x32', '24x24', '22x22', '16x16', 'scalable']
    this.iconFormats = ['.svg', '.png', '.xpm']
  }

  async index() {
    this.applications = []
    const desktopPaths = [
      '/usr/share/applications',
      path.join(process.env.HOME, '.local/share/applications'),
      '/var/lib/snapd/desktop/applications',
    ]

    // Index desktop files in parallel
    const desktopPromises = desktopPaths.map(async (desktopPath) => {
      try {
        const files = await this.findDesktopFiles(desktopPath)
        const apps = await Promise.all(files.map(file => this.processDesktopFile(file)))
        return apps.filter(Boolean)
      }
      catch (error) {
        console.warn('Desktop path error:', error.message)
        return []
      }
    })

    const desktopResults = await Promise.all(desktopPromises)
    for (const apps of desktopResults) {
      this.applications.push(...apps)
    }

    // Index Flatpak applications
    try {
      await this.indexFlatpakApps()
    }
    catch (error) {
      console.warn('Flatpak indexing error:', error.message)
    }

    // Index Snap applications via snap list command
    try {
      await this.indexSnapApps()
    }
    catch (error) {
      console.warn('Snap indexing error:', error.message)
    }

    // Index AppImage files
    try {
      await this.indexAppImages()
    }
    catch (error) {
      console.warn('AppImage indexing error:', error.message)
    }

    return this.applications
  }

  async findDesktopFiles(dir) {
    try {
      const { stdout } = await execPromise(`find "${dir}" -name "*.desktop" 2>/dev/null`)
      return stdout.split('\n').filter(Boolean)
    }
    catch (error) {
      return []
    }
  }

  async processDesktopFile(filePath) {
    try {
      const content = await readFileAsync(filePath, 'utf-8')
      const parsed = parse(content.replace(/=/g, ' = '))
      const entry = parsed['Desktop Entry']

      if (entry.NoDisplay === 'true' || !entry.Name || !entry.Exec)
        return null

      const iconPath = await this.resolveLinuxIcon(entry.Icon)
      const icon = iconPath ? await this.iconExtractor.extractIcon(iconPath) : ''

      // Extract keywords for better search
      const keywords = entry.Keywords 
        ? entry.Keywords.split(';').filter(Boolean).map(k => k.trim())
        : []

      // Extract categories
      const categories = entry.Categories
        ? entry.Categories.split(';').filter(Boolean).map(c => c.trim())
        : []

      const app = {
        path: filePath,
        name: entry.Name,
        displayName: entry.Name,
        description: entry.Comment || entry.GenericName || '',
        keywords,
        categories,
        icon,
        lastUpdated: fs.statSync(filePath).mtimeMs,
        applicationType: 'desktop',
      }
      
      this.applications.push(app)
      return app
    }
    catch (error) {
      console.warn('Desktop file error:', error.message)
      return null
    }
  }

  async indexFlatpakApps() {
    try {
      // Get detailed app info including icons
      const { stdout: listOutput } = await execPromise(
        'flatpak list --app --columns=application,name,version',
      )
      const lines = listOutput.split('\n').filter(Boolean)

      for (const line of lines) {
        const [appId, name] = line.split('\t')
        if (!appId || !name)
          continue

        // Get additional metadata
        try {
          const { stdout: infoOutput } = await execPromise(`flatpak info ${appId}`)
          const iconName = this.extractFlatpakIcon(infoOutput)

          // Try to find the icon
          let icon = ''
          if (iconName) {
            const iconPath = await this.resolveFlatpakIcon(appId, iconName)
            if (iconPath) {
              icon = await this.iconExtractor.extractIcon(iconPath)
            }
          }

          const app = {
            path: appId, // Store just the appId for launching
            name,
            displayName: name,
            icon,
            lastUpdated: Date.now(),
            applicationType: 'flatpak',
          }

          this.applications.push(app)
        }
        catch (error) {
          console.warn(`Error getting Flatpak info for ${appId}:`, error.message)
        }
      }
    }
    catch (error) {
      console.warn('Flatpak list error:', error.message)
    }
  }

  /**
   * Index Snap applications using snap list command
   * This is more reliable than scanning the desktop files directory
   */
  async indexSnapApps() {
    try {
      const { stdout } = await execPromise('snap list 2>/dev/null')
      const lines = stdout.split('\n').slice(1).filter(Boolean) // Skip header line

      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length < 2) continue

        const snapName = parts[0]
        
        // Skip system snaps
        if (['snapd', 'core', 'core18', 'core20', 'core22', 'gnome-3-38-2004', 'gtk-common-themes'].includes(snapName)) {
          continue
        }

        // Check if we already have this app from desktop files
        const existingApp = this.applications.find(a => 
          a.name.toLowerCase() === snapName.toLowerCase() || 
          a.path.includes(snapName)
        )
        if (existingApp) continue

        // Try to get snap info for icon
        try {
          const { stdout: infoOutput } = await execPromise(`snap info ${snapName} 2>/dev/null`)
          const nameMatch = infoOutput.match(/name:\s+(.+)/i)
          const summaryMatch = infoOutput.match(/summary:\s+(.+)/i)
          
          const displayName = nameMatch ? nameMatch[1].trim() : snapName
          const description = summaryMatch ? summaryMatch[1].trim() : ''

          // Try to find icon
          let icon = ''
          const iconPaths = [
            `/snap/${snapName}/current/meta/gui/icon.png`,
            `/snap/${snapName}/current/meta/gui/icon.svg`,
            path.join(process.env.HOME, 'snap', snapName, 'current', 'meta', 'gui', 'icon.png'),
          ]

          for (const iconPath of iconPaths) {
            try {
              await accessAsync(iconPath, fs.constants.R_OK)
              icon = await this.iconExtractor.extractIcon(iconPath)
              if (icon) break
            } catch {
              continue
            }
          }

          const app = {
            path: `snap://${snapName}`,
            name: displayName,
            displayName,
            description,
            icon,
            lastUpdated: Date.now(),
            applicationType: 'snap',
          }

          this.applications.push(app)
        }
        catch (error) {
          console.warn(`Error getting Snap info for ${snapName}:`, error.message)
        }
      }
    }
    catch (error) {
      console.warn('Snap list error:', error.message)
    }
  }

  /**
   * Index AppImage files from common locations
   */
  async indexAppImages() {
    const appImagePaths = [
      path.join(process.env.HOME, 'Applications'),
      path.join(process.env.HOME, '.local', 'bin'),
      path.join(process.env.HOME, 'AppImages'),
      '/opt',
    ]

    for (const searchPath of appImagePaths) {
      try {
        await accessAsync(searchPath, fs.constants.R_OK)
        await this.findAppImages(searchPath)
      }
      catch {
        // Directory doesn't exist or not accessible
        continue
      }
    }
  }

  /**
   * Find and process AppImage files in a directory
   */
  async findAppImages(dir, depth = 0) {
    if (depth > 2) return // Limit recursion depth

    try {
      const entries = await readdirAsync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await this.findAppImages(fullPath, depth + 1)
        }
        else if (entry.name.toLowerCase().endsWith('.appimage')) {
          await this.processAppImage(fullPath)
        }
      }
    }
    catch (error) {
      console.warn(`Error scanning ${dir} for AppImages:`, error.message)
    }
  }

  /**
   * Process a single AppImage file
   */
  async processAppImage(filePath) {
    try {
      // Check if executable
      await accessAsync(filePath, fs.constants.X_OK)

      // Get file name without extension as app name
      const fileName = path.basename(filePath)
      const name = fileName.replace(/[-_.]appimage$/i, '')
        .replace(/-/g, ' ')
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
        .trim()

      // Try to extract icon from AppImage (requires appimage-extract or similar)
      let icon = ''
      try {
        // Try to get icon using gio
        const { stdout } = await execPromise(`gio info -a standard::icon "${filePath}" 2>/dev/null`)
        const iconMatch = stdout.match(/standard::icon:\s+(\S+)/i)
        if (iconMatch) {
          const iconPath = await this.resolveLinuxIcon(iconMatch[1])
          if (iconPath) {
            icon = await this.iconExtractor.extractIcon(iconPath)
          }
        }
      }
      catch {
        // Icon extraction failed, use fallback
      }

      const stats = await statAsync(filePath)

      const app = {
        path: filePath,
        name,
        displayName: name,
        description: 'AppImage application',
        icon,
        lastUpdated: stats.mtimeMs,
        applicationType: 'appimage',
      }

      this.applications.push(app)
    }
    catch (error) {
      console.warn(`Error processing AppImage ${filePath}:`, error.message)
    }
  }

  extractFlatpakIcon(infoOutput) {
    const iconMatch = infoOutput.match(/Icon: (.+)/i)
    return iconMatch ? iconMatch[1].trim() : null
  }

  async resolveFlatpakIcon(appId, iconName) {
    // Check common Flatpak icon locations
    const iconPaths = [
      `/var/lib/flatpak/app/${appId}/current/active/files/share/icons`,
      `/var/lib/flatpak/app/${appId}/current/active/export/share/icons`,
      path.join(
        process.env.HOME,
        '.local/share/flatpak/app',
        appId,
        'current/active/files/share/icons',
      ),
      path.join(
        process.env.HOME,
        '.local/share/flatpak/app',
        appId,
        'current/active/export/share/icons',
      ),
    ]

    for (const iconPath of iconPaths) {
      try {
        const iconFile = await this.findIconRecursively(iconPath, iconName)
        if (iconFile)
          return iconFile
      }
      catch (error) {
        continue
      }
    }

    // Fallback to system icon resolution
    return await this.resolveLinuxIcon(iconName)
  }

  async findIconRecursively(directory, iconName, depth = 0) {
    // Limit recursion depth to avoid excessive searching
    if (depth > 5)
      return null

    try {
      const files = await readdirAsync(directory, { withFileTypes: true })

      for (const file of files) {
        const fullPath = path.join(directory, file.name)

        if (file.isDirectory()) {
          // Skip node_modules, .git and other common deep directories
          if (['node_modules', '.git', '.svn', '.hg'].includes(file.name)) {
            continue
          }

          const found = await this.findIconRecursively(fullPath, iconName, depth + 1)
          if (found)
            return found
        }
        else {
          // Check if the filename matches our icon pattern
          const fileBaseName = path.parse(file.name).name
          const fileExt = path.parse(file.name).ext.toLowerCase()

          if (fileBaseName === iconName && this.iconFormats.includes(fileExt)) {
            return fullPath
          }
        }
      }
    }
    catch (error) {
      return null
    }

    return null
  }

  async resolveLinuxIcon(iconName) {
    if (!iconName)
      return null

    // If it's already a full path and exists, return it
    if (iconName.startsWith('/')) {
      try {
        await accessAsync(iconName, fs.constants.R_OK)
        return iconName
      }
      catch {
        // Continue to other resolution methods if the path doesn't exist
      }
    }

    // Standard icon locations ordered by priority
    const iconPaths = [
      '/usr/share/icons',
      '/usr/share/pixmaps',
      '/usr/local/share/icons',
      path.join(process.env.HOME, '.local/share/icons'),
      path.join(process.env.HOME, '.icons'),
    ]

    // Check current theme first - try to detect from environment
    try {
      const { stdout } = await execPromise('gsettings get org.gnome.desktop.interface icon-theme 2>/dev/null || echo "hicolor"')
      const currentTheme = stdout.trim().replace(/'/g, '')
      if (currentTheme && currentTheme !== 'hicolor') {
        this.iconThemes.unshift(currentTheme)
      }
    }
    catch {
      // If gsettings fails, keep the default theme order
    }

    // Try each theme and size
    for (const iconPath of iconPaths) {
      // First, check directly in pixmaps or other direct locations
      if (iconPath.includes('pixmaps')) {
        for (const format of this.iconFormats) {
          const directPath = path.join(iconPath, `${iconName}${format}`)
          try {
            await accessAsync(directPath, fs.constants.R_OK)
            return directPath
          }
          catch {
            // Continue to next format if not found
          }
        }
      }

      // Then check through theme hierarchy
      for (const theme of this.iconThemes) {
        const themeDir = path.join(iconPath, theme)

        try {
          await accessAsync(themeDir, fs.constants.R_OK)
        }
        catch {
          continue // Skip if theme directory doesn't exist
        }

        // Try in each icon category
        for (const category of ['apps', 'devices', 'mimetypes', 'places']) {
          for (const size of this.iconSizes) {
            for (const format of this.iconFormats) {
              const iconFile = path.join(themeDir, size, category, `${iconName}${format}`)
              try {
                await accessAsync(iconFile, fs.constants.R_OK)
                return iconFile
              }
              catch {
                // Continue to next format if not found
              }
            }

            // Also try size/actions and size/status directories
            for (const altCategory of ['actions', 'status']) {
              for (const format of this.iconFormats) {
                const iconFile = path.join(themeDir, size, altCategory, `${iconName}${format}`)
                try {
                  await accessAsync(iconFile, fs.constants.R_OK)
                  return iconFile
                }
                catch {
                  // Continue if not found
                }
              }
            }
          }
        }
      }
    }

    // Try a recursive search as last resort
    for (const iconPath of iconPaths) {
      try {
        const iconFile = await this.findIconRecursively(iconPath, iconName)
        if (iconFile)
          return iconFile
      }
      catch {
        continue
      }
    }

    return null
  }
}

export { LinuxAppIndexing }
