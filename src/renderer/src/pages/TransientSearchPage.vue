<script setup>
import { onClickOutside } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { IPC_CHANNELS } from '../../../main/ipc/ipcChannels'
import FavoriteResults from '../components/search/FavoriteResults.vue'
import NoWatchedFolders from '../components/search/NoWatchedFolders.vue'
import SearchInterface from '../components/search/SearchInterface.vue'
import SearchResults from '../components/search/SearchResults.vue'
import { useWatcherStatus } from '../composables/useWatcherStatus'
import { useSearchResultsStore } from '../stores/search-results-store'
import { useSettingsStore } from '../stores/settings-store'

const searchStore = useSearchResultsStore()
const searchInterface = ref(null)
const settingsStore = useSettingsStore()

const hasResults = computed(() => {
  return (
    searchStore.diskResults.length || searchStore.applicationResults.length || searchStore.query
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

// Update status when window shows
window.api.on(IPC_CHANNELS.SHOW_MAIN_WINDOW, () => {
  resetAnimation()
  updateWatcherStatus()
})
onMounted(updateWatcherStatus)
</script>

<template>
  <div
    :key="animationKey"
    class="fixed inset-0 w-screen h-screen bg-black/0 animate-fade-in"
  >
    <div class="flex items-center justify-center w-full h-full">
      <div ref="searchContainer" class="flex flex-col w-full max-w-(--breakpoint-sm) px-4">
        <div class="flex flex-col gap-4">
          <SearchInterface
            ref="searchInterface"
            :is-advanced-mode="searchStore.isAdvancedMode"
            :is-loading="searchStore.isLoading"
            @toggle-search-mode="toggleSearchMode"
          />
          <NoWatchedFolders v-if="!hasWatchedFolders" />
          <FavoriteResults v-if="!searchStore.query && !hasResults && settingsStore.settings.showFavorites" />
          <SearchResults
            v-if="hasResults"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  0% {
    background-color: rgba(0, 0, 0, 0);
  }
  15% {
    /* Start changing at the 0.2 second mark (33.33% of 0.6s total) */
    background-color: rgba(0, 0, 0, 0);
  }
  100% {
    background-color: rgba(0, 0, 0, 0.3);
  }
}

.animate-fade-in {
  animation: fadeIn 0.6s ease-in-out forwards; /* 0.6s total: 0.2s delay + 0.4s transition */
}
</style>
