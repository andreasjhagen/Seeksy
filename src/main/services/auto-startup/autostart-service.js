import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

/**
 * Get the correct executable path for Linux autostart
 * Handles AppImage, .deb installed apps, and development mode
 * @returns {string} Path to executable
 */
function getLinuxExecutablePath() {
  // For AppImage, use the APPIMAGE environment variable
  if (process.env.APPIMAGE) {
    return process.env.APPIMAGE
  }

  // For .deb or other installed versions, the exe path should be correct
  const exePath = app.getPath('exe')

  // Check if we're in development (path contains node_modules)
  if (exePath.includes('node_modules')) {
    // In development, warn and return a placeholder
    console.warn('Auto-start enabled in development mode - will not work correctly until installed')
    // Return the expected installed path for .deb packages
    return '/usr/bin/seeksy'
  }

  return exePath
}

/**
 * Get the Linux autostart directory (XDG compliant)
 * @returns {string} Path to autostart directory
 */
function getLinuxAutoStartDir() {
  // XDG spec: ~/.config/autostart/
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(configHome, 'autostart')
}

async function updateAutoStartStatus(enable) {
  try {
    if (process.platform === 'win32') {
      await app.setLoginItemSettings({
        openAtLogin: enable,
        openAsHidden: enable,
        name: 'Seeksy',
        serviceName: 'Seeksy',
      })
    }
    else if (process.platform === 'linux') {
      const autoStartDir = getLinuxAutoStartDir()
      const desktopEntry = path.join(autoStartDir, 'seeksy.desktop')
      const execPath = getLinuxExecutablePath()

      if (enable) {
        const desktopFile = `[Desktop Entry]
Type=Application
Version=1.0
Name=Seeksy
Comment=Seeksy - Quick file and app launcher
Exec="${execPath}" --hidden
StartupNotify=false
Terminal=false
Categories=Utility;
X-GNOME-Autostart-enabled=true`

        await fs.promises.mkdir(autoStartDir, { recursive: true })
        await fs.promises.writeFile(desktopEntry, desktopFile)
        console.log(`Created autostart entry at: ${desktopEntry}`)
        console.log(`Exec path: ${execPath}`)
      }
      else {
        try {
          await fs.promises.unlink(desktopEntry)
          console.log(`Removed autostart entry: ${desktopEntry}`)
        }
        catch (err) {
          if (err.code !== 'ENOENT')
            throw err
        }
      }
    }

    console.log(`Autostart ${enable ? 'enabled' : 'disabled'} successfully`)
    const currentStatus = await getAutoStartStatus()
    console.log('Current autostart status:', currentStatus.enabled)
    return { success: true }
  }
  catch (error) {
    console.error('Failed to set auto-start:', error)
    return { success: false, error: error.message }
  }
}

async function getAutoStartStatus() {
  try {
    if (process.platform === 'win32') {
      const settings = app.getLoginItemSettings()
      return { enabled: settings.openAtLogin }
    }
    else if (process.platform === 'linux') {
      const desktopEntry = path.join(getLinuxAutoStartDir(), 'seeksy.desktop')
      return { enabled: fs.existsSync(desktopEntry) }
    }
    return { enabled: false }
  }
  catch (error) {
    console.error('Failed to get auto-start status:', error)
    return { enabled: false, error: error.message }
  }
}

export { getAutoStartStatus, updateAutoStartStatus }
