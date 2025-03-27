import { defineStore } from 'pinia'
import { ref } from 'vue'
import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'

// This store is used to manage the application settings and serves as bridge to the electron settings API
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref({
    darkMode: false,
    accentColor: '#1167b1',
    includedSearchTypes: [
      { name: 'files', enabled: true },
      { name: 'apps', enabled: true },
      { name: 'emoji', enabled: true },
    ],
    autostart: false,
    searchShortcut: 'CommandOrControl+Space',
    showFavorites: true,
    windowDisplay: 'cursor', // Add new setting with default value
  })

  const initialize = async () => {
    settings.value = await window.api.invoke(IPC_CHANNELS.SETTINGS_GET_ALL)
    window.api.on(IPC_CHANNELS.SETTINGS_CHANGED, ({ key, value }) => {
      // Handle nested paths using lodash-style path notation
      const keys = key.split('.')
      let current = settings.value
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]]
      }
      current[keys[keys.length - 1]] = value
    })
  }

  const updateSetting = async (key, value) => {
    // For nested updates, we need to update the entire parent object
    if (key === 'includedSearchTypes') {
      settings.value.includedSearchTypes = value
    }
    else {
      settings.value[key] = value
    }
    await window.api.invoke(IPC_CHANNELS.SETTINGS_SET, key, value)
  }

  return {
    settings,
    initialize,
    updateSetting,
  }
})
