<script setup>
import { IPC_CHANNELS } from '../../../../../../main/ipc/ipcChannels'
import { useSettingsStore } from '../../../../stores/settings-store'
import ToggleButton from '../../../common/ToggleButton.vue'
import ShortcutInput from './ShortcutInput.vue'
import WindowDisplaySettings from './WindowDisplaySettings.vue'

const settingsStore = useSettingsStore()
const settings = settingsStore.settings

const updateSetting = (key, value) => settingsStore.updateSetting(key, value)

// Constants
const MODIFIER_KEYS = ['Control', 'Meta', 'Alt', 'Shift', 'Command']

// Settings handlers
const toggleDarkMode = () => settingsStore.updateSetting('darkMode', !settings.darkMode)
const toggleAutostart = () => settingsStore.updateSetting('autostart', !settings.autostart)

// Shortcut handling
function createShortcutFromEvent(e) {
  const keys = []
  if (e.ctrlKey)
    keys.push('Control')
  if (e.metaKey)
    keys.push('Command')
  if (e.altKey)
    keys.push('Alt')
  if (e.shiftKey)
    keys.push('Shift')

  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
  if (!MODIFIER_KEYS.includes(key))
    keys.push(key)

  return keys.join('+')
}

async function updateShortcut(e) {
  const shortcut = createShortcutFromEvent(e)
  if (shortcut) {
    const isValid = await window.api.invoke(IPC_CHANNELS.VALIDATE_GLOBAL_SHORTCUT, shortcut)
    if (isValid)
      await updateSetting('searchShortcut', shortcut)
  }
}

const restoreDefaultShortcut = () => updateSetting('searchShortcut', 'CommandOrControl+Space')

//  helper function for capitalization
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

// Add toggle handler for search types
function toggleSearchType(typeName) {
  const updatedTypes = settings.includedSearchTypes.map(type => ({
    ...type,
    enabled: type.name === typeName ? !type.enabled : type.enabled,
  }))
  settingsStore.updateSetting('includedSearchTypes', updatedTypes)
}

// Predefined colors
const predefinedColors = [
  { name: 'Red', value: '#7A0000' },
  { name: 'Orange', value: '#d9822b' },
  { name: 'Green', value: '#305830' },
  { name: 'Teal', value: '#2b7d9a' },
  { name: 'Blue', value: '#1167b1' },
  { name: 'Purple', value: '#472483' },
  { name: 'Pink', value: '#e769a1' },
]
</script>

<template>
  <div class="p-6 space-y-8 bg-white shadow-xs rounded-xl dark:bg-gray-800">
    <!-- UI Customization -->
    <div class="space-y-6">
      <h2
        class="pb-2 text-lg font-medium text-gray-900 border-b border-gray-200 dark:text-gray-100 dark:border-gray-700"
      >
        UI Customization
      </h2>

      <ToggleButton
        title="Dark Mode"
        description="Switch between light and dark theme"
        :value="settings.darkMode"
        @toggle="toggleDarkMode"
      />

      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-gray-900 dark:text-gray-100">
            Accent Color
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Choose your preferred accent color
          </p>
        </div>
        <div class="flex gap-2">
          <button
            v-for="color in predefinedColors"
            :key="color.value"
            class="w-8 h-8 transition-all border-2 border-transparent rounded-full cursor-pointer"
            :class="{ 'border-black dark:border-white': settings.accentColor === color.value }"
            :style="{ backgroundColor: color.value }"
            @click="updateSetting('accentColor', color.value)"
          />
        </div>
      </div>
    </div>

    <!-- Search Options -->
    <div class="space-y-6">
      <h2
        class="pb-2 text-lg font-medium text-gray-900 border-b border-gray-200 dark:text-gray-100 dark:border-gray-700"
      >
        Search Type Options
      </h2>

      <ToggleButton
        title="Show Favorites"
        description="Show favorite items when search is empty"
        :value="settings.showFavorites"
        @toggle="() => updateSetting('showFavorites', !settings.showFavorites)"
      />

      <div class="space-y-4">
        <div class="space-y-2">
          <ToggleButton
            v-for="type in settings.includedSearchTypes"
            :key="type.name"
            :title="capitalizeFirstLetter(type.name)"
            :description="`Include ${type.name} in search results`"
            :value="type.enabled"
            @toggle="() => toggleSearchType(type.name)"
          />
        </div>
      </div>
    </div>

    <!-- Window Settings -->
    <div class="space-y-6">
      <h2
        class="pb-2 text-lg font-medium text-gray-900 border-b border-gray-200 dark:text-gray-100 dark:border-gray-700"
      >
        Window Settings
      </h2>

      <WindowDisplaySettings
        :value="settings.windowDisplay"
        @update="updateSetting"
      />
    </div>

    <!-- System Settings -->
    <div class="space-y-6">
      <h2
        class="pb-2 text-lg font-medium text-gray-900 border-b border-gray-200 dark:text-gray-100 dark:border-gray-700"
      >
        System Settings
      </h2>

      <ToggleButton
        title="Start on Boot"
        description="Automatically start application when you log in"
        :value="settings.autostart"
        @toggle="toggleAutostart"
      />

      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-gray-900 dark:text-gray-100">
            Search Shortcut
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Global keyboard shortcut to open search
          </p>
        </div>
        <ShortcutInput
          :value="settings.searchShortcut"
          @update="updateShortcut"
          @reset="restoreDefaultShortcut"
        />
      </div>
    </div>
  </div>
</template>
