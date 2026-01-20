import { EventEmitter } from 'node:events'
import { app } from 'electron'
import ElectronStore from 'electron-store'

/**
 * AppSettings: Central Settings Management System
 *
 * This class manages application settings using a persistent store and broadcasts changes
 * to all windows through the EventEmitter system.
 *
 * Architecture:
 * 1. Settings are stored in electron-store under two main branches:
 *    - watchedPaths: Array of monitored directories
 *    - preferences: Object containing user preferences
 *
 * 2. Extending Settings:
 *    a) Add new setting to defaults in constructor
 *    b) Access using generic getSetting/setSetting methods
 *    c) Settings changes are automatically broadcasted
 *
 * Example adding new setting:
 * ```
 * // 1. Add to defaults in constructor
 * defaults: {
 *   preferences: {
 *     myNewSetting: 'default-value'
 *   }
 * }
 *
 * // 2. Use in your component
 * const value = await window.api.invoke(IPC_CHANNELS.SETTINGS_GET, 'myNewSetting')
 * await window.api.invoke(IPC_CHANNELS.SETTINGS_SET, 'myNewSetting', newValue)
 * ```
 */

class AppSettingsStore extends EventEmitter {
  constructor() {
    super()
    this.store = new ElectronStore({
      name: 'seeksy-settings',
      defaults: {
        version: app.getVersion(),
        preferences: {
          darkMode: false,
          accentColor: '#1167b1',
          uiScale: 100, // UI scale percentage (50-150)
          includedSearchTypes: [
            { name: 'files', enabled: true },
            { name: 'apps', enabled: true },
            { name: 'emoji', enabled: true },
          ],
          searchShortcut: 'CommandOrControl+Space',
          showFavorites: true,
          windowDisplay: 'cursor', // Supports cursor and primary
        },
      },
    })

    this.migrateIfNeeded()
  }

  migrateIfNeeded() {
    const currentVersion = this.store.get('version')
    const appVersion = app.getVersion()

    if (currentVersion !== appVersion) {
      // Perform migrations here when needed
      // Example:
      // if (currentVersion === '1.0.0') {
      //   this.migrateTo110()
      // }

      // Update the version after migration
      this.store.set('version', appVersion)
    }
  }

  // Core settings methods
  getSetting(key) {
    return this.store.get(`preferences.${key}`)
  }

  setSetting(key, value) {
    // For array settings like includedSearchTypes, we need to set the entire array
    if (key === 'includedSearchTypes') {
      this.store.set('preferences.includedSearchTypes', value)
    }
    else {
      this.store.set(`preferences.${key}`, value)
    }
    this.emit('setting-changed', { key, value })
    return value
  }

  getAllPreferences() {
    return this.store.get('preferences')
  }

  reset() {
    this.store.clear()
    const defaults = {
      preferences: {
        darkMode: false,
        accentColor: '#1167b1',
        uiScale: 100,
        includedSearchTypes: [
          { name: 'files', enabled: true },
          { name: 'apps', enabled: true },
          { name: 'emoji', enabled: true },
        ],
        searchShortcut: 'CommandOrControl+Space',
        showFavorites: true,
        windowDisplay: 'cursor',
      },
    }
    Object.entries(defaults).forEach(([key, value]) => this.store.set(key, value))
    this.emit('settings-reset')
    return true
  }
}

export const appSettings = new AppSettingsStore()
