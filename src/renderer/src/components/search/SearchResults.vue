<script setup>
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useContextMenu } from '../../composables/useContextMenu'
import { useKeyboardNavigation } from '../../composables/useKeyboardNavigation'
import { useSearchActions } from '../../composables/useSearchActions'
import { useSearchResultsStore } from '../../stores/search-results-store'
import { useSelectionStore } from '../../stores/selection-store'
import { useSettingsStore } from '../../stores/settings-store'
import ContextMenu from './ContextMenu.vue'
import AppResults from './result-sections/AppResults.vue'
import DiskResults from './result-sections/DiskResults.vue'
import EmojiResults from './result-sections/EmojiResults.vue'

const searchStore = useSearchResultsStore()
const settingsStore = useSettingsStore()
const selectionStore = useSelectionStore()
const diskResultsRef = ref(null)
const { navigateSelection, navigateTab, initializeSelection, getVisibleSections } = useKeyboardNavigation()
const { handleLaunch, handleOpenFile, handleShowInDirectory, handleCopyEmoji } = useSearchActions()

const { isLoading, hasSearched, hasAnyResults } = storeToRefs(searchStore)
const results = computed(() => searchStore.getAllResults)

const { showContextMenu, contextMenuPosition, handleContextMenu, handleContextMenuClose } = useContextMenu()

function isSearchTypeEnabled(typeName) {
  return (
    settingsStore.settings.includedSearchTypes?.find(type => type.name === typeName)?.enabled
    ?? false
  )
}

function handleSelectedItem() {
  if (!selectionStore.selectedItem)
    return

  switch (selectionStore.selectedSection) {
    case 'apps':
      handleLaunch(selectionStore.selectedItem)
      break
    case 'emoji':
      handleCopyEmoji(selectionStore.selectedItem.char)
      break
    case 'files':
      handleOpenFile(selectionStore.selectedItem)
      break
  }
}

onMounted(() => {
  if (hasAnyResults.value) {
    initializeSelection()
  }
})

// Watch for changes in results or visible sections to reset selection and ensure keyboard nav adapts
watch(
  [
    () => results.value.applications.length,
    () => results.value.emojis.length,
    () => results.value.disk.length,
    () => settingsStore.settings.includedSearchTypes,
  ],
  () => {
    // Reset selection if current section is no longer visible
    const visibleSections = getVisibleSections()
    if (!visibleSections.includes(selectionStore.selectedSection)) {
      selectionStore.clearSelection()
      if (hasAnyResults.value) {
        initializeSelection()
      }
    }
  },
)

const handleTab = event => navigateTab(event.shiftKey)

const resultsContainer = ref(null)

function onResultsFocus() {
  if (!selectionStore.selectedItem) {
    initializeSelection()
  }
}

function handleItemFocus(item, section) {
  selectionStore.setSelectedItem(item, section)
}
</script>

<template>
  <div
    v-if="hasSearched"
    ref="resultsContainer"
    class="p-6 space-y-3 bg-gray-200 shadow-md rounded-2xl dark:bg-gray-800 focus:outline-hidden"
    tabindex="0"
    @keydown.up.prevent="navigateSelection('up')"
    @keydown.down.prevent="navigateSelection('down')"
    @keydown.left.prevent="navigateSelection('left')"
    @keydown.right.prevent="navigateSelection('right')"
    @keydown.tab.prevent="handleTab"
    @keydown.enter="handleSelectedItem"
    @focus="onResultsFocus"
  >
    <template v-if="hasAnyResults">
      <AppResults
        v-if="results.applications.length && isSearchTypeEnabled('apps')"
        @contextmenu="handleContextMenu"
        @launch="handleLaunch"
        @item-focus="handleItemFocus"
      />

      <EmojiResults
        v-if="results.emojis.length && isSearchTypeEnabled('emoji')"
        @copy="handleCopyEmoji"
        @item-focus="handleItemFocus"
      />

      <DiskResults
        v-if="results.disk.length && isSearchTypeEnabled('files')"
        ref="diskResultsRef"
        @contextmenu="handleContextMenu"
        @open-file="handleOpenFile"
        @show-in-directory="handleShowInDirectory"
        @item-focus="handleItemFocus"
      />
    </template>

    <div
      v-if="!hasAnyResults && searchStore.query && !isLoading && searchStore.hasSearched"
      class="p-6 text-center transition-all duration-300"
    >
      <div class="flex flex-col items-center space-y-4">
        <span class="text-4xl">🔍</span>
        <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200">
          No Results Found
        </h3>
        <p class="text-gray-600 dark:text-gray-400">
          Try adjusting your search terms
        </p>
      </div>
    </div>

    <ContextMenu
      :show="showContextMenu"
      :position="contextMenuPosition"
      @close="handleContextMenuClose"
      @open-file="handleOpenFile"
      @show-in-directory="handleShowInDirectory"
    />
  </div>
</template>

<style>
/* Custom scrollbar styles using webkit */
.scrollbar-thin::-webkit-scrollbar {
  width: 8px;
}

.scrollbar-thumb-gray-400::-webkit-scrollbar-thumb {
  background-color: #9ca3af;
  border-radius: 4px;
}

.scrollbar-thumb-gray-600::-webkit-scrollbar-thumb {
  background-color: #4b5563;
  border-radius: 4px;
}

.scrollbar-track-transparent::-webkit-scrollbar-track {
  background-color: transparent;
  transition: background-color 0.3s ease;
}

.scrollbar-track-transparent:hover::-webkit-scrollbar-track {
  background-color: rgba(128, 128, 128, 0.1);
}

.hover\:scrollbar-thumb-gray-500:hover::-webkit-scrollbar-thumb {
  background-color: #6b7280;
}
</style>
