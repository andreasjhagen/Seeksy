<script setup>
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref } from 'vue'
import { IPC_CHANNELS } from '../../../../main/ipc/ipcChannels'
import { useKeyboardNavigation } from '../../composables/useKeyboardNavigation'
import { useSearchResultsStore } from '../../stores/search-results-store'
import OpenSettingsButton from './OpenSettingsButton.vue'

const emit = defineEmits(['toggle-search-mode'])
const searchStore = useSearchResultsStore()
const { filters, isLoading, isAdvancedMode } = storeToRefs(searchStore)
const { hasActiveFilters } = storeToRefs(searchStore)

const searchInput = ref(null)
const searchQuery = computed({
  get: () => searchStore.query,
  set: value => searchStore.setQuery(value),
})

onMounted(() => {
  focusSearchInput()
  window.api.on(IPC_CHANNELS.FOCUS_SEARCH, focusSearchInput)
})

function focusSearchInput() {
  nextTick(() => {
    if (searchInput.value) {
      searchInput.value.focus()
      searchInput.value.select() // This will highlight/select all text in the input
    }
  })
}

function handleSearchInput() {
  searchStore.debouncedSearch()
}

function resetFilters() {
  searchStore.resetFilters()
  searchStore.search() // Use the unified search method
}

function toggleFilter(filterType, value) {
  searchStore.toggleFilter(filterType, value)
  searchStore.search() // Use the unified search method
}

function handleToggleMode() {
  searchStore.toggleSearchMode()
}

const { focusResults } = useKeyboardNavigation()

const { hasAnyResults } = storeToRefs(searchStore)

// Update the focus handler to be more robust
async function handleFocusResults(event) {
  if (hasAnyResults.value) {
    event.preventDefault()
    await focusResults()
  }
}

defineExpose({
  search: searchStore.search,
})
</script>

<template>
  <div
    class="p-4 transition-all duration-300 bg-gray-200 border border-gray-200 shadow-lg dark:bg-gray-800 rounded-2xl dark:border-gray-700"
  >
    <!-- Search Form -->
    <form class="space-y-4" @submit.prevent="handleSearchInput">
      <div class="flex items-center space-x-4">
        <div
          class="flex items-center flex-1 p-2 transition-all bg-white border border-gray-200 shadow-xs dark:bg-gray-700 rounded-xl dark:border-gray-600"
        >
          <input
            ref="searchInput"
            v-model="searchQuery"
            placeholder="Search files, folders, apps..."
            class="flex-1 p-2 text-gray-800 placeholder-gray-400 bg-transparent border-none outline-hidden dark:text-gray-100 dark:placeholder-gray-500"
            @input="searchStore.debouncedSearch"
            @keydown.down.prevent="handleFocusResults"
            @keydown.tab.prevent="handleFocusResults"
          >
          <div class="flex items-center gap-1">
            <button
              title="Toggle Advanced Search"
              type="button"
              class="flex items-center justify-center p-2 text-gray-600 transition-colors rounded-lg cursor-pointer dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              @click="handleToggleMode"
            >
              <span class="material-symbols-outlined">tune</span>
            </button>
            <OpenSettingsButton />
          </div>
        </div>
      </div>

      <!-- Advanced Search Filters -->
      <div
        v-if="isAdvancedMode"
        class="flex flex-col gap-2 p-4 border border-gray-200 bg-gray-50 dark:bg-gray-700 rounded-xl dark:border-gray-600"
      >
        <!-- File Type Filter -->
        <div class="flex flex-wrap gap-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">File Types:</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="type in ['folder', 'image', 'document', 'audio', 'video']"
              :key="type"
              class="px-3 py-1 text-sm font-medium transition-all duration-200 rounded-lg cursor-pointer"
              :class="
                filters.type.includes(type)
                  ? 'bg-accent-500 hover:bg-accent text-white shadow-xs'
                  : 'bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-500 border border-gray-200 dark:border-gray-500'
              "
              @click="toggleFilter('type', type)"
            >
              {{
                {
                  folder: 'Folders',
                  image: 'Images',
                  document: 'Documents',
                  audio: 'Audio',
                  video: 'Video',
                }[type]
              }}
            </button>
          </div>
        </div>

        <!-- Date Range -->
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">From:</label>
            <input
              v-model="filters.dateRange.from"
              type="date"
              class="w-full p-2 mt-1 text-gray-700 bg-white border border-gray-200 rounded-lg dark:bg-gray-600 dark:border-gray-500 dark:text-gray-200"
            >
          </div>
          <div class="flex-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">To:</label>
            <input
              v-model="filters.dateRange.to"
              type="date"
              class="w-full p-2 mt-1 text-gray-700 bg-white border border-gray-200 rounded-lg dark:bg-gray-600 dark:border-gray-500 dark:text-gray-200"
            >
          </div>
        </div>

        <!-- Reset Filters -->
        <button
          v-if="hasActiveFilters"
          class="px-4 py-2 text-sm font-medium text-red-600 transition-colors duration-200 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
          @click="resetFilters"
        >
          Reset Filters
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
input[type='date'] {
  color-scheme: light dark;
}

input[type='date']::-webkit-calendar-picker-indicator {
  filter: invert(0.5);
}

.dark input[type='date']::-webkit-calendar-picker-indicator {
  filter: invert(0.8);
}

/* Transition effects */
.v-enter-active,
.v-leave-active {
  transition: opacity 0.3s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
