/**
 * SettingsHandler: Window Settings Synchronization
 *
 * Manages bidirectional settings synchronization between the main process
 * and renderer windows. Automatically broadcasts settings changes to all
 * registered windows.
 *
 * Usage:
 * 1. In renderer process:
 *    - Get setting: await window.api.invoke(IPC.BACKEND.SETTINGS_GET, 'settingKey')
 *    - Set setting: await window.api.invoke(IPC.BACKEND.SETTINGS_SET, 'settingKey', value)
 *    - Listen for changes: window.api.on(IPC.BACKEND.SETTINGS_CHANGED, ({key, value}) => {})
 *
 * 2. Handling new settings:
 *    - No changes needed here - the handler automatically manages all preferences
 *    - Just add new settings to AppSettings defaults
 */

import { getAutoStartStatus, updateAutoStartStatus } from '../../services/auto-startup/autostart-service.js'
import { appSettings } from '../../services/electron-store/AppSettingsStore.js'
import { BaseHandler } from '../BaseHandler.js'
import { IPC } from '../ipcChannels.js'

export class SettingsHandler extends BaseHandler {
  constructor(mainWindow, settingsWindow) {
    super()
    if (!mainWindow || !settingsWindow) {
      throw new Error('SettingsHandler requires valid window instances')
    }

    this.windows = [mainWindow, settingsWindow]

    this.registerHandlers({
      [IPC.BACKEND.SETTINGS_GET]: this.handleSettingGet.bind(this),
      [IPC.BACKEND.SETTINGS_SET]: this.handleSettingSet.bind(this),
      [IPC.BACKEND.SETTINGS_GET_ALL]: this.handleGetAllSettings.bind(this),
      [IPC.SYSTEM.SET_AUTO_START]: this.handleSetAutoStart.bind(this),
      [IPC.SYSTEM.GET_AUTO_START]: this.handleGetAutoStart.bind(this),
    })

    // Subscribe to setting changes to broadcast them
    appSettings.on('setting-changed', this.broadcastSettingChange.bind(this))

    // Initialize settings by broadcasting all current preferences
    this.initializeSettings()
  }

  async handleSettingGet(_, key) {
    try {
      return appSettings.getSetting(key)
    }
    catch (error) {
      console.error(`Error getting setting ${key}:`, error)
      return { success: false, error: error.message }
    }
  }

  async handleSettingSet(_, key, value) {
    try {
      const result = await appSettings.setSetting(key, value)

      // Special handling for autostart feature
      if (key === 'autostart') {
        await updateAutoStartStatus(value)
      }

      return { success: true, value: result }
    }
    catch (error) {
      console.error(`Error setting ${key} to ${value}:`, error)
      return { success: false, error: error.message }
    }
  }

  async handleGetAllSettings() {
    try {
      const prefs = appSettings.getAllPreferences()
      const autostart = await getAutoStartStatus()
      return { ...prefs, autostart: autostart.enabled }
    }
    catch (error) {
      console.error('Error getting all settings:', error)
      return { success: false, error: error.message }
    }
  }

  async handleSetAutoStart(_, enable) {
    try {
      const result = await updateAutoStartStatus(enable)
      return { success: true, result }
    }
    catch (error) {
      console.error('Error setting auto-start:', error)
      return { success: false, error: error.message }
    }
  }

  async handleGetAutoStart() {
    try {
      return getAutoStartStatus()
    }
    catch (error) {
      console.error('Error getting auto-start status:', error)
      return { success: false, error: error.message, enabled: false }
    }
  }

  initializeSettings() {
    const preferences = appSettings.getAllPreferences()
    Object.entries(preferences).forEach(([key, value]) => {
      this.broadcastSettingChange({ key, value })
    })
  }

  broadcastSettingChange({ key, value }) {
    const payload = { key, value }
    this.windows.forEach((window) => {
      if (window?.webContents) {
        window.webContents.send(IPC.BACKEND.SETTINGS_CHANGED, payload)
      }
    })
  }
}

export default function setupSettingsHandlers(mainWindow, settingsWindow) {
  return new SettingsHandler(mainWindow, settingsWindow)
}
