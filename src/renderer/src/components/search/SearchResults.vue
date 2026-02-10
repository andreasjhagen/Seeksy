<script setup>
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContextMenu } from '../../composables/useContextMenu'
import { useKeyboardNavigation } from '../../composables/useKeyboardNavigation'
import { useSearchActions } from '../../composables/useSearchActions'
import { RESULT_TYPES, useSearchResultsStore } from '../../stores/search-results-store'
import { useSelectionStore } from '../../stores/selection-store'
import { useSettingsStore } from '../../stores/settings-store'
import AppResults from './ext-applications/AppResults.vue'
import DiskResults from './ext-disk/DiskResults.vue'
import EmojiResults from './ext-emoji/EmojiResults.vue'

const { t } = useI18n()

// Create a global reactive reference for dragged section type
// This will be provided to all ResultSection components
const draggedSectionType = { value: ref(null) }
provide('draggedSectionType', draggedSectionType)

// Store references and composables
const searchStore = useSearchResultsStore()
const settingsStore = useSettingsStore()
const selectionStore = useSelectionStore()
const contextMenu = useContextMenu()
const diskResultsRef = ref(null)
const resultsContainer = ref(null)

// Destructure search actions
const {
  navigateVertical,
  navigateHorizontal,
  navigateSection,
  initializeSelection,
  getVisibleSections,
} = useKeyboardNavigation()

const {
  handleLaunch,
  handleOpenFile,
  handleShowInDirectory,
  handleCopyEmoji,
} = useSearchActions()

const { isLoading, hasSearched, hasAnyResults } = storeToRefs(searchStore)

/**
 * Get result types with content, sorted by either custom order or default priority
 */
const availableResultTypes = computed(() => {
  // Get result types with content
  const resultTypes = searchStore.resultGroups.filter(rt => rt.content.length > 0)

  // Early return if no results or no custom order
  if (!resultTypes.length)
    return []

  const customOrder = settingsStore.settings.sectionOrder
  if (!customOrder || !customOrder.length) {
    return resultTypes.sort((a, b) => a.priority - b.priority)
  }

  // Create a map for efficient lookups - O(1) access
  const orderMap = new Map(customOrder.map((name, index) => [name, index]))

  // Sort by custom order or priority
  return resultTypes.sort((a, b) => {
    const aOrder = orderMap.has(a.name) ? orderMap.get(a.name) : Number.MAX_SAFE_INTEGER
    const bOrder = orderMap.has(b.name) ? orderMap.get(b.name) : Number.MAX_SAFE_INTEGER

    // If both have custom order, use it
    if (aOrder !== Number.MAX_SAFE_INTEGER && bOrder !== Number.MAX_SAFE_INTEGER) {
      return aOrder - bOrder
    }

    // If only one has custom order, prioritize it
    if (aOrder !== Number.MAX_SAFE_INTEGER)
      return -1
    if (bOrder !== Number.MAX_SAFE_INTEGER)
      return 1

    // Fall back to default priority
    return a.priority - b.priority
  })
})

// Create Sets for faster lookups
const collapsedSectionsSet = computed(() =>
  new Set(settingsStore.settings.collapsedSections || []),
)

const enabledSearchTypesMap = computed(() => {
  const map = new Map()
  if (!settingsStore.settings.includedSearchTypes)
    return map

  for (const type of settingsStore.settings.includedSearchTypes) {
    map.set(type.name, type.enabled !== false) // default to true if not specified
  }
  return map
})

/**
 * Check if a section is collapsed
 */
function isSectionCollapsed(sectionName) {
  return collapsedSectionsSet.value.has(sectionName)
}

/**
 * Check if a search type is enabled in settings
 */
function isSearchTypeEnabled(typeName) {
  return enabledSearchTypesMap.value.get(typeName) !== false
}

/**
 * Handle section collapse/expand toggling
 */
function handleSectionCollapse(sectionName, isCollapsed) {
  // Get current collapsed sections
  const collapsedSections = [...(settingsStore.settings.collapsedSections || [])]
  const index = collapsedSections.indexOf(sectionName)

  // Check if state actually changed to avoid unnecessary updates
  if (isCollapsed && index === -1) {
    collapsedSections.push(sectionName)
  }
  else if (!isCollapsed && index !== -1) {
    collapsedSections.splice(index, 1)
  }
  else {
    // No change needed
    return
  }

  // Save to settings
  settingsStore.updateSetting('collapsedSections', collapsedSections)

  // If we're collapsing the current section, reset selection
  if (isCollapsed && selectionStore.selectedSection === sectionName) {
    selectionStore.clearSelection()
    nextTick(() => initializeSelection())
  }
}

/**
 * Handle section reordering with optimized updates
 */
function handleSectionReorder({ from, to }) {
  // Get current order or initialize with default order
  let currentOrder = [...(settingsStore.settings.sectionOrder || [])]

  // If current order is empty, initialize with default order from visible sections
  if (currentOrder.length === 0) {
    currentOrder = availableResultTypes.value.map(rt => rt.name)
  }

  // Find indices
  const fromIndex = currentOrder.indexOf(from)
  const toIndex = currentOrder.indexOf(to)

  // Add sections if they don't exist in the order
  if (fromIndex === -1)
    currentOrder.push(from)
  if (toIndex === -1)
    currentOrder.push(to)

  // Get updated indices
  const fromIndexUpdated = currentOrder.indexOf(from)
  const toIndexUpdated = currentOrder.indexOf(to)

  // No change needed if indices are the same
  if (fromIndexUpdated === toIndexUpdated)
    return

  // Reorder the array efficiently
  currentOrder.splice(fromIndexUpdated, 1) // Remove the 'from' item

  // Calculate new position for insertion
  const newPosition = fromIndexUpdated < toIndexUpdated
    ? toIndexUpdated - 1 // Moving down (adjust for removal)
    : toIndexUpdated // Moving up

  currentOrder.splice(newPosition, 0, from) // Insert at the new position

  // Save the new order to settings
  settingsStore.updateSetting('sectionOrder', currentOrder)
}

