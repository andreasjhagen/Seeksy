<script setup>
import { onClickOutside } from '@vueuse/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'
import ContextMenu from '../components/search/ContextMenu.vue'
import FavoriteResults from '../components/search/favorites/FavoriteResults.vue'
import NoWatchedFolders from '../components/search/NoWatchedFolders.vue'
import SearchInterface from '../components/search/SearchInterface.vue'
import SearchResults from '../components/search/SearchResults.vue'
import { useContextMenu } from '../composables/useContextMenu'
import { useKeyboardNavigation } from '../composables/useKeyboardNavigation'
import { useSearchActions } from '../composables/useSearchActions'
import { useWatcherStatus } from '../composables/useWatcherStatus'
import { useSearchResultsStore } from '../stores/search-results-store'
import { useSelectionStore } from '../stores/selection-store'
import { useSettingsStore } from '../stores/settings-store'

const searchStore = useSearchResultsStore()
const selectionStore = useSelectionStore()
const searchInterface = ref(null)
const settingsStore = useSettingsStore()
const contextMenu = useContextMenu()
const { handleOpenFile, handleShowInDirectory, handleLaunch, handleCopyEmoji } = useSearchActions()
const { focusResults, initializeSelection } = useKeyboardNavigation()

const hasResults = computed(() => {
  return (
    searchStore.hasAnyResults
    || (searchStore.isFilteredMode && searchStore.hasActiveFilters)
  )
})

function toggleSearchMode() {
  searchStore.toggleSearchMode()
}

const searchContainer = ref(null)

onClickOutside(
  searchContainer,
  (event) => {
    window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
  },
  {
    ignore: ['.context-menu', '.dialog-modal', '.popover-thumbnail'],
  },
)

const { hasWatchedFolders, updateWatcherStatus } = useWatcherStatus()

const animationKey = ref(0)

function resetAnimation() {
  // Increment the key to force Vue to re-render the element
  // which will restart the animation
  animationKey.value++
}

function handleItemEdited() {
  searchStore.refreshSearch()
}

// Handle keyboard shortcuts at the page level
function handleKeyDown(event) {
  // ESC - Exit the search
  if (event.key === 'Escape') {
    window.api.invoke(IPC_CHANNELS.HIDE_MAIN_WINDOW)
    return
  }

  // Handle search input focus (Ctrl+F)
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault()
    const searchInputEl = searchInterface.value?.$el.querySelector('input')
    if (searchInputEl) {
      searchInputEl.focus()
      searchInputEl.select()
    }
  }

  // No need for other keyboard handling here as it's managed in the child components
}

// Initial status update on mount
onMounted(async () => {
  // Initial status update
  await updateWatcherStatus()

  // Set up global keyboard event listener
  window.addEventListener('keydown', handleKeyDown)

  // Clean up event listener
  return () => {
    window.removeEventListener('keydown', handleKeyDown)
  }
})

// Update status when window shows - Use an async function to properly handle the Promise
window.api.on(IPC_CHANNELS.SHOW_MAIN_WINDOW, async () => {
  resetAnimation()
  console.log('Window shown, updating watcher status')

  // Initialize selection if there are results
  if (searchStore.hasAnyResults && !selectionStore.selectedItem) {
    await nextTick()
    initializeSelection()
  }

  // Use try/catch to handle potential errors in the status update
  try {
    await updateWatcherStatus()
    console.log('Watcher status updated successfully')
  }
  catch (error) {
    console.error('Error updating watcher status:', error)
  }
})
</script>

<template>
  <div
    :key="animationKey"
    class="fixed inset-0 w-screen h-screen bg-black/0 animate-fade-in"
    @keydown="handleKeyDown"
  >
    <div class="flex flex-col items-center justify-center w-full h-full py-8">
      <div
        ref="searchContainer"
        class="search-container flex flex-col w-full max-w-(--breakpoint-sm) px-4 max-h-[calc(100vh-4rem)] overflow-hidden"
      >
        <div class="flex flex-col gap-4 overflow-hidden">
          <SearchInterface
            ref="searchInterface"
            class="shrink-0"
            :is-filtered-mode="searchStore.isFilteredMode"
            :is-loading="searchStore.isLoading"
            @toggle-search-mode="toggleSearchMode"
          />
          <NoWatchedFolders v-if="!hasWatchedFolders" class="shrink-0" />
          <FavoriteResults v-if="!searchStore.query && !hasResults && settingsStore.settings.showFavorites" class="overflow-y-auto" />
          <SearchResults v-if="hasResults || (searchStore.query && searchStore.hasSearched)" class="overflow-y-auto" />
        </div>
      </div>
    </div>

    <!-- Global context menu component -->
    <ContextMenu @item-edited="handleItemEdited" />
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  0% {
    background-color: rgba(0, 0, 0, 0);
  }
  15% {
    /* Start changing at the 0.2 second mark (15% of total) */
    background-color: rgba(0, 0, 0, 0);
  }
  100% {
    background-color: rgba(0, 0, 0, 0.3);
  }
}

.animate-fade-in {
  animation: fadeIn 0.6s ease-in-out forwards;
}

/* Apply UI scale transform to the search container */
.search-container {
  transform: scale(var(--ui-scale, 1));
  transform-origin: center center;
}
</style>
