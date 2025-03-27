import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

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
      const autoStartDir = path.join(app.getPath('appData'), 'autostart')
      const desktopEntry = path.join(autoStartDir, 'seeksy.desktop')

      if (enable) {
        const desktopFile = `[Desktop Entry]
Type=Application
Version=1.0
Name=Seeksy
Comment=Seeksy Launcher
Path=${app.getPath('exe')}
Exec="${app.getPath('exe')}"
Terminal=false
Categories=Utility;`

        await fs.promises.mkdir(autoStartDir, { recursive: true })
        await fs.promises.writeFile(desktopEntry, desktopFile)
      }
      else {
        try {
          await fs.promises.unlink(desktopEntry)
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
      const desktopEntry = path.join(app.getPath('appData'), 'autostart', 'seeksy.desktop')
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
