import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'

/**
 * Sets a value in a nested object structure
 * @param {Object} obj - The object to modify
 * @param {string} path - Dot-notated path to the property
 * @param {any} value - The value to set
 * @returns {Object} - The modified object
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
 * @param {Object} obj - The object to query
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
}

// This store is used to manage the application settings and serves as bridge to the electron settings API
export const useSettingsStore = defineStore('settings', () => {
  // Use default settings as initial state
  const settings = ref({ ...DEFAULT_SETTINGS })

  // Create a batch update queue to reduce IPC calls
  let updateQueue = new Map()
  let updateTimer = null
  
  /**
   * Process batched settings updates
   */
  const processBatchUpdates = () => {
    if (updateQueue.size === 0) return
    
    const updates = Object.fromEntries(updateQueue)
    updateQueue.clear()
    
    // Send all updates in a single IPC call
    window.api.invoke(IPC_CHANNELS.SETTINGS_BATCH_UPDATE, updates)
  }

  /**
   * Initialize settings from main process
   */
  const initialize = async () => {
    try {
      const storedSettings = await window.api.invoke(IPC_CHANNELS.SETTINGS_GET_ALL)
      
      // Merge with defaults to ensure all properties exist
      settings.value = { ...DEFAULT_SETTINGS, ...storedSettings }
      
      // Listen for settings changes from other windows
      window.api.on(IPC_CHANNELS.SETTINGS_CHANGED, ({ key, value }) => {
        // Handle nested paths with the utility function
        setNestedValue(settings.value, key, value)
      })
    } catch (error) {
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
    try {
      // Update local state immediately for responsive UI
      if (key.includes('.')) {
        // For nested properties, use utility function
        setNestedValue(settings.value, key, value)
      } else {
        // For top-level properties
        settings.value[key] = value
      }
      
      // Add to batch update queue
      updateQueue.set(key, value)
      
      // Debounce updates to reduce IPC calls
      clearTimeout(updateTimer)
      updateTimer = setTimeout(processBatchUpdates, 300)
      
      // For immediate feedback when needed
      return window.api.invoke(IPC_CHANNELS.SETTINGS_SET, key, value)
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error)
      throw error // Propagate error to caller
    }
  }

  /**
   * Update multiple settings at once
   * @param {Object} updates - Object with key-value pairs to update
   * @returns {Promise} - Result of the operation
   */
  const updateMultipleSettings = async (updates) => {
    try {
      // Update local state immediately
      for (const [key, value] of Object.entries(updates)) {
        if (key.includes('.')) {
          setNestedValue(settings.value, key, value)
        } else {
          settings.value[key] = value
        }
        updateQueue.set(key, value)
      }
      
      // Process updates with a shorter delay for multiple updates
      clearTimeout(updateTimer)
      updateTimer = setTimeout(processBatchUpdates, 100)
      
      return { success: true }
    } catch (error) {
      console.error('Failed to update multiple settings:', error)
      throw error
    }
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

  /**
   * Reset settings to defaults
   * @returns {Promise} - Result of the operation
   */
  const resetToDefaults = async () => {
    try {
      settings.value = { ...DEFAULT_SETTINGS }
      return window.api.invoke(IPC_CHANNELS.SETTINGS_RESET)
    } catch (error) {
      console.error('Failed to reset settings:', error)
      throw error
    }
  }

  return {
    settings,
    initialize,
    updateSetting,
    updateMultipleSettings,
    getSetting,
    resetToDefaults,
  }
})
