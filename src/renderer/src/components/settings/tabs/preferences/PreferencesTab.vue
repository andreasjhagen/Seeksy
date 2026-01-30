<script setup>
import { useI18n } from 'vue-i18n'
import { IPC_CHANNELS } from '../../../../../../main/ipc/ipcChannels'
import { setLanguage, SUPPORTED_LANGUAGES } from '../../../../locales'
import { useSettingsStore } from '../../../../stores/settings-store'
import ToggleButton from '../../../common/ToggleButton.vue'
import ShortcutInput from './ShortcutInput.vue'
import WindowDisplaySettings from './WindowDisplaySettings.vue'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const settings = settingsStore.settings

const updateSetting = (key, value) => settingsStore.updateSetting(key, value)

// Constants
const MODIFIER_KEYS = ['Control', 'Meta', 'Alt', 'Shift', 'Command']

// Settings handlers
const toggleDarkMode = () => settingsStore.updateSetting('darkMode', !settings.darkMode)
const toggleAutostart = () => settingsStore.updateSetting('autostart', !settings.autostart)

// UI Scale handler with debounce for smooth slider interaction
let uiScaleTimer = null
function updateUIScale(value) {
  const scale = Number.parseInt(value, 10)
  // Update local state immediately for responsive UI
  settings.uiScale = scale
  // Debounce the actual setting update
  clearTimeout(uiScaleTimer)
  uiScaleTimer = setTimeout(() => {
    settingsStore.updateSetting('uiScale', scale)
  }, 150)
}

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

// Language change handler
function changeLanguage(langCode) {
  setLanguage(langCode)
  settingsStore.updateSetting('language', langCode)
}
</script>

<template>
  <div class="p-6 space-y-8 bg-white shadow-xs rounded-xl dark:bg-gray-800">
    <!-- UI Customization -->
    <div class="space-y-6">
      <h2
        class="pb-2 text-lg font-medium text-gray-900 border-b border-gray-200 dark:text-gray-100 dark:border-gray-700"
      >
        {{ t('settings.preferences.uiCustomization') }}
      </h2>

      <ToggleButton
        :title="t('settings.preferences.darkMode')"
        :description="t('settings.preferences.darkModeDescription')"
        :value="settings.darkMode"
        @toggle="toggleDarkMode"
      />

      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-gray-900 dark:text-gray-100">
            {{ t('settings.preferences.accentColor') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('settings.preferences.accentColorDescription') }}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            v-for="color in predefinedColors"
            :key="color.value"
            class="w-8 h-8 transition-all rounded-full cursor-pointer ring-offset-2 ring-offset-white dark:ring-offset-gray-800"
            :class="settings.accentColor === color.value
              ? 'ring-2 ring-gray-700 dark:ring-white'
              : 'ring-1 ring-gray-300 dark:ring-gray-600 hover:ring-gray-400 dark:hover:ring-gray-500'"
            :style="{ backgroundColor: color.value }"
            @click="updateSetting('accentColor', color.value)"
          />
        </div>
      </div>

      <!-- UI Scale Slider -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-gray-900 dark:text-gray-100">
            {{ t('settings.preferences.uiScale') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('settings.preferences.uiScaleDescription') }} ({{ settings.uiScale || 100 }}%)
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-500 dark:text-gray-400">50%</span>
          <input
            type="range"
            min="50"
            max="150"
            step="10"
            :value="settings.uiScale || 100"
            class="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-accent-500"
            @input="updateUIScale($event.target.value)"
          >
          <span class="text-sm text-gray-500 dark:text-gray-400">150%</span>
          <button
            class="px-2 py-1 text-xs text-gray-600 transition-colors bg-gray-100 rounded hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            @click="updateUIScale(100)"
          >
            {{ t('common.reset') }}
          </button>
        </div>
      </div>

      <!-- Language Selector -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-gray-900 dark:text-gray-100">
            {{ t('settings.preferences.language') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('settings.preferences.languageDescription') }}
          </p>
        </div>
        <select
          :value="settings.language"
          class="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-lg cursor-pointer dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
          @change="changeLanguage($event.target.value)"
        >
          <option
            v-for="lang in SUPPORTED_LANGUAGES"
            :key="lang.code"
            :value="lang.code"
          >
            {{ lang.nativeName }}
          </option>
        </select>
      </div>
    </div>

    <!-- Search Options -->
    <div class="space-y-6">
      <h2
        class="pb-2 text-lg font-medium text-gray-900 border-b border-gray-200 dark:text-gray-100 dark:border-gray-700"
      >
        {{ t('settings.preferences.searchTypes') }}
      </h2>

      <ToggleButton
        :title="t('settings.preferences.showFavorites')"
        :description="t('settings.preferences.showFavoritesDescription')"
        :value="settings.showFavorites"
        @toggle="() => updateSetting('showFavorites', !settings.showFavorites)"
      />

      <div class="space-y-4">
        <div class="space-y-2">
          <ToggleButton
            v-for="type in settings.includedSearchTypes"
            :key="type.name"
            :title="t(`settings.preferences.searchTypeNames.${type.name}`)"
            :description="t('settings.preferences.searchTypesDescription')"
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
        {{ t('settings.preferences.searchPosition') }}
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
        {{ t('settings.preferences.behavior') }}
      </h2>

      <ToggleButton
        :title="t('settings.preferences.autostart')"
        :description="t('settings.preferences.autostartDescription')"
        :value="settings.autostart"
        @toggle="toggleAutostart"
      />

      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-gray-900 dark:text-gray-100">
            {{ t('settings.preferences.searchShortcut') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('settings.preferences.searchShortcutDescription') }}
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