/**
 * Execute action for the currently selected item
 * If no item is selected, select and activate the first item
 */
function handleSelectedItem() {
  // If no item is selected, initialize selection and activate the first item
  if (!selectionStore.selectedItem) {
    const initialized = initializeSelection()
    if (!initialized || !selectionStore.selectedItem) {
      return
    }
  }

  const resultType = searchStore.getResultTypeByName(selectionStore.selectedSection)
  if (!resultType)
    return

  // Execute appropriate action based on the section type
  switch (resultType.name) {
    case RESULT_TYPES.DISK:
      handleOpenFile(selectionStore.selectedItem)
      break
    case RESULT_TYPES.APPLICATION:
      handleLaunch(selectionStore.selectedItem)
      break
    case RESULT_TYPES.EMOJI:
      handleCopyEmoji(selectionStore.selectedItem.char)
      break
  }
}

/**
 * Handle item focus event
 */
function handleItemFocus(item, section) {
  selectionStore.setSelectedItem(item, section)
}

/**
 * Initialize selection when container is focused
 */
function onResultsFocus() {
  if (!selectionStore.selectedItem && hasAnyResults.value) {
    initializeSelection()
  }
}

// Initialize selection when component is mounted
onMounted(() => {
  if (hasAnyResults.value) {
    // Use requestAnimationFrame for smooth initialization after DOM is ready
    requestAnimationFrame(() => {
      initializeSelection()
    })
  }
})

// Watch for changes that might affect selection
watch(
  [
    () => searchStore.resultsUpdateCounter,
    () => settingsStore.settings.includedSearchTypes,
    () => settingsStore.settings.collapsedSections,
  ],
  () => {
    // Reset selection if current section is no longer visible
    const visibleSections = getVisibleSections()
    if (visibleSections.length > 0 && !visibleSections.includes(selectionStore.selectedSection)) {
      selectionStore.clearSelection()
      if (hasAnyResults.value) {
        nextTick(() => initializeSelection())
      }
    }
  },
)
</script>

<template>
  <div
    v-if="hasSearched"
    ref="resultsContainer"
    class="p-6 space-y-3 overflow-y-auto bg-gray-200 shadow-md rounded-2xl dark:bg-gray-800 focus:outline-hidden scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
    tabindex="0"
    @keydown.up.prevent="navigateVertical('up')"
    @keydown.down.prevent="navigateVertical('down')"
    @keydown.left.prevent="navigateHorizontal('left')"
    @keydown.right.prevent="navigateHorizontal('right')"
    @keydown.tab.exact.prevent="navigateSection()"
    @keydown.shift.tab.exact.prevent="navigateSection(true)"
    @keydown.enter="handleSelectedItem"
    @focus="onResultsFocus"
  >
    <template v-if="hasAnyResults">
      <!-- Render each result type if it has content and is enabled -->
      <template v-for="resultType in availableResultTypes" :key="resultType.name">
        <template v-if="resultType.content.length && isSearchTypeEnabled(resultType.name)">
          <!-- Application results -->
          <AppResults
            v-if="resultType.name === RESULT_TYPES.APPLICATION"
            :result-type="resultType.name"
            :is-collapsed="isSectionCollapsed(resultType.name)"
            @toggle-collapse="handleSectionCollapse"
            @section-reorder="handleSectionReorder"
            @contextmenu="contextMenu.handleContextMenu"
            @launch="handleLaunch"
            @item-focus="handleItemFocus"
          />

          <!-- Emoji results -->
          <EmojiResults
            v-else-if="resultType.name === RESULT_TYPES.EMOJI"
            custom-grid-gap="gap-1"
            :result-type="resultType.name"
            :is-collapsed="isSectionCollapsed(resultType.name)"
            @toggle-collapse="handleSectionCollapse"
            @section-reorder="handleSectionReorder"
            @copy="handleCopyEmoji"
            @item-focus="handleItemFocus"
            @contextmenu="contextMenu.handleContextMenu"
          />

          <!-- Disk results -->
          <DiskResults
            v-else-if="resultType.name === RESULT_TYPES.DISK"
            ref="diskResultsRef"
            :result-type="resultType.name"
            :is-collapsed="isSectionCollapsed(resultType.name)"
            @toggle-collapse="handleSectionCollapse"
            @section-reorder="handleSectionReorder"
            @contextmenu="contextMenu.handleContextMenu"
            @open-file="handleOpenFile"
            @show-in-directory="handleShowInDirectory"
            @item-focus="handleItemFocus"
          />
        </template>
      </template>
    </template>

    <!-- No results message -->
    <div
      v-if="!hasAnyResults && searchStore.query && !isLoading && searchStore.hasSearched"
      class="p-6 text-center transition-all duration-300"
    >
      <div class="flex flex-col items-center space-y-4">
        <span class="text-4xl">🔍</span>
        <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200">
          {{ t('search.noResults') }}
        </h3>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('search.noResultsHint') }}
        </p>
      </div>
    </div>
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

/* Fix the scrollbar issue in dark mode */
.dark .scrollbar-thumb-gray-400::-webkit-scrollbar-thumb {
  background-color: #4b5563;
}
</style>
