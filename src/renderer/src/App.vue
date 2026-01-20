<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { IPC_CHANNELS } from '../../main/ipc/ipcChannels'
import { provideContextMenuService } from './composables/useContextMenu'
import { useSearchResultsStore } from './stores/search-results-store'
import { useSelectionStore } from './stores/selection-store'
import { useSettingsStore } from './stores/settings-store'
import { generateColorPalette } from './utils/colorUtils'

const contentRef = ref(null)
const initializationStatus = ref('pending')
const router = useRouter()
const settingsStore = useSettingsStore()
const selectionStore = useSelectionStore()
const searchStore = useSearchResultsStore()

// Provide the context menu service to the entire application
// This function call sets up the Vue provide/inject
provideContextMenuService()

// Theme management
watch(
  () => settingsStore.settings.darkMode,
  (dark) => {
    document.documentElement.classList.toggle('dark', dark)
  },
)

// Apply accent color
watch(
  () => settingsStore.settings.accentColor,
  (color) => {
    const palette = generateColorPalette(color)
    if (palette) {
      Object.entries(palette).forEach(([shade, value]) => {
        document.documentElement.style.setProperty(`--accent-color-${shade}`, value)
      })
      // Set the default accent color to the 500 shade
      document.documentElement.style.setProperty('--accent-color', palette[500])
    }
  },
  { immediate: true },
)

// Apply UI scale via CSS custom property
// This only affects the search interface, not settings
watch(
  () => settingsStore.settings.uiScale,
  (scale) => {
    const scaleValue = (scale || 100) / 100
    document.documentElement.style.setProperty('--ui-scale', scaleValue.toString())
  },
  { immediate: true },
)

// --- Window Navigation Handlers ---
// Sets up global redirectors for window navigation
// we are sending them from the main process to the different windows, so we can have two different ones.
function setupWindowRedirection() {
  window.api.on(IPC_CHANNELS.SHOW_SETTINGS_PAGE, () => router.push({ name: 'settings' }))
  window.api.on(IPC_CHANNELS.SHOW_SEARCH_PAGE, () => router.push({ name: 'search' }))
}

// Sets up handlers specific to the search window
function setupSearchWindowHandlers() {
  window.api.on(IPC_CHANNELS.SEARCH_KEYCOMBO_DOWN, async () => {
    await window.api.invoke(IPC_CHANNELS.SHOW_MAIN_WINDOW)
  })

  window.api.on(IPC_CHANNELS.SEARCH_WINDOW_FOCUS_LOST, async () => {
    // Cancel any pending search operations to prevent stale results
    searchStore.cancelPendingSearch()
    // Always clear and reinitialize selection when focusing results
    selectionStore.clearSelection()
    await window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
  })
}

// --- Global Keyboard Event Handlers ---
// Handles the escape key press to navigate between search and settings pages
function handleEscapeKey(event) {
  if (event.key === 'Escape') {
    const isSettingsPage = router.currentRoute.value.name === 'settings'
    if (isSettingsPage) {
      // If on settings page, navigate to search page
      window.api.invoke(IPC_CHANNELS.SHOW_SEARCH_PAGE)
    }
    else {
      // Otherwise, hide main window and navigate to search page
      window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
      router.push({ name: 'search' })
    }
  }
}

// --- Initialization Function ---
// Initializes the application by fetching settings, setting up listeners, and initializing the indexer
async function initialize() {
  try {
    await settingsStore.initialize()

    setupWindowRedirection()
    setupSearchWindowHandlers()

    const success = await window.api.invoke(IPC_CHANNELS.INDEXER_INITIALIZE)
    initializationStatus.value = success ? 'success' : 'error'

    if (!success) {
      console.error('Failed to initialize indexer')
    }
  }
  catch (error) {
    console.error('Initialization error:', error)
    initializationStatus.value = 'error'
  }
}

// --- Lifecycle Hooks ---
onMounted(() => {
  initialize() // Initialize the application

  // Add global keydown listener for handling escape key
  window.addEventListener('keydown', handleEscapeKey)
})

onBeforeUnmount(() => {
  // Remove global keydown listener
  window.removeEventListener('keydown', handleEscapeKey)
})
</script>

<template>
  <div
    ref="contentRef"
    class="flex items-center justify-center w-screen h-screen max-h-screen text-gray-900 dark:text-gray-50"
  >
    <router-view />
  </div>
</template>
