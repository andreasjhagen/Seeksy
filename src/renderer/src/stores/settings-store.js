import { defineStore } from 'pinia'
import { ref } from 'vue'
import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'
import { getInitialLanguage, setLanguage } from '../locales'

/**
 * Sets a value in a nested object structure
 * @param {object} obj - The object to modify
 * @param {string} path - Dot-notated path to the property
 * @param {any} value - The value to set
 * @returns {object} - The modified object
 */
function setNestedValue(obj, path, value) {
  if (!path || typeof path !== 'string') {
    console.error('Invalid path provided to setNestedValue:', path)
    return obj
  }

  const keys = path.split('.')
  const lastKey = keys.pop()
  let current = obj

  // Navigate to the nested object, creating the path if it doesn't exist
  for (const key of keys) {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key]
  }

  // Set the value
  current[lastKey] = value
  return obj
}

/**
 * Gets a value from a nested object structure
 * @param {object} obj - The object to query
 * @param {string} path - Dot-notated path to the property
 * @param {any} defaultValue - Default value if path doesn't exist
 * @returns {any} - The value at the path or the default value
 */
function getNestedValue(obj, path, defaultValue = undefined) {
  if (!path || typeof path !== 'string') {
    console.error('Invalid path provided to getNestedValue:', path)
    return defaultValue
  }

  const keys = path.split('.')
  let current = obj

  for (const key of keys) {
    if (current === undefined || current === null || !Object.prototype.hasOwnProperty.call(current, key)) {
      return defaultValue
    }
    current = current[key]
  }

  return current
}

// Default settings configuration
const DEFAULT_SETTINGS = {
  darkMode: false,
  accentColor: '#1167b1',
  uiScale: 100,
  language: null, // null means auto-detect from OS
  includedSearchTypes: [
    { name: 'files', enabled: true },
    { name: 'apps', enabled: true },
    { name: 'emoji', enabled: true },
  ],
  collapsedSections: [],
  autostart: false,
  searchShortcut: 'CommandOrControl+Space',
  showFavorites: true,
  windowDisplay: 'cursor',
  sectionOrder: [],
  onboardingCompleted: false,
}

// This store is used to manage the application settings and serves as bridge to the electron settings API
export const useSettingsStore = defineStore('settings', () => {
  // Use default settings as initial state
  const settings = ref({ ...DEFAULT_SETTINGS })
  const lastError = ref('')

  /**
   * Initialize settings from main process
   */
  const initialize = async () => {
    try {
      const storedSettings = await window.api.invoke(IPC_CHANNELS.SETTINGS_GET_ALL)

      // Merge with defaults to ensure all properties exist
      settings.value = { ...DEFAULT_SETTINGS, ...storedSettings }

      // Initialize language - auto-detect if not set
      const languageToUse = getInitialLanguage(settings.value.language)
      setLanguage(languageToUse)

      // If language was auto-detected (null in settings), save the detected language
      if (settings.value.language === null) {
        settings.value.language = languageToUse
        // Don't persist auto-detected language to allow OS changes to take effect
      }

      // Listen for settings changes from other windows
      window.api.on(IPC_CHANNELS.SETTINGS_CHANGED, ({ key, value }) => {
        // Handle nested paths with the utility function
        setNestedValue(settings.value, key, value)

        // Update language when changed from another window
        if (key === 'language' && value) {
          setLanguage(value)
        }
      })
    }
    catch (error) {
      console.error('Failed to initialize settings:', error)
      // Fall back to defaults if initialization fails
      settings.value = { ...DEFAULT_SETTINGS }
    }
  }

  /**
   * Update a single setting value
   * @param {string} key - Setting key (supports dot notation for nested properties)
   * @param {any} value - New value
   * @returns {Promise} - Result of the operation
   */
  const updateSetting = async (key, value) => {
    const previousValue = structuredClone(getNestedValue(settings.value, key))
    lastError.value = ''
    try {
      // Update local state immediately for responsive UI
      if (key.includes('.')) {
        // For nested properties, use utility function
        setNestedValue(settings.value, key, value)
      }
      else {
        // For top-level properties
        settings.value[key] = value
      }

      const result = await window.api.invoke(IPC_CHANNELS.SETTINGS_SET, key, value)
      if (!result?.success) {
        throw new Error(result?.error || `Unable to save setting "${key}"`)
      }
      return result
    }
    catch (error) {
      setNestedValue(settings.value, key, previousValue)
      console.error(`Failed to update setting ${key}:`, error)
      lastError.value = error.message || `Unable to save setting "${key}"`
      return { success: false, error: lastError.value }
    }
  }

  /**
   * Update multiple settings at once
   * @param {object} updates - Object with key-value pairs to update
   * @returns {Promise} - Result of the operation
   */
  const updateMultipleSettings = async (updates) => {
    const results = await Promise.all(
      Object.entries(updates).map(([key, value]) => updateSetting(key, value)),
    )
    return { success: results.every(result => result.success) }
  }

  /**
   * Get a setting value, supporting nested paths
   * @param {string} key - Setting key (supports dot notation)
   * @param {any} defaultValue - Default value if setting doesn't exist
   * @returns {any} - The setting value
   */
  const getSetting = (key, defaultValue) => {
    if (key.includes('.')) {
      return getNestedValue(settings.value, key, defaultValue)
    }
    return settings.value[key] !== undefined ? settings.value[key] : defaultValue
  }

  return {
    settings,
    lastError,
    initialize,
    updateSetting,
    updateMultipleSettings,
    getSetting,
  }
})
